import {confirmationReadiness,replyAddress,addressHash,mailbox,loadReceivedEmail,receiveConfirmation} from './email-confirmation.js';
export const conversationAddress=(id,env)=>replyAddress(id,env).replace(/^v\+/,'c+');
export function clientEmailReadiness(env=process.env){return confirmationReadiness({email_confirmation_enabled:true},env);}
export async function receiveIncomingEmail(db,event,eventId,options={}){
 const mail=await loadReceivedEmail(event,options);if(!mail)return false;
 if(await receiveConfirmation(db,event,eventId,{...options,receivedMail:mail}))return true;
 const env=options.env||process.env;
 const headers=Object.fromEntries(Object.entries(mail.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v).toLowerCase()]));
 if(headers['auto-submitted']&&headers['auto-submitted']!=='no')return false;
 const sender=mailbox(mail.from);if(!sender)return false;
 for(const value of mail.to||[]){const address=mailbox(value);if(!address)continue;
  const [local,domain]=address.split('@');if(domain!==env.EMAIL_REPLY_DOMAIN.toLowerCase())continue;
  const token=local.match(/^c\+([a-f0-9]{32})\.([a-f0-9]{28})$/);if(!token)continue;
  const id=token[1].replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
  const body=typeof mail.text==='string'?mail.text:String(mail.html||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ');
  const result=await db.rpc('record_client_email_reply',{p_thread:id,p_hash:addressHash(address),p_provider:mail.id,p_sender:sender,p_subject:String(mail.subject||'Client reply').slice(0,240),p_body:body.slice(0,12000),p_rfc_id:typeof mail.message_id==='string'?mail.message_id.slice(0,998):null,p_attachments:mail.attachments?.length||0});
  if(result.error)throw Error('Could not save incoming client email');return result.data===true;
 }
 return false;
}
export async function deliverClientEmails(db,{env=process.env,send,mode='sandbox'}={}){
 if(mode!=='resend'||!clientEmailReadiness(env).ready)return {processed:0};
 // An older installed CRM remains usable before the incremental upgrade.
 const installed=await db.from('client_email_threads').select('id').limit(1);if(installed.error){if(['PGRST205','42P01'].includes(installed.error.code))return {processed:0};throw Error('Email conversations unavailable');}
 const claim=await db.rpc('claim_client_emails',{p_limit:10});if(claim.error)throw Error('Cannot claim client email');
 for(const job of claim.data){try{
  if(job.attempts>1&&Date.now()-Date.parse(job.created_at)>23*3600000)throw Object.assign(Error('Retry window expired'),{permanent:true});
  const mid=job.deduplication_key.replace('client-email:','');
  const message=await db.from('client_email_messages').select('*').eq('id',mid).single();if(message.error||message.data.status==='cancelled')throw Object.assign(Error('Inactive message'),{permanent:true});
  const m=message.data,found=await db.from('client_email_threads').select('*').eq('id',m.thread_id).single();const t=found.data;
  if(found.error||!t||t.revoked)throw Object.assign(Error('Inactive thread'),{permanent:true});
  const replyTo=conversationAddress(t.id,env),hash=addressHash(replyTo);
  if(t.reply_token_hash&&t.reply_token_hash!==hash)throw Object.assign(Error('Signing key changed'),{permanent:true});
  const saved=await db.from('client_email_threads').update({reply_token_hash:hash}).eq('id',t.id).eq('revoked',false).select('id');if(saved.error||!saved.data?.length)throw Error('Could not prepare thread');
  const latest=await db.from('client_email_messages').select('rfc_message_id').eq('thread_id',t.id).eq('direction','inbound').order('created_at',{ascending:false}).limit(1);
  const rfc=latest.data?.[0]?.rfc_message_id;const headers=rfc&&/^<[^<>\r\n]{1,990}>$/.test(rfc)?{'In-Reply-To':rfc,References:rfc}:undefined;
  const provider=await send({subject:m.subject,text:m.body},`heartara-${job.id}`,t.recipient_email,{replyTo,headers});
  const finish=await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:'provider_accepted',p_provider:provider,p_error:null});if(finish.error)throw Error('Could not record send');
 }catch(error){await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:error.permanent?'failed':'queued',p_provider:null,p_error:error.permanent?'Client email needs review before retry':'Email transport unavailable; retry scheduled'});}}
 return {processed:claim.data.length};
}
