export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const topics = ['general','reiki','attunement','munay_ki','despacho','group_healing','oracle','journal','review_removal','privacy','service_concern'];
export const serviceKeys = ['reiki-60','reiki-90','distance-60','package-60','package-90','package-distance','munay-individual','munay-group','attunement-1','attunement-2','attunement-3a','attunement-master'];
export function text(value, name, max, required = false) { if (typeof value !== 'string') { if (required) throw new HttpError(422, `${name} is required.`); return ''; } const v = value.trim(); if (v.length > max || (required && !v.length)) throw new HttpError(422, `Check ${name} (maximum ${max} characters).`); return v; }
export function uuid(value) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')) throw new HttpError(422,'Invalid record identifier.'); return value; }
export function brisbaneDate(now = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(now); }
export function validateSubmission(input, now = new Date()) {
 const kind = input.kind; if (!['general_enquiry','booking_request','feedback_submission'].includes(kind)) throw new HttpError(422,'Choose a valid form.');
 if (input.website) throw new HttpError(422,'The request could not be accepted.');
 const payload = {name:text(input.name,'name',120,true), message:text(input.message,'message',4000,kind!=='booking_request'), source_page:text(input.source_page,'source page',120,true), source_action:text(input.source_action,'source action',80), form_version:'heartara-v1'};
 if (!/^[a-z0-9_/-]+\.html$|^\/$/.test(payload.source_page)) throw new HttpError(422,'Invalid source page.');
 const email = text(input.email,'email',254,kind!=='feedback_submission'); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422,'Please enter a valid email address.'); payload.email = email;
 if (kind==='feedback_submission') { if (input.permission!==true) throw new HttpError(422,'Publication permission is required for a review. Use the contact form for private feedback.'); payload.permission=true; return {kind,payload}; }
 payload.phone=text(input.phone,'phone',40); payload.preference=input.preference||'email'; if(!['email','phone','either'].includes(payload.preference))throw new HttpError(422,'Invalid reply preference.'); if(payload.preference==='phone'&&!payload.phone)throw new HttpError(422,'Add a phone number for a phone reply.');
 payload.topic=input.topic||'general'; if(!topics.includes(payload.topic))throw new HttpError(422,'Choose a topic.');
 if(input.service_key){if(!serviceKeys.includes(input.service_key))throw new HttpError(422,'Choose a valid offering.');payload.service_key=input.service_key;}
 if(input.consent!==true)throw new HttpError(422,'Please acknowledge how your request will be handled.');
 payload.release_update=input.release_update===true&&payload.topic==='oracle';
 if(payload.topic==='attunement'){if(!['1','2','3a','Master','unsure'].includes(input.attunement_level))throw new HttpError(422,'Choose an attunement level.');payload.attunement_level=input.attunement_level;}
 if(['attunement','munay_ki'].includes(payload.topic)){if(!['individual','group','unsure'].includes(input.format))throw new HttpError(422,'Choose an individual or group preference.');payload.format=input.format;}
 if(input.party_size){const size=Number(input.party_size);if(!Number.isInteger(size)||size<1||size>30)throw new HttpError(422,'Check your party size.');payload.party_size=size;}
 if(kind==='booking_request'){
  if(!payload.service_key||!serviceKeys.slice(0,8).includes(payload.service_key))throw new HttpError(422,'Choose a session or journey.');
  if(input.acknowledgement!==true)throw new HttpError(422,'Please acknowledge that this is a booking request.');
  const date=text(input.preferred_date,'preferred date',10,true), time=text(input.preferred_time,'preferred time',5,true);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new HttpError(422,'Check the requested date and time.');
  const instant=new Date(`${date}T${time}:00+10:00`); if(!Number.isFinite(instant.valueOf())||brisbaneDate(instant)!==date||date<brisbaneDate(now)||instant<=now)throw new HttpError(422,'Choose a future date and time in Queensland.');
  const weekday=new Date(`${date}T12:00:00+10:00`).getUTCDay(), mins=Number(time.slice(0,2))*60+Number(time.slice(3));
  if((weekday===0||weekday===6)&&(mins<540||mins>=1020))throw new HttpError(422,'Weekend requests are between 9 am and 5 pm.');
  if(weekday>=2&&weekday<=5&&mins<1020)throw new HttpError(422,'Tuesday–Friday requests are for selected evenings from 5 pm.');
  const duration=payload.service_key.includes('90')?90:payload.service_key.startsWith('munay')?null:60;
  if((weekday===0||weekday===6)&&duration&&mins+duration>1020)throw new HttpError(422,'Please choose a time allowing the whole session to finish by 5 pm.');
  payload.preferred_date=date;payload.preferred_time=time;payload.timezone='Australia/Brisbane';payload.preferred_at=instant.toISOString();payload.acknowledgement=true;payload.first_session=payload.service_key.startsWith('package-');
 }
 return {kind,payload};
}
export function csv(rows, fields) { const cell = value => { let s = value==null?'':String(value); if (/^[\s]*[=+\-@]|^[\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }; return [fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n'); }
