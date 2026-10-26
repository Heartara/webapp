import {requestError} from './booking-rules.js';
import config from './public-config.js';
import {submissionError} from './form-response.js';
export function recordSaved(kind){
 const names={enquiry:'enquiry_saved',booking:'booking_request_saved',feedback:'feedback_saved'};
 const event=names[kind];if(!event)return;
 document.dispatchEvent(new CustomEvent('heartara:conversion',{detail:{event}}));
 if(config.analyticsEnabled&&typeof window.heartaraAnalytics==='function')window.heartaraAnalytics(event);
}
const api=path=>new URL((config.apiBase||'./')+path,document.baseURI).href;
const topicMap={training:'attunement',munay:'munay_ki',ceremony:'despacho',retreats:'group_healing'};
for(const form of document.querySelectorAll('.crm-form')){
 const status=form.querySelector('.form-status'),button=form.querySelector('[type="submit"]');let busy=false,lastPayload='';
 const requestId=form.elements.namedItem('requestId');requestId.value=crypto.randomUUID();
 const topic=document.querySelector('#enquiry-topic'),chosen=new URLSearchParams(location.search).get('topic');
 if(topic&&[...topic.options].some(option=>option.value===chosen))topic.value=chosen;
 const update=()=>{for(const el of form.querySelectorAll('[data-topic]'))el.hidden=el.dataset.topic!==topic?.value;};topic?.addEventListener('change',update);update();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  if(form.dataset.kind==='booking'){const error=requestError(form.elements.date.value,form.elements.time.value);const clock=form.elements.time;clock.setCustomValidity(error);if(error){clock.reportValidity();return;}}
  const value=name=>form.elements.namedItem(name)?.value||'';
  const selected=topicMap[value('topic')]||value('topic')||'general';
  const payload={kind:{enquiry:'general_enquiry',booking:'booking_request',feedback:'feedback_submission'}[form.dataset.kind],name:value('name'),email:value('email'),message:value('message'),consent:form.elements.consent.checked,permission:form.dataset.kind==='feedback'&&form.elements.consent.checked,website:value('website'),topic:selected,source_page:location.pathname.split('/').pop()||'index.html',source_action:new URLSearchParams(location.search).get('source')?.replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,80)||'page-form',phone:value('phone'),preference:value('preference')||'email'};
  if(form.dataset.kind==='booking')Object.assign(payload,{service_key:value('service'),preferred_date:value('date'),preferred_time:value('time'),acknowledgement:form.elements.consent.checked,topic:value('service').startsWith('munay')?'munay_ki':'reiki'});
  if(selected==='attunement')Object.assign(payload,{attunement_level:value('attunement_level')||'unsure',format:value('format')||'unsure'});
  if(selected==='munay_ki')payload.format=value('munay_format')||'unsure';
  if(selected==='oracle')payload.release_update=form.elements.namedItem('release_update')?.checked===true;
  const signature=JSON.stringify(payload);if(lastPayload&&signature!==lastPayload)requestId.value=crypto.randomUUID();lastPayload=signature;
  busy=true;button.disabled=true;status.textContent='Saving your request…';
  try{
   const response=await fetch(api('api/public/submissions'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestId.value},credentials:'same-origin',body:signature});
   let result;try{result=await response.json();}catch{throw Error('Your request could not be saved. Keep this page open and retry.');}
   const data={saved:result.received===true};if(!response.ok||data.saved!==true)throw Error(submissionError(result,response.status));
   status.textContent=form.dataset.kind==='booking'?'Your booking request has been saved. Penny will respond personally. Your appointment is not confirmed until Penny approves it.':form.dataset.kind==='feedback'?'Thank you. Your feedback has been saved privately for Penny to review. It is not published automatically.':'Your enquiry has been saved. Penny will respond personally.';
   if(result.email_confirmation_requested)status.textContent+=' A confirmation email has been requested. Check your inbox and spam folder, then reply CONFIRM to that email. Penny can still review your enquiry while confirmation is pending.';
   recordSaved(form.dataset.kind);form.reset();requestId.value=crypto.randomUUID();lastPayload='';update();
  }catch(error){status.textContent=(error.message==='Failed to fetch'?'Your request has not been sent. Please retry when the connection is available.':error.message)+' Your entries are still here for a safe retry.';}
  finally{busy=false;button.disabled=false;}
 });
}
