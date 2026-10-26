import {createClient} from '@supabase/supabase-js';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function deliverBatch(db,{mode='sandbox',sandboxDir='/tmp/heartara-mail-preview',send,crmUrl,recipient}={}){
 const settings=await db.from('business_settings').select('notification_email,notification_enabled').eq('id',true).single();if(settings.error)throw Error('Notification settings unavailable');
 if(mode!=='sandbox'&&(!settings.data.notification_enabled||!recipient||recipient!==settings.data.notification_email))return {processed:0,disabled:true};
 const {data:jobs,error}=await db.rpc('claim_notifications',{p_limit:10});if(error)throw Error('Cannot claim notification jobs');
 for(const job of jobs){
  try{
   if(Date.now()-new Date(job.created_at).valueOf()>23*3600000&&mode!=='sandbox')throw Object.assign(Error('Expired provider retry window'),{permanent:true});
   const content={subject:'Heartara — a new website request',text:`A new website request has been saved in Heartara CRM. Sign in to review it: ${crmUrl||'CRM URL not yet configured'}.\n\nReference: ${job.submission_id}.\nThis notification intentionally does not include the visitor’s message.`};
   let provider=null;
   if(mode==='sandbox'){await mkdir(sandboxDir,{recursive:true,mode:0o700});await writeFile(`${sandboxDir}/${job.id}.json`,JSON.stringify(content,null,2),{mode:0o600});}
   else{if(!send)throw Error('No mail transport');provider=await send(content,`heartara-${job.id}`);}
   const result=await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:mode==='sandbox'?'sandboxed':'provider_accepted',p_provider:provider,p_error:null});if(result.error)throw Error('Could not record provider outcome');
  }catch(error){await db.rpc('finish_notification',{p_id:job.id,p_lease:job.lease_token,p_status:error.permanent?'failed':'queued',p_provider:null,p_error:error.permanent?'Manual review required: provider retry window expired':'Notification transport unavailable; retry scheduled'});}
 }
 return {processed:jobs.length};
}
export function notificationTransport(env=process.env) {
 const mode=env.EMAIL_MODE||'sandbox';if(!['sandbox','resend'].includes(mode))throw Error('Choose sandbox or resend mail mode');
 const recipient=env.OWNER_NOTIFICATION_EMAIL;
 if(mode==='resend'&&(!env.RESEND_API_KEY||!env.EMAIL_FROM||!env.CRM_PUBLIC_URL||!recipient))throw Error('Verified sending configuration required');
 const send=async(content,key)=>{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.EMAIL_FROM,to:[recipient],subject:content.subject,text:content.text})});if(!response.ok){const error=Error('Provider rejected notification');error.permanent=response.status>=400&&response.status<500&&response.status!==429;throw error;}const result=await response.json();return result.id;};
 return {mode,send,recipient,crmUrl:env.CRM_PUBLIC_URL,sandboxDir:env.MAIL_PREVIEW_DIR||'/tmp/heartara-mail-preview'};
}
async function main(){
 const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await deliverBatch(db,notificationTransport());console.log(JSON.stringify(result));
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Notification worker failed; check configuration and outbox. No message contents logged.');process.exitCode=1});
