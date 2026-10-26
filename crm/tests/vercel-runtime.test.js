import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {startStack} from './local-stack.js';
const runtimePath=process.env.VERCEL_RUNTIME_PACKAGE_PATH;
(runtimePath?test:test.skip)('Vercel official Node runtime preserves JSON body, routing and durable submission',async()=>{
 const stack=await startStack();const names=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','RATE_LIMIT_SALT','EMAIL_MODE','VERCEL','RESEND_WEBHOOK_SECRET'];const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));let server;
 try{
  Object.assign(process.env,{SUPABASE_URL:stack.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:stack.publicKey,SUPABASE_SERVICE_ROLE_KEY:stack.secret,RATE_LIMIT_SALT:'synthetic-vercel-rate-salt',EMAIL_MODE:'sandbox',VERCEL:'1',RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('synthetic-vercel-webhook').toString('base64')});
  const require=createRequire(import.meta.url),runtime=require(runtimePath);
  server=await runtime.startDevServer({entrypoint:'api/handler.js',workPath:new URL('../../',import.meta.url).pathname,config:{},files:{},meta:{}});
  const origin='http://127.0.0.1:'+server.port;
  const body={kind:'general_enquiry',name:'Vercel synthetic visitor',email:'vercel@example.invalid',message:'Synthetic Vercel request',source_page:'contact.html',topic:'general',consent:true};
  const response=await fetch(origin+'/api/handler?__route=public/submissions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.received,true);
  assert.equal((await stack.db.query('select id from public.enquiries where submission_id=$1',[data.reference])).rowCount,1);
  const {Webhook}=await import('svix');const eventId='evt_'+randomUUID(),providerId='provider_'+randomUUID(),timestamp=new Date();await stack.db.query("insert into public.notification_outbox(deduplication_key,status,provider_id) values($1,'provider_accepted',$2)",[randomUUID(),providerId]);const raw='{ \"type\" : \"email.delivered\", \"data\" : {\"email_id\":\"'+providerId+'\"} }';const signature=new Webhook(process.env.RESEND_WEBHOOK_SECRET).sign(eventId,timestamp,raw);const callback=await fetch(origin+'/api/handler?__route=provider/resend-webhook',{method:'POST',headers:{'Content-Type':'application/json','svix-id':eventId,'svix-timestamp':String(Math.floor(timestamp.valueOf()/1000)),'svix-signature':signature},body:raw});assert.equal(callback.status,200);
  const forbidden=await fetch(origin+'/api/handler?__route=private/contacts');assert.equal(forbidden.status,401);
  const config=await(await fetch(origin+'/api/handler?__route=config')).json();assert.equal(config.publishableKey,stack.publicKey);assert.ok(!Object.values(config).includes(stack.secret));
 }finally{await server?.shutdown();await stack.close();for(const k of names)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
});
