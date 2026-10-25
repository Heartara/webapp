import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomBytes,randomUUID,createCipheriv,createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';
import {requestError} from '../booking-rules.js';
export const SERVICES={
 'reiki-60':'In-person Reiki · 60 minutes · AUD $100','reiki-90':'In-person Reiki · 90 minutes · AUD $120',
 'distance-60':'Distance Reiki · 60 minutes · AUD $100','package-60':'3 × 60 minutes · AUD $280',
 'package-90':'3 × 90 minutes · AUD $340','package-distance':'3 × distance Reiki · AUD $280',
 'munay-individual':'Individual nine Munay Ki rites · AUD $450','munay-group':'Small-group nine Munay Ki rites · AUD $300 per person'};
const TOPICS=new Set(['general','reiki','training','munay','ceremony','retreats','oracle','privacy']);
export class InputError extends Error{}
export function validate(input,now=new Date()){
 if(!['enquiry','booking','feedback'].includes(input.kind))throw new InputError('Please choose a valid request type.');
 const clean=(key,max,required=false)=>{const s=typeof input[key]==='string'?input[key].trim():'';if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new InputError('Please check your '+key+'.');return s;};
 const data={kind:input.kind,name:clean('name',100,true),email:clean('email',254,input.kind!=='feedback'),message:clean('message',3000,input.kind!=='booking'),consent:input.consent===true};
 if(data.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(data.email))throw new InputError('Please enter a valid email address.');
 if(!data.consent)throw new InputError('Please confirm your consent before submitting.');
 if(input.website)throw new InputError('Your request could not be accepted.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||''))throw new InputError('Please refresh the form and try again.');
 if(data.kind==='booking'){
  if(!Object.hasOwn(SERVICES,input.service))throw new InputError('Please choose a session.');
  const error=requestError(input.date||'',input.time||'',now);if(error)throw new InputError(error);
  Object.assign(data,{service:input.service,session:SERVICES[input.service],date:input.date,time:input.time,timeZone:'Australia/Brisbane',bookingStatus:'pending'});
 }else if(data.kind==='enquiry'){
  if(!TOPICS.has(input.topic))throw new InputError('Please choose an enquiry topic.');data.topic=input.topic;
 }
 return data;
}
export function createCRM({dbPath,key,now=()=>Date.now()}){
 if(!/^[a-f0-9]{64}$/i.test(key||''))throw Error('CRM_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters.');
 process.umask(0o077);if(dbPath!==':memory:')mkdirSync(dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);if(dbPath!==':memory:')chmodSync(dbPath,0o600);
 db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,request_id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,submission_id TEXT UNIQUE NOT NULL REFERENCES submissions(id),state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,last_error TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);`);
 const secret=Buffer.from(key,'hex');
 function encrypt(data){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret,iv);const value=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),value.toString('base64')].join('.');}
 function decrypt(payload){const [iv,tag,value]=payload.split('.').map(x=>Buffer.from(x,'base64'));const decipher=createDecipheriv('aes-256-gcm',secret,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(value),decipher.final()]).toString('utf8'));}
 function issueToken(){const body=Buffer.from(JSON.stringify({issued:now(),nonce:randomUUID()})).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
 function verifyToken(token){try{const [body,mac,...rest]=(token||'').split('.');if(rest.length||!body||!mac)return false;const expected=createHmac('sha256',secret).update(body).digest();const actual=Buffer.from(mac,'base64url');if(actual.length!==expected.length||!timingSafeEqual(expected,actual))return false;const data=JSON.parse(Buffer.from(body,'base64url'));const age=now()-data.issued;return age>=1500&&age<7200000;}catch{return false;}}
 function rateLimit(ip){const k=createHmac('sha256',secret).update(ip||'unknown').digest('hex'),time=now();db.prepare('DELETE FROM rate_limits WHERE reset_at < ?').run(time);const row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(k);if(row&&row.count>=8)return false;if(row)db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(k);else db.prepare('INSERT INTO rate_limits VALUES(?,1,?)').run(k,time+900000);return true;}
 function lookup(input){const data=validate(input,new Date(now()));const row=db.prepare('SELECT * FROM submissions WHERE request_id=?').get(input.requestId);if(!row)return null;if(JSON.stringify(decrypt(row.payload))!==JSON.stringify(data))throw new InputError('This request identifier is already in use. Please refresh the form.');return {id:row.id,saved:true};}
 function save(input){const data=validate(input,new Date(now()));
  const encrypted=encrypt(data);db.exec('BEGIN IMMEDIATE');
  try{const existing=db.prepare('SELECT * FROM submissions WHERE request_id=?').get(input.requestId);
   if(existing){const old=decrypt(existing.payload);if(JSON.stringify(old)!==JSON.stringify(data))throw new InputError('This request identifier is already in use. Please refresh the form.');db.exec('COMMIT');return {id:existing.id,saved:true};}
   const id=randomUUID();db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?)').run(id,input.requestId,data.kind,now(),encrypted);db.prepare('INSERT INTO outbox(id,submission_id,next_at) VALUES(?,?,?)').run(randomUUID(),id,now());db.exec('COMMIT');return {id,saved:true};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function list(){return db.prepare('SELECT id,kind,created_at,payload FROM submissions ORDER BY created_at DESC LIMIT 100').all().map(row=>({...row,payload:decrypt(row.payload)}));}
 async function deliver(send){
  const due=db.prepare("SELECT * FROM outbox WHERE state!='sent' AND next_at<=? AND lease_until<=? LIMIT 10").all(now(),now());
  for(const row of due){const claimed=db.prepare("UPDATE outbox SET lease_until=? WHERE id=? AND state!='sent' AND lease_until<=?").run(now()+60000,row.id,now());if(!claimed.changes)continue;
   try{const record=db.prepare('SELECT * FROM submissions WHERE id=?').get(row.submission_id);await send({id:record.id,...decrypt(record.payload)});db.prepare("UPDATE outbox SET state='sent',attempts=attempts+1,last_error=NULL,lease_until=0 WHERE id=?").run(row.id);}
   catch{const attempts=row.attempts+1;db.prepare("UPDATE outbox SET state='pending',attempts=?,last_error='delivery_failed',next_at=?,lease_until=0 WHERE id=?").run(attempts,now()+Math.min(3600000,30000*2**Math.min(attempts,7)),row.id);console.warn(JSON.stringify({event:'email_delivery_failed',submissionId:row.submission_id,attempt:attempts}));}
  }
 }
 function retry(id){return db.prepare("UPDATE outbox SET next_at=0,lease_until=0 WHERE submission_id=? AND state!='sent'").run(id).changes;}
 const outbox=()=>db.prepare('SELECT submission_id,state,attempts,last_error,next_at FROM outbox').all();
 return {save,lookup,list,deliver,retry,outbox,issueToken,verifyToken,rateLimit,close:()=>db.close()};
}
export function createMailer(env,fetcher=fetch){return async record=>{
 if(!env.RESEND_API_KEY||!env.MAIL_FROM)throw Error('Email delivery is not configured.');
 // Recipient is fixed server-side. Visitor input cannot select recipients or mail headers.
 const {id,kind,name,email,message,topic,session,date,time}=record;
 const text=['Heartara '+kind+' request','Reference: '+id,'Name: '+name,'Email: '+(email||'not supplied'),topic?'Topic: '+topic:'',session?'Session: '+session:'',date?'Requested: '+date+' '+time+' AEST (pending approval)':'','Message:',message,'Consent recorded: yes.'].filter(Boolean).join('\n');
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'heartara-'+id},body:JSON.stringify({from:env.MAIL_FROM,to:['heartarahealing@gmail.com'],subject:'Heartara '+kind+' request',...(email?{reply_to:email}:{}),text})});
 if(!response.ok)throw Error('Delivery failed');
};}
