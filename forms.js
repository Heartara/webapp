import {requestError} from './booking-rules.js';
import config from './public-config.js';
// Only enumerated completion events leave this module; no form values reach analytics.
export function recordSaved(kind){
 const names={enquiry:'enquiry_saved',booking:'booking_request_saved',feedback:'feedback_saved'};
 const event=names[kind];if(!event)return;
 document.dispatchEvent(new CustomEvent('heartara:conversion',{detail:{event}}));
 if(config.analyticsEnabled&&typeof window.heartaraAnalytics==='function')window.heartaraAnalytics(event);
}
const uuid=()=>{if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const s=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);};
const api=path=>new URL((config.apiBase||'./')+path,document.baseURI).href;
for(const form of document.querySelectorAll('.crm-form')){
 const status=form.querySelector('.form-status'),button=form.querySelector('[type="submit"]');
 let token='',challengeId=null,busy=false;
 const requestId=form.elements.namedItem('requestId');requestId.value=uuid();
 const topic=document.querySelector('#enquiry-topic');const chosen=new URLSearchParams(location.search).get('topic');
 if(topic&&[...topic.options].some(option=>option.value===chosen))topic.value=chosen;
 async function prepare(quiet=false){
  try{const response=await fetch(api('api/form-token'),{cache:'no-store',credentials:'omit'});if(!response.ok)throw Error();const data=await response.json();token=data.token;
   if(data.turnstileSiteKey){await loadTurnstile();challengeId=window.turnstile.render(form.querySelector('.spam-challenge'),{sitekey:data.turnstileSiteKey});}
  }catch{token='';if(!quiet)status.textContent='Online requests are temporarily unavailable. Your details have not been sent. Please try again later or contact heartarahealing@gmail.com.';}
 }
 prepare();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!form.reportValidity())return;
  if(form.dataset.kind==='booking'){
   const error=requestError(form.elements.date.value,form.elements.time.value);
   const clock=form.elements.time;clock.setCustomValidity(error);if(error){clock.reportValidity();clock.focus();return;}
  }
  if(!token){await prepare();if(!token)return;}
  const payload={kind:form.dataset.kind,name:form.elements.name.value.trim(),email:form.elements.email?.value.trim()||'',message:form.elements.message.value.trim(),consent:form.elements.consent.checked,website:form.elements.website.value,requestId:requestId.value,token,topic:form.elements.topic?.value||'general',service:form.elements.service?.value||'',date:form.elements.date?.value||'',time:form.elements.time?.value||'',turnstileToken:challengeId!==null?window.turnstile.getResponse(challengeId):''};
  busy=true;button.disabled=true;status.textContent='Sending your request…';
  try{
   const response=await fetch(api('api/submissions'),{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',body:JSON.stringify(payload)});
   let data;try{data=await response.json();}catch{throw new Error('We could not confirm that your request was saved. Your entries are still here. Please retry.');}
   if(!response.ok||data.saved!==true)throw new Error(data.error||'Your request could not be saved. Please try again.');
   status.textContent=form.dataset.kind==='booking'?'Your booking request has been saved. Penny will be in touch personally. Your appointment is not confirmed until Penny approves it.':'Thank you. Your message has been saved for Penny to review. She will be in touch personally.';
   recordSaved(form.dataset.kind);form.reset();requestId.value=uuid();token='';
   if(challengeId!==null){window.turnstile.remove(challengeId);challengeId=null;}await prepare(true);
  }catch(error){status.textContent=error.message==='Failed to fetch'?'We could not confirm that your request was saved. Your entries are still here. Please retry; the same request will not be saved twice.':error.message;}
  finally{busy=false;button.disabled=false;}
 });
}
let turnstilePromise;
function loadTurnstile(){return turnstilePromise??=new Promise((resolve,reject)=>{if(window.turnstile)return resolve();const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);});}
