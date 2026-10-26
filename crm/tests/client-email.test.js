import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {startStack,token} from './local-stack.js';
import {deliverClientEmails,receiveIncomingEmail,conversationAddress} from '../src/client-email.js';
import {addressHash} from '../src/email-confirmation.js';
const run=process.env.CRM_TEST_API==='1'?test:test.skip;
const env={EMAIL_MODE:'resend',EMAIL_FROM:'Heartara <sender@example.invalid>',EMAIL_REPLY_DOMAIN:'reply.example.invalid',RESEND_API_KEY:'synthetic-send',RESEND_RECEIVING_API_KEY:'synthetic-receive',RESEND_WEBHOOK_SECRET:'synthetic-webhook'};
run('CRM conversation supports repeated sends and client replies, records delivery, enforces access and erases message content',async()=>{
 const old={};for(const [key,value]of Object.entries(env)){old[key]=process.env[key];process.env[key]=value;}
 const stack=await startStack();
 try{
 const clientEmail='client-'+randomUUID()+'@example.invalid';
 const db=stack.db,svc=createClient(stack.supabaseUrl,stack.secret,{auth:{persistSession:false}}),headers={Authorization:'Bearer '+token('authenticated',stack.owner),'Content-Type':'application/json'};
 await db.query("update public.notification_outbox set status='failed',safe_error='Synthetic test isolation' where template='client_reply' and status in ('queued','processing')");
 const receipt=(await db.query("select public.submit_heartara($1,'same','general_enquiry',$2,$3) result",[randomUUID(),{name:'Conversation synthetic',email:clientEmail,message:'Original question',source_page:'contact.html',topic:'oracle'},randomUUID()])).rows[0].result;
 const enquiry=(await db.query('select id from public.enquiries where submission_id=$1',[receipt.reference])).rows[0].id;
 const path='/api/private/enquiries/'+enquiry+'/emails';
 assert.equal((await fetch(stack.base+path)).status,401);
 assert.equal((await fetch(stack.base+path,{headers:{Authorization:'Bearer '+token('authenticated',stack.assistant)}})).status,403);
 async function queue(body,key=randomUUID(),url=path){const res=await fetch(stack.base+url,{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
 const firstKey=randomUUID(),draft={subject:'Heartara — your Oracle enquiry',body:'Hello, thanks for your enquiry.'};
 const first=await queue(draft,firstKey);assert.equal(first.status,200,JSON.stringify(first.data));assert.equal(first.data.queued,true);
 assert.equal((await queue(draft,firstKey)).data.id,first.data.id);assert.equal((await queue({...draft,body:'Changed'},firstKey)).status,409);
 const second=await queue({...draft,body:'A second helpful follow-up.'});assert.equal(second.status,200);assert.notEqual(second.data.id,first.data.id);
 assert.equal((await db.query('select status from public.enquiries where id=$1',[enquiry])).rows[0].status,'new');
 const sent=[];const sender=async(content,key,destination,options)=>{sent.push({content,key,destination,options});return 'provider-'+randomUUID()};
 assert.equal((await deliverClientEmails(svc,{mode:'resend',env,send:sender})).processed,2);assert.equal(sent.length,2);assert.equal(sent[0].destination,clientEmail);assert.match(sent[0].options.replyTo,/^c\+/);
 assert.equal((await db.query('select status from public.enquiries where id=$1',[enquiry])).rows[0].status,'awaiting_customer');
 // A provider acceptance is not labelled delivered until the delivery callback.
 const accepted=(await db.query('select * from public.client_email_messages where id=$1',[first.data.id])).rows[0];assert.equal(accepted.status,'provider_accepted');
 await svc.rpc('record_notification_callback',{p_event:randomUUID(),p_provider_id:accepted.provider_id,p_status:'delivered'});assert.equal((await db.query('select status from public.client_email_messages where id=$1',[first.data.id])).rows[0].status,'delivered');
 const thread=(await db.query('select * from public.client_email_threads where enquiry_id=$1',[enquiry])).rows[0];
 const mail={id:'received-'+randomUUID(),from:'Client <'+clientEmail+'>',to:[conversationAddress(thread.id,env)],subject:'Re: Heartara — your Oracle enquiry',text:'Yes please, another question <script>not executable</script>',message_id:'<synthetic-incoming@example.invalid>',headers:{},attachments:[{id:'not-downloaded'}]};
 async function incoming(data=mail){return receiveIncomingEmail(svc,{type:'email.received',data:{email_id:data.id}},'evt-'+data.id,{env,request:async(url)=>{assert.equal(url,'https://api.resend.com/emails/receiving/'+data.id);return {ok:true,json:async()=>data}}});}
 assert.equal(await incoming({...mail,id:'wrong-'+randomUUID(),from:'different@example.invalid'}),false);assert.equal(await incoming({...mail,id:'auto-'+randomUUID(),headers:{'Auto-Submitted':'auto-replied'}}),false);
 assert.equal(await incoming(),true);assert.equal(await incoming(),false);assert.equal((await db.query('select status from public.enquiries where id=$1',[enquiry])).rows[0].status,'in_progress');
 assert.equal((await db.query("select count(*)::int n from public.notification_outbox where deduplication_key='client-reply-alert:'||(select id::text from public.client_email_messages where provider_id=$1)",[mail.id])).rows[0].n,1);
 const conversion=await fetch(stack.base+'/api/private/rpc/convert_enquiry',{method:'POST',headers,body:JSON.stringify({p_enquiry:enquiry})});const contact=(await conversion.json()).result;assert.ok(contact);
 const contactPath='/api/private/contacts/'+contact+'/emails';let history=await(await fetch(stack.base+contactPath,{headers})).json();assert.equal(history.messages.length,3);assert.equal(history.messages.find(m=>m.direction==='inbound').attachment_count,1);assert.equal(history.threads[0].reply_token_hash,undefined);
 const third=await queue({subject:draft.subject,body:'Replying again after your answer.',thread_id:thread.id},randomUUID(),contactPath);assert.equal(third.status,200,JSON.stringify(third.data));
 await deliverClientEmails(svc,{mode:'resend',env,send:async()=>{throw Error('Private provider detail')}});
 const retry=(await db.query('select status,safe_error from public.notification_outbox where deduplication_key=$1',['client-email:'+third.data.id])).rows[0];assert.equal(retry.status,'queued');assert.ok(!retry.safe_error.includes('Private provider detail'));
 await db.query('update public.notification_outbox set next_attempt_at=now() where deduplication_key=$1',['client-email:'+third.data.id]);
 await deliverClientEmails(svc,{mode:'resend',env,send:sender});assert.equal(sent.length,3);assert.equal(sent[2].options.headers['In-Reply-To'],'<synthetic-incoming@example.invalid>');
 assert.equal((await db.query('select count(*)::int n from public.client_email_threads where id=$1',[thread.id])).rows[0].n,1);
 for(let i=0;i<51;i++)await db.query("insert into public.client_email_messages(thread_id,direction,subject,body,status) values($1,'inbound','History fixture',$2,'received')",[thread.id,'Synthetic history '+i]);
 const pageOne=await(await fetch(stack.base+contactPath,{headers})).json(),pageTwo=await(await fetch(stack.base+contactPath+'?offset=50',{headers})).json();assert.equal(pageOne.messages.length,50);assert.equal(pageOne.total,55);assert.equal(pageTwo.messages.length,5);assert.ok(pageTwo.messages.every(m=>!pageOne.messages.some(n=>n.id===m.id)));
 const fourth=await queue({subject:draft.subject,body:'Queued but not sent yet.'});assert.equal(fourth.status,200);
 const erased=await fetch(stack.base+'/api/private/rpc/erase_contact',{method:'POST',headers,body:JSON.stringify({p_contact:contact,p_confirmation:'ERASE '+contact})});assert.equal(erased.status,200,await erased.text());
 assert.equal((await db.query('select recipient_email from public.client_email_threads where id=$1',[thread.id])).rows[0].recipient_email,'[removed]');assert.ok((await db.query('select body,status from public.client_email_messages where thread_id=$1',[thread.id])).rows.every(m=>m.body==='[removed]'&&m.status==='cancelled'));
 assert.equal(await incoming({...mail,id:'after-erasure-'+randomUUID()}),false);
 const anon=createClient(stack.supabaseUrl,stack.publicKey,{auth:{persistSession:false}});assert.ok((await anon.from('client_email_messages').select('*')).error);
 }finally{await stack.close();for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('conversation routing separates ordinary replies from one-time confirmation and retrieves each email once',async()=>{
 const id=randomUUID(),address=conversationAddress(id,env),calls=[];
 const svc={rpc:async(name,args)=>{calls.push({name,args});return {data:true}}};
 const mail={id:'received-synthetic',to:[address],from:'client@example.invalid',subject:'Re: Heartara',html:'<script>bad()</script><p>Hello Penny</p>',headers:{},attachments:[]};let fetched=0;
 const result=await receiveIncomingEmail(svc,{data:{email_id:mail.id}},'evt-test',{env,request:async()=>{fetched++;return {ok:true,json:async()=>mail}}});
 assert.equal(result,true);assert.equal(fetched,1);assert.equal(calls[0].name,'record_client_email_reply');assert.equal(calls[0].args.p_thread,id);assert.equal(calls[0].args.p_hash,addressHash(address));assert.ok(!calls[0].args.p_body.includes('bad()'));assert.match(calls[0].args.p_body,/Hello Penny/);
});

run('reviewed contact merge carries both standalone email histories into the surviving contact file',async()=>{
 const stack=await startStack();try{
  const db=stack.db;await db.query("select set_config('request.jwt.claim.sub',$1,false)",[stack.owner]);
  const keep=(await db.query("insert into public.contacts(name,email_original) values('Keep synthetic','keep-email@example.invalid') returning id")).rows[0].id;
  const remove=(await db.query("insert into public.contacts(name,email_original) values('Remove synthetic','remove-email@example.invalid') returning id")).rows[0].id;
  for(const contact of [keep,remove])await db.query('select public.queue_client_email($1,$2,$3,null,$4,null)',[randomUUID(),'Synthetic subject','Retained history',contact]);
  await db.query('select public.merge_contacts($1,$2,$3,$4,$5)',[keep,remove,'Keep synthetic','keep-email@example.invalid','']);
  assert.equal((await db.query('select count(*)::int n from public.client_email_threads where contact_id=$1',[keep])).rows[0].n,2);
  assert.equal((await db.query('select count(*)::int n from public.client_email_threads where contact_id=$1',[remove])).rows[0].n,0);
 }finally{await stack.close()}
});
