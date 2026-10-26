import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {confirmationReadiness,replyAddress,addressHash,receiveConfirmation,deliverConfirmations} from '../src/email-confirmation.js';
import {notificationTransport} from '../worker.js';
import {createApp} from '../server.js';
import {Webhook} from 'svix';
const env={EMAIL_MODE:'resend',RESEND_API_KEY:'synthetic-send-key',RESEND_RECEIVING_API_KEY:'synthetic-read-key',EMAIL_FROM:'Heartara <sender@example.invalid>',RESEND_WEBHOOK_SECRET:'whsec_'+Buffer.from('synthetic-test-secret').toString('base64'),EMAIL_REPLY_DOMAIN:'reply.example.invalid'};
const verification=randomUUID(),address=replyAddress(verification,env);
const event={type:'email.received',data:{email_id:'synthetic-received-id'}};
const email={id:event.data.email_id,to:[address],from:'Synthetic Visitor <visitor@example.invalid>',text:'',headers:{}};
test('confirmation remains off until migration, sending and receiving setup are present; diagnostics contain no keys',()=>{
 assert.equal(confirmationReadiness({},env).ready,false);
 assert.equal(confirmationReadiness({email_confirmation_enabled:false},env).ready,false);
 assert.equal(confirmationReadiness({email_confirmation_enabled:true},env).ready,true);
 assert.equal(confirmationReadiness({email_confirmation_enabled:true},{...env,EMAIL_REPLY_DOMAIN:'invalid@host'}).ready,false);
 assert.ok(!JSON.stringify(confirmationReadiness({},env)).includes('synthetic-read-key'));
 assert.ok(address.split('@')[0].length<=64);assert.equal(replyAddress(verification,env),address);assert.notEqual(replyAddress(randomUUID(),env),address);
});
test('blank and ordinary replies verify without a keyword; automatic replies and wrong destinations do not',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return {data:true}}};
 const run=mail=>receiveConfirmation(db,event,'event-id',{env,request:async(url,options)=>{assert.equal(url,'https://api.resend.com/emails/receiving/synthetic-received-id');assert.equal(options.headers.Authorization,'Bearer synthetic-read-key');return {ok:true,json:async()=>mail}}});
 assert.equal(await run(email),true);assert.equal(calls[0].args.p_sender,'visitor@example.invalid');assert.equal(calls[0].args.p_hash,addressHash(address));assert.equal(calls[0].args.p_verification,verification);
 assert.equal(await run({...email,text:'Thanks Penny!'}),true);assert.equal(await run({...email,text:null,html:'<div></div>'}),true);
 for(const change of [{headers:{'Auto-Submitted':'auto-replied'}},{headers:{Precedence:'bulk'}},{to:[address.replace('@reply.','@different.')]},{id:'mismatching-id'},{from:'bad address'}])assert.equal(await run({...email,...change}),false);
 assert.equal(calls.length,3);
 await assert.rejects(()=>receiveConfirmation(db,event,'x',{env,request:async()=>({ok:false})}),/temporarily/);
});
test('signed receiving webhook retrieves provider content; forged signature cannot trigger retrieval',async()=>{
 const old={};for(const key of ['RESEND_WEBHOOK_SECRET','RESEND_RECEIVING_API_KEY','EMAIL_REPLY_DOMAIN']){old[key]=process.env[key];process.env[key]=env[key]}
 let fetched=0,confirmed=0;
 const app=createApp({unconfigured:true,admin:{rpc:async()=>{confirmed++;return {data:true}}},receivingFetch:async()=>{fetched++;return {ok:true,json:async()=>email}}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));
 try{const url='http://127.0.0.1:'+app.address().port+'/api/provider/resend-webhook',raw=JSON.stringify(event),id='evt_synthetic',time=new Date();
 assert.equal((await fetch(url,{method:'POST',body:raw})).status,401);assert.equal(fetched,0);
 const signature=new Webhook(env.RESEND_WEBHOOK_SECRET).sign(id,time,raw);
 assert.equal((await fetch(url,{method:'POST',headers:{'svix-id':id,'svix-timestamp':String(Math.floor(time.valueOf()/1000)),'svix-signature':signature},body:raw})).status,200);assert.equal(fetched,1);assert.equal(confirmed,1);
 }finally{await new Promise(r=>app.close(r));for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('confirmation worker uses visitor address, stable provider idempotency and unique Reply-To; never includes submitted message',async()=>{
 const finish=[],calls=[],updates=[];
 const db={
  from(table){
   const chain={
    select(){return chain},eq(){return chain},
    async single(){return {data:table==='business_settings'?{email_confirmation_enabled:true}:{id:verification,status:'pending',email_original:'visitor@example.invalid',expires_at:new Date(Date.now()+60000).toISOString()}}},
    update(data){updates.push(data);return {eq(){return this},select:async()=>({data:[{id:verification}]})}}
   };return chain;
  },
  async rpc(name,args){if(name==='claim_confirmation_notifications')return {data:[{id:'job-id',deduplication_key:'email-confirmation:'+verification,attempts:1,created_at:new Date().toISOString(),lease_token:randomUUID()}]};finish.push(args);return {data:true}}
 };
 assert.equal((await deliverConfirmations(db,{env,mode:'resend',send:async(...args)=>{calls.push(args);return 'accepted'}})).processed,1);
 assert.equal(calls[0][2],'visitor@example.invalid');assert.equal(calls[0][3].replyTo,address);assert.equal(calls[0][1],'heartara-job-id');assert.match(calls[0][0].text,/Simply reply to this email/);assert.ok(!calls[0][0].text.includes('with CONFIRM'));assert.equal(updates[0].token_hash,addressHash(address));assert.equal(finish[0].p_status,'provider_accepted');
 const old=globalThis.fetch;try{globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);assert.equal(body.reply_to,address);return {ok:true,json:async()=>({id:'test-id'})}};await notificationTransport(env).send({subject:'Test',text:'Confirm'},'test-id','visitor@example.invalid',{replyTo:address});}finally{globalThis.fetch=old}
});
const database=process.env.CRM_TEST_DATABASE_URL;
(database?test:test.skip)('database verifies replies once; keeps immediate owner alerts, follow-up and consent separate; limits challenges and revokes on erasure',async()=>{
 const db=new pg.Client({connectionString:database});await db.connect();
 try{
 await db.query('begin');
 await db.query('update public.business_settings set email_confirmation_enabled=true');
 const owner=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[owner,'confirmation-owner@example.invalid']);await db.query("insert into public.staff_users(id,display_name,role) values($1,'Synthetic owner','owner')",[owner]);
 async function intake(email){const receipt=(await db.query("select public.submit_heartara($1,'test','general_enquiry',$2,$3) result",[randomUUID(),{name:'Synthetic visitor',email,message:'Private synthetic message',source_page:'contact.html',topic:'oracle',consent:true},randomUUID()])).rows[0].result;return (await db.query('select v.*,e.status follow_up from public.email_verifications v join public.enquiries e on e.id=v.enquiry_id where v.submission_id=$1',[receipt.reference])).rows[0]}
 const v=await intake('confirmation-visitor@example.invalid');assert.equal(v.status,'pending');assert.equal(v.follow_up,'new');
 const outbox=(await db.query('select template,status from public.notification_outbox where submission_id=$1',[v.submission_id])).rows;assert.equal(outbox.length,2);assert.ok(outbox.every(j=>j.status==='queued'));assert.ok(outbox.some(j=>j.template==='owner_new_submission'));
 assert.equal((await db.query('select * from public.claim_notifications(25)')).rows.some(j=>j.template==='customer_email_confirmation'),false);
 assert.equal((await db.query('select * from public.claim_confirmation_notifications(25)')).rows.some(j=>j.submission_id===v.submission_id),true);
 const hash=addressHash(replyAddress(v.id,env));await db.query('update public.email_verifications set token_hash=$1 where id=$2',[hash,v.id]);
 const confirm=async(sender='confirmation-visitor@example.invalid',token=hash,event=randomUUID(),id=v.id)=> (await db.query('select public.confirm_email_reply($1,$2,$3,$4,$5) confirmed',[event,randomUUID(),id,token,sender])).rows[0].confirmed;
 assert.equal(await confirm('wrong@example.invalid'),false);assert.equal(await confirm(undefined,'0'.repeat(64)),false);assert.equal(await confirm(),true);assert.equal(await confirm(),false);
 assert.equal((await db.query('select status from public.enquiries where id=$1',[v.enquiry_id])).rows[0].status,'new');assert.equal((await db.query("select count(*)::int n from public.consent_events where contact_id is not null and purpose='marketing' and granted")).rows[0].n,0);
 const expired=await intake('expired@example.invalid');await db.query("update public.email_verifications set token_hash=$1,expires_at=now()-interval '1 second' where id=$2",[hash,expired.id]);assert.equal(await confirm('expired@example.invalid',hash,randomUUID(),expired.id),false);
 for(let i=0;i<4;i++){const limited=await intake('limited@example.invalid');assert.equal(limited.status,i===3?'rate_limited':'pending')}
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[owner,JSON.stringify({sub:owner,aal:'aal1'})]);
 const c=(await db.query('select public.convert_enquiry($1) id',[v.enquiry_id])).rows[0].id;
 await db.query('select public.erase_contact($1,$2)',[c,'ERASE '+c]);
 const erased=(await db.query('select status,email_original,token_hash from public.email_verifications where id=$1',[v.id])).rows[0];assert.equal(erased.status,'revoked');assert.equal(erased.email_original,'[removed]');assert.equal(erased.token_hash,null);
 assert.equal(await confirm(),false);
 await db.query('set local role anon');await assert.rejects(()=>db.query('select * from public.email_verifications'),/permission denied/);
 // The rejected statement aborts this synthetic transaction, intentionally rolling all fixtures back.
 await db.query('rollback');
 }finally{await db.query('rollback');await db.end()}
});
