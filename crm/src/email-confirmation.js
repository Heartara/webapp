import {createHash,createHmac} from 'node:crypto';
export function confirmationReadiness(settings={},env=process.env){
 const missing=['RESEND_API_KEY','EMAIL_FROM','RESEND_RECEIVING_API_KEY','RESEND_WEBHOOK_SECRET','EMAIL_REPLY_DOMAIN'].filter(k=>!env[k]);
 if(env.EMAIL_MODE!=='resend')missing.push('EMAIL_MODE=resend');
 const domain=String(env.EMAIL_REPLY_DOMAIN||'').toLowerCase();
 if(domain&&!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain))missing.push('Valid EMAIL_REPLY_DOMAIN');
 const installed=Object.hasOwn(settings,'email_confirmation_enabled');
 return {installed,enabled:settings.email_confirmation_enabled===true,configured:installed&&missing.length===0,ready:installed&&settings.email_confirmation_enabled===true&&missing.length===0,missing,domain};
}
export function replyAddress(id,env=process.env){
 const secret=env.EMAIL_CONFIRMATION_SECRET||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY||env.RESEND_API_KEY;
 if(!secret)throw Error('Confirmation signing configuration missing');
 const compact=id.replaceAll('-','');if(!/^[a-f0-9]{32}$/.test(compact))throw Error('Invalid verification identifier');
 const tag=createHmac('sha256',secret).update('heartara-email-confirmation-v1:'+id).digest('hex').slice(0,28);
 return `v+${compact}.${tag}@${env.EMAIL_REPLY_DOMAIN.toLowerCase()}`;
}
export const addressHash=address=>createHash('sha256').update(address.toLowerCase()).digest('hex');
function mailbox(value){const match=String(value||'').trim().match(/^(?:[^<>]*<)?([^<>\s]+@[^<>\s]+)>?$/);return match?.[1]?.toLowerCase();}
export async function receiveConfirmation(db,event,eventId,{env=process.env,request=fetch}={}){
 if(!env.RESEND_RECEIVING_API_KEY||!env.EMAIL_REPLY_DOMAIN)throw Error('Receiving configuration missing');
 const emailId=event.data?.email_id;if(typeof emailId!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(emailId))return false;
 const response=await request('https://api.resend.com/emails/receiving/'+encodeURIComponent(emailId),{headers:{Authorization:`Bearer ${env.RESEND_RECEIVING_API_KEY}`},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Receiving provider temporarily unavailable');
 const mail=await response.json();if(mail.id!==emailId)return false;
 const headers=Object.fromEntries(Object.entries(mail.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v).toLowerCase()]));
 if((headers['auto-submitted']&&headers['auto-submitted']!=='no')||/bulk|list|junk/.test(headers.precedence||'')||headers['x-autoreply']||headers['x-autorespond'])return false;
 // A reply to the unique address is the proof; no keyword or message body is required.
 const sender=mailbox(mail.from);if(!sender)return false;
 for(const raw of mail.to||[]){
  const address=mailbox(raw);if(!address)continue;
  const [local,domain]=address.split('@');if(domain!==env.EMAIL_REPLY_DOMAIN.toLowerCase())continue;
  const token=local.match(/^v\+([a-f0-9]{32})\.([a-f0-9]{28})$/);if(!token)continue;
  const id=token[1].replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
  const result=await db.rpc('confirm_email_reply',{p_event:eventId,p_email_id:emailId,p_verification:id,p_hash:addressHash(address),p_sender:sender});
  if(result.error)throw Error('Could not record email confirmation');
  return result.data===true;
 }
 return false;
}
export async function deliverConfirmations(db,{env=process.env,send,mode='sandbox',sandboxDir}={}){
 const settings=await db.from('business_settings').select('*').eq('id',true).single();
 if(settings.error||!confirmationReadiness(settings.data,env).ready)return {processed:0};
 const claimed=await db.rpc('claim_confirmation_notifications',{p_limit:10});if(claimed.error)throw Error('Cannot claim confirmation jobs');
 for(const job of claimed.data){try{
  const id=job.deduplication_key.replace('email-confirmation:','');
  const found=await db.from('email_verifications').select('*').eq('id',id).single();const v=found.data;
  if(found.error||!v||v.status!=='pending'||Date.parse(v.expires_at)<=Date.now())throw Object.assign(Error('Inactive verification'),{permanent:true});
  if(job.attempts>1&&Date.now()-Date.parse(job.created_at)>23*3600000)throw Object.assign(Error('Retry expired'),{permanent:true});
  const replyTo=replyAddress(id,env),hash=addressHash(replyTo);
  if(v.token_hash&&v.token_hash!==hash)throw Object.assign(Error('Signing key changed'),{permanent:true});
  const saved=await db.from('email_verifications').update({token_hash:hash}).eq('id',id).eq('status','pending').select('id');
  if(saved.error||!saved.data?.length)throw Error('Could not prepare confirmation');
  const content={subject:'Please confirm your Heartara enquiry',text:'Thank you for your enquiry to Heartara. Your message has been saved for Penny.\n\nSimply reply to this email to confirm that we can reach you at this address. You do not need to type anything. If this arrived in spam, please move it to your inbox. This request expires in seven days.\n\nThis is email address confirmation, not a booking confirmation or marketing subscription. Penny will respond separately. This reply address only processes confirmations; please send further questions through the website.\n\nIf you did not send an enquiry, you can ignore this email.'};
  let provider=null;
  if(mode==='sandbox'){const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(sandboxDir||'/tmp/heartara-mail-preview',{recursive:true,mode:0o700});await writeFile(`${sandboxDir||'/tmp/heartara-mail-preview'}/${job.id}.json`,JSON.stringify(content),{mode:0o600});}
  else provider=await send(content,`heartara-${job.id}`,v.email_original,{replyTo});
  const finished=await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:mode==='sandbox'?'sandboxed':'provider_accepted',p_provider:provider,p_error:null});if(finished.error)throw Error('Could not record send');
 }catch(error){await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:error.permanent?'failed':'queued',p_provider:null,p_error:error.permanent?'Confirmation inactive or retry expired; request a new confirmation':'Confirmation transport unavailable; retry scheduled'});}}
 return {processed:claimed.data.length};
}
