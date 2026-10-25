import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createCRM,validate,createMailer} from '../backend/crm.mjs';
import {createApp} from '../server.js';
const key='a'.repeat(64),admin='b'.repeat(40),origin='https://heartara.github.io';
const request=(overrides={})=>({kind:'enquiry',name:'Test visitor',email:'visitor@example.test',message:'A general question',topic:'general',consent:true,requestId:randomUUID(),...overrides});
const wait=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Wait timed out');};
async function serve(t,crm,extra={}){
 const app=createApp({crm,env:{NODE_ENV:'production',TURNSTILE_SECRET:'test',TURNSTILE_SITE_KEY:'test',ADMIN_TOKEN:admin},verifySpam:async token=>token==='valid',sendMail:async()=>{},...extra});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));return 'http://127.0.0.1:'+app.address().port;
}
test('server rejects forged service, missing consent, invalid email and booking times',()=>{
 for(const input of [request({consent:false}),request({email:'bad'}),request({kind:'booking',service:'fake'}),request({kind:'booking',service:'reiki-60',date:'2030-01-05',time:'08:00'}),request({website:'spam'})])assert.throws(()=>validate(input));
 const data=validate(request({kind:'booking',service:'reiki-60',date:'2030-01-05',time:'10:00'}));assert.equal(data.bookingStatus,'pending');assert.equal(data.session,'In-person Reiki · 60 minutes · AUD $100');
});
test('encrypted durable records survive email failure and restart; retry succeeds without duplicate records',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'heartara-crm-')),path=join(folder,'crm.sqlite');let time=Date.now();let crm=createCRM({dbPath:path,key,now:()=>time});
 const input=request();const saved=crm.save(input);assert.equal(saved.saved,true);assert.equal(crm.save(input).id,saved.id);assert.equal(crm.list().length,1);
 assert.throws(()=>crm.save({...input,message:'Different message'}));
 await crm.deliver(async()=>{throw Error('Provider unavailable including secret should not log');});assert.equal(crm.list().length,1);assert.equal(crm.outbox()[0].state,'pending');assert.equal(crm.outbox()[0].last_error,'delivery_failed');
 crm.close();assert.ok(!(await readFile(path)).includes(Buffer.from(input.email)));
 crm=createCRM({dbPath:path,key,now:()=>time});assert.equal(crm.list()[0].payload.email,input.email);crm.retry(saved.id);let count=0;await crm.deliver(async record=>{count++;assert.equal(record.id,saved.id);});assert.equal(count,1);assert.equal(crm.outbox()[0].state,'sent');await crm.deliver(async()=>count++);assert.equal(count,1);crm.close();await rm(folder,{recursive:true});
});
test('API saves before success, rejects cross-origin/spam, and protects CRM records',async t=>{
 let time=Date.now();const crm=createCRM({dbPath:':memory:',key,now:()=>time});t.after(()=>crm.close());const base=await serve(t,crm);
 const token=(await (await fetch(base+'/webapp/api/form-token')).json()).token;time+=2000;
 const payload=request({token,turnstileToken:'valid'});
 const send=(body,customOrigin=origin)=>fetch(base+'/webapp/api/submissions',{method:'POST',headers:{'Content-Type':'application/json',Origin:customOrigin},body:JSON.stringify(body)});
 assert.equal((await send(payload,'https://evil.test')).status,403);assert.equal((await send({...payload,turnstileToken:'invalid'})).status,400);
 const res=await send(payload);assert.equal(res.status,201);const data=await res.json();assert.equal(data.saved,true);assert.equal(crm.list().length,1);
 assert.equal((await send({...payload,turnstileToken:'already-used'})).status,200);assert.equal(crm.list().length,1);
 assert.equal((await fetch(base+'/webapp/api/admin/submissions')).status,401);assert.equal((await fetch(base+'/webapp/admin')).status,401);
 const adminResponse=await fetch(base+'/webapp/api/admin/submissions',{headers:{Authorization:'Bearer '+admin}});assert.equal(adminResponse.status,200);assert.equal((await adminResponse.json()).records.length,1);
 await wait(()=>crm.outbox()[0].state==='sent');
});
test('storage failure and absent backend never return a false success',async t=>{
 const broken={issueToken:()=> 'valid',verifyToken:()=>true,rateLimit:()=>true,save:()=>{throw Error('disk full');},deliver:async()=>{}};
 const base=await serve(t,broken);const res=await fetch(base+'/api/submissions',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(request({token:'valid',turnstileToken:'valid'}))});assert.equal(res.status,503);assert.notEqual((await res.json()).saved,true);
 const unavailable=await serve(t,null);assert.equal((await fetch(unavailable+'/api/form-token')).status,503);
});
test('production spam protection fails closed when configuration is missing',async t=>{
 const crm=createCRM({dbPath:':memory:',key});t.after(()=>crm.close());const base=await serve(t,crm,{env:{NODE_ENV:'production',ADMIN_TOKEN:admin}});assert.equal((await fetch(base+'/api/form-token')).status,503);
});
test('signed challenges expire, reject tampering and limit repeated requests',()=>{
 let time=Date.now();const crm=createCRM({dbPath:':memory:',key,now:()=>time});const token=crm.issueToken();assert.equal(crm.verifyToken(token),false);time+=2000;assert.equal(crm.verifyToken(token),true);assert.equal(crm.verifyToken(token+'x'),false);time+=7200000;assert.equal(crm.verifyToken(token),false);for(let i=0;i<8;i++)assert.equal(crm.rateLimit('127.0.0.1'),true);assert.equal(crm.rateLimit('127.0.0.1'),false);crm.close();
});
test('mailer fixes recipient, uses provider idempotency, and rejects failed delivery',async()=>{
 let body,headers;const send=createMailer({MAIL_FROM:'Heartara <test@example.test>',RESEND_API_KEY:'test'},async(url,options)=>{body=JSON.parse(options.body);headers=options.headers;return {ok:true};});
 await send({...request(),id:'test-id'});assert.deepEqual(body.to,['heartarahealing@gmail.com']);assert.equal(headers['Idempotency-Key'],'heartara-test-id');assert.equal(body.reply_to,'visitor@example.test');
 await assert.rejects(createMailer({},async()=>({ok:true}))({...request(),id:'x'}));
 await assert.rejects(createMailer({MAIL_FROM:'x',RESEND_API_KEY:'x'},async()=>({ok:false}))({...request(),id:'x'}));
});
