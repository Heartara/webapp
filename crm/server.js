import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {Webhook} from 'svix';
import {HttpError,validateSubmission,uuid,csv} from './src/validation.js';
import {resources,searchFields,filters,pickFields} from './src/resources.js';
const root=fileURLToPath(new URL('../',import.meta.url));
function isPublicKey(key){if(typeof key!=='string')return false;if(key.startsWith('sb_publishable_'))return true;try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{return false;}}
const options={auth:{persistSession:false,autoRefreshToken:false}};
export function createApp(config={}) {
 const url=config.unconfigured?undefined:config.supabaseUrl||process.env.SUPABASE_URL, publicKey=config.unconfigured?undefined:config.publicKey||process.env.SUPABASE_PUBLISHABLE_KEY, secret=config.unconfigured?undefined:config.secret||process.env.SUPABASE_SERVICE_ROLE_KEY;
 const origins=(config.origins||process.env.ALLOWED_ORIGINS||'http://localhost:3100').split(',').map(x=>x.trim());
 if(process.env.VERCEL_URL)origins.push('https://'+process.env.VERCEL_URL);
 if(process.env.VERCEL_PROJECT_PRODUCTION_URL)origins.push('https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL);
 const admin=config.admin||(url&&secret?createClient(url,secret,options):null);
 const sessionClient=token=>createClient(url,publicKey,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
 async function identity(req){
  if(!admin||!isPublicKey(publicKey))throw new HttpError(503,'The CRM connection is not configured.');
  const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];if(!token)throw new HttpError(401,'Please sign in.');
  const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw new HttpError(401,'Your session has expired. Please sign in again.');
  const db=sessionClient(token);const staff=await db.from('staff_users').select('*').eq('id',data.user.id).eq('active',true).maybeSingle();
  if(staff.error||!staff.data)throw new HttpError(403,'This account has no active CRM access.');
  if(staff.data.require_mfa&&JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).aal!=='aal2')throw new HttpError(403,'Complete your authenticator verification.');
  return {db,staff:staff.data,user:data.user};
 }
 function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 function rawBody(req){return new Promise((resolve,reject)=>{let size=0,chunks=[],tooLarge=false;req.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>18000){if(!tooLarge)reject(new HttpError(413,'The request is too large.'));tooLarge=true;chunks=[];return;}chunks.push(Buffer.from(chunk));});req.on('end',()=>{if(!tooLarge)resolve(Buffer.concat(chunks));});req.on('error',reject);});}
 async function body(req){const raw=await rawBody(req);try{return JSON.parse(raw.toString())}catch{throw new HttpError(400,'Invalid request body.')}}
 function check(result){if(result.error){const message=result.error.message||'';if(message.includes('IDEMPOTENCY_CONFLICT'))throw new HttpError(409,'This request reference was already used with different details. Start a new request.');if(message.includes('RATE_LIMIT'))throw new HttpError(429,'Too many requests. Please wait 15 minutes and retry.');if(result.error.code==='23P01')throw new HttpError(409,'That appointment overlaps another booking.');throw new HttpError(422,'The change could not be saved. Check the fields, permissions and scheduling rules.');}return result.data;}
 return http.createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader('X-Request-ID',requestId);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${url?new URL(url).origin:''}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`);
  const origin=req.headers.origin;
  try{
   if(origin){if(!origins.includes(origin))throw new HttpError(403,'This website origin is not enabled.');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization,Idempotency-Key');res.writeHead(204);return res.end();}
   const path=new URL(req.url,'http://localhost').pathname;const params=new URL(req.url,'http://localhost').searchParams;
   if(path==='/api/health'&&req.method==='GET')return send(res,200,{status:'running',database_configured:Boolean(admin&&isPublicKey(publicKey)),email_mode:process.env.EMAIL_MODE||'sandbox'});
   if(path==='/api/config'&&req.method==='GET'){if(!url||!isPublicKey(publicKey))throw new HttpError(503,'Supabase connection is not configured.');return send(res,200,{supabaseUrl:url,publishableKey:publicKey});}
   if(path==='/api/provider/resend-webhook'&&req.method==='POST'){
    if(!admin||!process.env.RESEND_WEBHOOK_SECRET)throw new HttpError(503,'Delivery callback is not configured.');
    const raw=(await rawBody(req)).toString();
    let event;try{new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw,{'svix-id':req.headers['svix-id'],'svix-timestamp':req.headers['svix-timestamp'],'svix-signature':req.headers['svix-signature']});event=JSON.parse(raw);}catch{throw new HttpError(401,'Invalid delivery signature.');}
    const state={'email.delivered':'delivered','email.bounced':'bounced','email.failed':'failed'}[event.type];
    if(state)check(await admin.rpc('record_notification_callback',{p_event:req.headers['svix-id'],p_provider_id:event.data.email_id,p_status:state}));
    return send(res,200,{received:true});
   }
   if(path==='/api/public/submissions' &&req.method==='POST'){
    if(!admin)throw new HttpError(503,'Requests are not available yet. Your request has not been sent.');
    const key=uuid(req.headers['idempotency-key']);const raw=await body(req);const {kind,payload}=validateSubmission(raw);
    const hash=createHash('sha256').update(JSON.stringify({kind,payload})).digest('hex');
    const ip=process.env.VERCEL==='1'?(req.headers['x-vercel-forwarded-for']||'').split(',')[0].trim()||'vercel-unavailable':process.env.TRUST_PROXY==='true'?(req.headers['x-forwarded-for']||'').split(',')[0].trim():req.socket.remoteAddress;
    const salt=process.env.RATE_LIMIT_SALT;if(!salt&&!config.rateSalt)throw new HttpError(503,'Request protection is not configured. Nothing was submitted.');
    const bucket=createHmac('sha256',config.rateSalt||salt).update(`${ip}|${Math.floor(Date.now()/900000)}`).digest('hex');
    return send(res,200,check(await admin.rpc('submit_heartara',{p_key:key,p_hash:hash,p_kind:kind,p_payload:payload,p_bucket:bucket})));
   }
   if(path==='/api/public/reviews'&&req.method==='GET'){if(!admin)throw new HttpError(503,'Reviews are temporarily unavailable.');const rows=check(await admin.rpc('published_feedback'));return send(res,200,rows.map(r=>({id:r.id,name:r.display_name,text:r.public_text,year:r.display_year||''})));}
   if(path.startsWith('/api/private/')){
    const {db,staff}=await identity(req);const owner=staff.role==='owner';
    if(path==='/api/private/me')return send(res,200,staff);
    if(path==='/api/private/export'&&req.method==='GET'){
     if(!owner)throw new HttpError(403,'Only the owner can export records.');const resource=params.get('resource');const allowed={contacts:['id','name','email_original','phone','created_at'],enquiries:['id','status','topic','received_at','contact_id'],appointments:['id','contact_id','starts_at','ends_at','status'],tasks:['id','title','due_at','status']};if(!allowed[resource])throw new HttpError(422,'Choose an export type.');
     let rows=[];for(let offset=0;offset<10000;offset+=500){const result=check(await db.from(resource).select(allowed[resource].join(',')).order('id').range(offset,offset+499));rows.push(...result);if(result.length<500)break;if(offset===9500)throw new HttpError(422,'Export exceeds 10,000 records. Use a reviewed database export.');}
     check(await admin.from('activity_events').insert({entity:resource,action:'export',actor_id:staff.id,metadata:{count:rows.length}}));res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="heartara-${resource}.csv"`});return res.end(csv(rows,allowed[resource]));
    }
    if(path==='/api/private/merge-preview'&&req.method==='POST'){
     if(!owner)throw new HttpError(403,'Owner only.');const input=await body(req);const ids=[uuid(input.keep),uuid(input.remove)];if(ids[0]===ids[1])throw new HttpError(422,'Choose two different contacts.');const contacts=check(await db.from('contacts').select('*').in('id',ids));if(contacts.length!==2)throw new HttpError(404,'Contacts not found.');const counts={};for(const table of ['enquiries','appointments','tasks','client_packages','journey_participants','internal_notes']){const r=await db.from(table).select('id',{count:'exact',head:true}).eq('contact_id',ids[1]);if(r.error)throw new HttpError(422,'Could not preview merge.');counts[table]=r.count;}return send(res,200,{contacts,affected:counts});
    }
    if(path==='/api/private/staff'&&req.method==='POST'){
     if(!owner)throw new HttpError(403,'Owner only.');const input=await body(req);uuid(input.user_id);if(!['owner','practitioner','assistant'].includes(input.role))throw new HttpError(422,'Choose a role.');
     if(input.user_id===staff.id&&(input.role!=='owner'||input.active===false))throw new HttpError(422,'You cannot remove your own owner access.');
     check(await admin.from('staff_users').upsert({id:input.user_id,display_name:String(input.display_name||'').slice(0,120),role:input.role,active:input.active!==false,require_mfa:input.require_mfa===true}));return send(res,200,{saved:true});
    }
    if(path.startsWith('/api/private/rpc/')&&req.method==='POST'){
     if(!owner)throw new HttpError(403,'Owner only.');const name=path.split('/').at(-1);const allowed={convert_enquiry:['p_enquiry','p_contact'],record_consent:['p_contact','p_purpose','p_granted'],merge_contacts:['p_keep','p_remove','p_name','p_email','p_phone'],retry_notification:['p_id'],package_balances:[],erase_contact:['p_contact','p_confirmation']};if(!allowed[name])throw new HttpError(404,'Not found.');const input=await body(req);const args=Object.fromEntries(allowed[name].filter(k=>Object.hasOwn(input,k)).map(k=>[k,input[k]]));return send(res,200,{result:check(await db.rpc(name,args))});
    }
    const parts=path.split('/').filter(Boolean),resource=parts[2],id=parts[3];if(!Object.hasOwn(resources,resource))throw new HttpError(404,'Not found.');
    if(req.method==='GET'){
     let query=db.from(resource).select('*',{count:'exact'});if(id)query=query.eq('id',uuid(id));for(const name of filters)if(params.has(name))query=query.eq(name,params.get(name));
     const q=params.get('q');if(q&&searchFields[resource]){if(q.length>100)throw new HttpError(422,'Search is too long.');const safe=q.replace(/[^\p{L}\p{N}@. _-]/gu,'');query=query.or(searchFields[resource].map(f=>`${f}.ilike.%${safe}%`).join(','));}
     if(params.get('from'))query=query.gte(resource==='enquiries'?'received_at':resource==='appointments'?'starts_at':resource==='tasks'?'due_at':'created_at',params.get('from'));if(params.get('to'))query=query.lte(resource==='enquiries'?'received_at':resource==='appointments'?'starts_at':resource==='tasks'?'due_at':'created_at',params.get('to'));
     const offset=Math.max(0,Number(params.get('offset'))||0);const result=await query.order(resource==='enquiries'?'received_at':resource==='appointments'?'starts_at':'id',{ascending:resource==='appointments'}).range(offset,offset+49);check(result);return send(res,200,{rows:result.data,total:result.count,offset});
    }
    if(!owner)throw new HttpError(403,'Only the owner can change records in this release.');
    if(!resources[resource].length)throw new HttpError(403,'This record is read-only.');
    const input=pickFields(resource,await body(req));if(!Object.keys(input).length)throw new HttpError(422,'No editable fields.');
    if(req.method==='POST'&&!id){if(['enquiries','feedback','business_settings','services'].includes(resource))throw new HttpError(422,'Use the submission form or edit the catalogue.');return send(res,201,check(await db.from(resource).insert(input).select().single()));}
    if(req.method==='PATCH'&&id){if(['internal_notes','client_packages','journey_participants','journey_meetings','rite_completion_events'].includes(resource))throw new HttpError(422,'This is an append-only operational record. Record a correction separately.');const record=resource==='business_settings'?(id==='true'?true:null):uuid(id);if(record===null)throw new HttpError(422,'Invalid settings.');const result=check(await db.from(resource).update(input).eq('id',record).select().maybeSingle());if(!result)throw new HttpError(404,'Record not found or unavailable.');return send(res,200,result);}
    throw new HttpError(405,'Method not supported.');
   }
   if(req.method!=='GET')throw new HttpError(405,'Method not supported.');
   let file;
   if(path==='/crm'||path==='/crm/')file=resolve(root,'crm/public/index.html');
   else if(path.startsWith('/crm/')){const name=path.slice(5);if(!['index.html','app.js','crm.css'].includes(name))throw new HttpError(404,'Not found.');file=resolve(root,'crm/public',name);}
   else{const relative=decodeURIComponent(path==='/'?'/index.html':path);file=resolve(root,'.'+relative);if(!file.startsWith(root)||relative.includes('/crm/')||relative.includes('/node_modules/')||!/^\/(?:assets\/[a-zA-Z0-9_.-]+|[a-zA-Z0-9_.-]+\.(?:html|js|css|json))$/.test(relative))throw new HttpError(404,'Not found.');if(['package.json','package-lock.json','server.js','site.test.js'].includes(relative.slice(1)))throw new HttpError(404,'Not found.');}
   try{const data=await readFile(file);const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'};res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);}catch{throw new HttpError(404,'Not found.');}
  }catch(error){send(res,error.status||500,{error:error.status?error.message:'The request could not be completed. Please try again.',request_id:requestId});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url))createApp().listen(Number(process.env.PORT||3100),'0.0.0.0',()=>console.log('Heartara CRM server started. No customer messages are sent by startup.'));
