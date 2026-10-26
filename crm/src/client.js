import {createClient} from '@supabase/supabase-js';
import {enquiryStates,topicNames,topicName,stateName,friendly,submittedDetails,enquiryPerson,contactFollowUp,columnNames} from './presentation.js';
const recoveryMode=new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';
let auth,me,current='Overview',page=0,session,mfaFactor,stale=0;
const $=s=>document.querySelector(s),status=text=>{$('#global-status').textContent=text;};
const names={'Overview':'','Enquiries':'enquiries','Contacts':'contacts','Appointments':'appointments','Packages & Journeys':'','Feedback':'feedback','Tasks':'tasks','Services':'services','Settings':''};
const columns={enquiries:['person_name','person_email','topic','status','email_confirmation','received_at'],contacts:['name','email_original','interest','follow_up'],appointments:['starts_at','ends_at','status','mode'],feedback:['display_name','public_text','status'],tasks:['title','due_at','status'],services:['name','reiki_level','duration_minutes','price_minor','status'],client_packages:['contact_id','payment_state'],client_journeys:['name','mode','status']};
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function button(text,fn,cls){const b=element('button',text,cls);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(error){status(error.message);}finally{b.disabled=false;}});return b;}
function display(value,key=''){if(value===null||value===undefined)return '—';if(key.endsWith('_at'))return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Brisbane',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));if(key==='price_minor')return new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100);if(typeof value==='object')return JSON.stringify(value);return String(value);}
async function api(path,options={}){const token=(await auth.auth.getSession()).data.session?.access_token;if(!token)throw Error('Please sign in again.');const response=await fetch('/api/private/'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...options.headers}});const data=await response.json();if(!response.ok)throw Error(data.error||'Request failed');return data;}
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)}),patch=(path,data)=>api(path,{method:'PATCH',body:JSON.stringify(data)});
async function rows(resource,query=''){return api(resource+'?'+query);}
function field(label,name,type='text',value='',choices){const l=element('label',label);const input=document.createElement(choices?'select':type==='textarea'?'textarea':'input');input.name=name;if(!choices&&type!=='textarea')input.type=type;if(choices)for(const [v,t]of choices){const option=element('option',t);option.value=v;input.append(option);}input.value=value??'';l.append(input);return l;}
function choose(label,name,list,selected='',optional=false){return field(label,name,'text',selected,[...(optional?[['','None / not linked']]:[]),...list.map(r=>[r.id,r.name||r.display_name||r.title||r.id])]);}
async function edit(title,fields,save,afterSave,submitLabel='Save'){
 $('#editor-form button[type=submit]').textContent=submitLabel;
 $('#editor-title').textContent=title;$('#editor-fields').replaceChildren(...fields);$('#editor-status').textContent='';$('#editor').showModal();
 $('#editor-form').onsubmit=async event=>{event.preventDefault();const submit=event.target.querySelector('button[type=submit]');submit.disabled=true;try{const data=Object.fromEntries(new FormData(event.target));const saved=await save(data);$('#editor').close();if(afterSave)await afterSave(saved);else await navigate(current);}catch(error){$('#editor-status').textContent=error.message;}finally{submit.disabled=false;}};
}
$('#cancel-edit').onclick=()=>$('#editor').close();
function toolbar(container){
 const bar=element('form',undefined,'toolbar');const resource=names[current];
 bar.append(field(resource==='enquiries'?'Search by name, email or message':resource==='contacts'?'Search by name or email':'Search','q'));
 if(resource==='enquiries'){bar.append(field('Follow-up status','status','text','',[['','All statuses'],...enquiryStates,['converted','Contact created — waiting for response']]),field('Interest','topic','text','',[['','All interests'],...Object.entries(topicNames)]));}
 else if(resource!=='contacts')bar.append(field('Status (optional)','status'));
 bar.append(field('From','from','date'),field('To','to','date'));bar.append(element('button','Apply filters'));
 bar.onsubmit=event=>{event.preventDefault();const params=new URLSearchParams(new FormData(bar));for(const [key,value]of [...params])if(!value)params.delete(key);if(params.get('to'))params.set('to',params.get('to')+'T23:59:59Z');page=0;loadList(resource,container,params.toString()).catch(error=>status(error.message));};container.append(bar);
}
function listValue(resource,row,key){
 if(key==='email_confirmation')return confirmationLabel(row.email_confirmation);
 if(key==='person_name')return enquiryPerson(row).name;
 if(key==='person_email')return enquiryPerson(row).email||'—';
 if(key==='interest')return contactFollowUp(row).interest;
 if(key==='follow_up')return contactFollowUp(row).status;
 if(key==='topic')return topicName(row.topic);
 if(key==='status')return resource==='enquiries'?stateName(row.status):friendly(row.status);
 return display(row[key],key);
}
async function table(resource,items,target){
 const grid=element('table');const header=element('tr');for(const col of columns[resource]||['name'])header.append(element('th',columnNames[col]||friendly(col)));header.append(element('th','Actions'));grid.append(header);
 for(const row of items){const tr=element('tr');for(const col of columns[resource]||['name']){const cell=element('td',listValue(resource,row,col));if(col==='status'||col==='follow_up'){cell.replaceChildren(element('span',listValue(resource,row,col),'status-badge'));}tr.append(cell);}
 const actions=element('td');actions.append(button('Open',()=>detail(resource,row.id),'secondary'));
 if(resource==='enquiries'&&me.role==='owner')actions.append(button(contactActionLabel(row),()=>row.contact_id?openContact(row.contact_id):createContactFromEnquiry(row)));
 tr.append(actions);grid.append(tr);}
 const wrap=element('div',undefined,'table-wrap');wrap.append(grid);target.append(wrap);
}

async function loadList(resource,container,query=''){const existing=container.querySelector('#list-results');existing?.remove();const target=element('div');target.id='list-results';container.append(target);const data=await rows(resource,query+'&offset='+page*50);target.append(element('p',`${data.total} records · Page ${page+1}`));if(!data.rows.length)target.append(element('p','Nothing here yet. New requests will appear when received.'));else await table(resource,data.rows,target);const actions=element('div',undefined,'actions');if(page>0)actions.append(button('Previous',()=>{page--;return loadList(resource,container,query)}));if((page+1)*50<data.total)actions.append(button('Next',()=>{page++;return loadList(resource,container,query)}));target.append(actions);}
async function navigate(name){current=name;const version=++stale;status('');const screen=element('section');$('#screen').replaceChildren(screen);screen.append(element('h1',name));$('#crm-nav').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.textContent===name?'page':'false'));
 try{if(name==='Overview')await overview(screen);else if(name==='Packages & Journeys')await packages(screen);else if(name==='Settings')await settings(screen);else{const resource=names[name];if(me.role==='owner'&&['contacts','appointments','tasks'].includes(resource))screen.append(button('New '+name.toLowerCase().replace(/s$/,''),()=>create(resource)));toolbar(screen);if(me.role==='owner'&&['contacts','appointments','tasks','enquiries'].includes(resource))screen.append(button('Export CSV',()=>exportCSV(resource),'secondary'));await loadList(resource,screen);}}catch(error){if(version===stale)status(error.message);} }
async function overview(screen){const now=new Date().toISOString();const specs=[['New enquiries','enquiries?status=new','Enquiries'],['Upcoming confirmed','appointments?status=confirmed&from='+now,'Appointments'],['Overdue follow-ups','tasks?status=open&to='+now,'Tasks'],['Failed notifications','notification_outbox?status=failed','Settings']];const tiles=element('div',undefined,'tiles');for(const [label,query,tab]of specs){const data=await api(query);const b=button('',()=>navigate(tab),'tile');b.append(element('strong',String(data.total)),element('span',label));tiles.append(b);}screen.append(tiles,element('p','Times are shown in Australia/Brisbane. A received request is not a confirmed appointment.','muted'));if(me.role==='owner'){const actions=element('div',undefined,'actions');actions.append(button('New enquiry',()=>{location.href='/contact.html?source=crm-manual'}));for(const [label,type]of [['New contact','contacts'],['New appointment','appointments'],['New task','tasks']])actions.append(button(label,()=>create(type)));screen.append(actions);}const next=await rows('appointments','status=confirmed&from='+now);screen.append(element('h2','Next appointments'));await table('appointments',next.rows.slice(0,5),screen);}
function labelledValues(values){const list=element('dl',undefined,'detail-fields');for(const [label,value]of values){if(value===null||value===undefined||value==='')continue;list.append(element('dt',label),element('dd',String(value)));}return list;}
function businessCard(title,values){const card=element('section',undefined,'business-card');card.append(element('h2',title),labelledValues(values));return card;}
function chooseState(item){const options=[...enquiryStates];if(item.status==='converted')options.splice(1,0,['converted','Contact created — waiting for response']);return field('Follow-up status','status','text',item.status,options);}
async function openContact(id){current='Contacts';$('#crm-nav').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.textContent==='Contacts'?'page':'false'));await detail('contacts',id);}
async function editEnquiryStatus(item,refresh){
 const staff=(await rows('staff_users')).rows;
 await edit('Update follow-up',[chooseState(item),choose('Assigned to','owner_id',staff,item.owner_id,true),field('Reason (required when closing)','closed_reason','textarea',item.closed_reason)],data=>patch('enquiries/'+item.id,{...data,owner_id:data.owner_id||null}),refresh);
}
function contactActionLabel(item){return item.contact_id?'View contact':item.matching_contacts?.length===1?'Link existing contact':item.matching_contacts?.length>1?'Choose existing contact':'Create contact';}
async function createContactFromEnquiry(item){
 const person=enquiryPerson(item);
 const find=person.email?(await rows('contacts','email_normalised='+encodeURIComponent(person.email.trim().toLowerCase()))).rows:[];
 const matches=find.filter(c=>!c.archived_at&&c.email_normalised===person.email.trim().toLowerCase());
 const save=async existing=>{const result=await post('rpc/convert_enquiry',{p_enquiry:item.id,p_contact:existing||null});await openContact(result.result);status('Enquiry linked to contact. Update its follow-up below.');};
 if(matches.length<=1){await save(matches[0]?.id);return;}
 await edit('Choose the existing contact',[
  element('p','More than one contact uses this email. Choose the person this enquiry belongs to.'),
  labelledValues([['Submitted name',person.name],['Submitted email',person.email]]),
  field('Contact','contact_id','text',matches[0].id,[...matches.map(c=>[c.id,c.name+' · '+(c.email_original||'No email')]),['__new__','Create a separate person who shares this email']])
 ],async data=>{const separate=data.contact_id==='__new__';const result=await post('rpc/convert_enquiry',{p_enquiry:item.id,p_contact:separate?null:data.contact_id,create_separate:separate});return result.result;},id=>openContact(id));
}
function confirmationLabel(value){return {pending:'Awaiting email confirmation',confirmed:'Email confirmed by reply',expired:'Email confirmation expired',superseded:'New confirmation requested',rate_limited:'Confirmation limit reached — try tomorrow',revoked:'Confirmation cancelled',not_requested:'Email confirmation not requested'}[value]||'Email confirmation setup pending';}
async function enquiryDetail(item,screen){
 const person=enquiryPerson(item),details=submittedDetails(item);
 screen.append(element('h1',person.name));
 const summary=element('div',undefined,'enquiry-summary');summary.append(element('span',topicName(item.topic),'interest-badge'),element('span',stateName(item.status),'status-badge'));screen.append(summary);
 const split=element('div',undefined,'split');
 split.append(businessCard('Person',[
  ['Email confirmation',confirmationLabel(item.email_confirmation)],['Name',person.name],['Email',person.email],['Phone',person.phone],['Preferred reply',friendly(person.preference)]
 ]));
 let assigned='Not assigned';if(item.owner_id){const member=(await api('staff_users/'+item.owner_id)).rows[0];assigned=member?.display_name||'Assigned staff member';}
 split.append(businessCard('Enquiry',[
  ['Interest',topicName(item.topic)],['Follow-up',stateName(item.status)],['Received',display(item.received_at,'received_at')],['Assigned to',assigned],
  ['Preferred date',details.preferred_date],['Preferred time',details.preferred_time?details.preferred_time+' · Queensland':null],
  ['Reiki level',details.attunement_level],['Format',details.format?friendly(details.format):null],
  ['Oracle release updates',details.release_update===true?'Requested separately':null],['Closed reason',item.closed_reason]
 ]));screen.append(split);
 const message=element('section',undefined,'business-card');message.append(element('h2','Message'),element('p',item.original_message||'No additional message.','message-text'));screen.append(message);
 if(me.role==='owner'){
  if(!item.contact_id&&item.matching_contacts?.length)screen.append(businessCard('Existing contacts with this email',item.matching_contacts.map(c=>['Contact',c.name+' · '+c.email_original])));
  const actions=element('div',undefined,'actions');
  actions.append(button(contactActionLabel(item),()=>item.contact_id?openContact(item.contact_id):createContactFromEnquiry(item)),button('Update status',()=>editEnquiryStatus(item,()=>detail('enquiries',item.id)),'secondary'),button('Add follow-up task',()=>create('tasks',{enquiry_id:item.id,contact_id:item.contact_id}),'secondary'));

  if(item.email_confirmation&&item.email_confirmation!=='confirmed'&&!['spam','closed'].includes(item.status))actions.append(button('Request email confirmation',async()=>{await post('rpc/request_email_confirmation',{p_enquiry:item.id});await post('notifications/process',{});await detail('enquiries',item.id);status('Confirmation request processed. Check Email notifications for sending status.');},'secondary'));
  screen.append(actions);
 }
 if(me.role==='owner')await emailPanel('enquiries',item,screen);
}
async function contactDetail(item,screen){
 screen.append(element('h1',item.name));
 screen.append(businessCard('Contact details',[
  ['Name',item.name],['Email',item.email_original],['Phone',item.phone],['Preferred reply',friendly(item.preference)],['Added',display(item.created_at,'created_at')],['Record',item.archived_at?'Archived':'Active']
 ]));
 if(me.role!=='owner')return;
 const actions=element('div',undefined,'actions');
 actions.append(button('Edit contact',()=>contactEditor(item)),button('Add follow-up task',()=>create('tasks',{contact_id:item.id}),'secondary'),button('Add note',()=>edit('Non-clinical note',[field('Note (do not include health histories)','note_text','textarea')],data=>post('internal_notes',{contact_id:item.id,note_text:data.note_text}),()=>openContact(item.id)),'secondary'));
 screen.append(actions);
 await emailPanel('contacts',item,screen);
 const data=await rows('enquiries','contact_id='+item.id);screen.append(element('h2','Interests & follow-up'));
 if(!data.rows.length)screen.append(element('p','No enquiries linked to this person yet.'));
 for(const enquiry of data.rows){
  const card=element('article',undefined,'business-card enquiry-history');
  card.append(element('h3',topicName(enquiry.topic)),element('span',stateName(enquiry.status),'status-badge'),element('p','Received '+display(enquiry.received_at,'received_at'),'muted'),element('p',enquiry.original_message||'No additional message.','message-text'));
  card.append(element('p',confirmationLabel(enquiry.email_confirmation),'muted'));
  const controls=element('div',undefined,'actions');controls.append(button('Update status',()=>editEnquiryStatus(enquiry,()=>openContact(item.id))),button('Open enquiry',()=>detail('enquiries',enquiry.id),'secondary'));card.append(controls);screen.append(card);
 }
 if(data.total>data.rows.length)screen.append(element('p',`Showing the latest ${data.rows.length} of ${data.total} enquiries. Use the enquiries inbox to search older records.`,'muted'));
 const [appointments,tasks,consents,notes]=await Promise.all(['appointments','tasks','consent_events','internal_notes'].map(type=>rows(type,'contact_id='+item.id)));
 screen.append(element('h2','Appointments'));if(appointments.rows.length)await table('appointments',appointments.rows,screen);else screen.append(element('p','No appointments arranged yet.'));
 screen.append(element('h2','Follow-up tasks'));if(tasks.rows.length)await table('tasks',tasks.rows,screen);else screen.append(element('p','No follow-up tasks yet.'));
 screen.append(element('h2','Notes'));if(!notes.rows.length)screen.append(element('p','No notes added.'));
 for(const note of notes.rows)screen.append(businessCard('Note',[['Added',display(note.created_at,'created_at')],['Note',note.note_text]]));
 const permissions=element('details',undefined,'business-card');permissions.append(element('summary','Contact permissions & history'));
 if(!consents.rows.length)permissions.append(element('p','No permission changes recorded.'));
 const purposes={respond:'Reply about an enquiry',marketing:'Marketing',release_update:'Oracle release updates',publish_feedback:'Publish feedback',booking_request:'Booking request acknowledgement'};
 for(const consent of consents.rows)permissions.append(element('p',`${purposes[consent.purpose]||friendly(consent.purpose)} · ${consent.granted?'Granted':'Not granted / withdrawn'} · ${display(consent.created_at,'created_at')}`));
 permissions.append(button('Record permission change',()=>edit('Record consent change',[field('Purpose','purpose','text','marketing',[['marketing','Marketing'],['release_update','Oracle release updates'],['respond','Contact permission']]),field('Permission','granted','text','false',[['false','Withdrawn'],['true','Granted']])],d=>post('rpc/record_consent',{p_contact:item.id,p_purpose:d.purpose,p_granted:d.granted==='true'}),()=>openContact(item.id)),'secondary'));screen.append(permissions);
 const management=element('details',undefined,'business-card');management.append(element('summary','Manage this contact'));
 management.append(button(item.archived_at?'Unarchive contact':'Archive contact',async()=>{await patch('contacts/'+item.id,{archived_at:item.archived_at?null:new Date().toISOString()});await openContact(item.id)},'secondary'),button('Review duplicate merge',()=>merge(item),'secondary'),button('Review erasure',()=>edit('Irreversible anonymisation — review retention first',[element('p','This removes ordinary contact details, linked submission messages and ordinary notes. Review retention requirements and backups before proceeding.'),field('Type ERASE '+item.id,'confirmation')],d=>post('rpc/erase_contact',{p_contact:item.id,p_confirmation:d.confirmation}),()=>openContact(item.id)),'secondary'));screen.append(management);
}
async function emailPanel(resource,item,screen,offset=0){
 const panel=element('section',undefined,'business-card client-email-panel');screen.querySelector('.client-email-panel')?.remove();screen.append(panel);panel.append(element('h2','Email conversation'));
 const path=resource+'/'+item.id+'/emails';const data=await api(path+'?offset='+offset);
 if(!data.installed){panel.append(element('p','Email conversations need the database upgrade 202610260005_client_email.sql. Existing enquiries and confirmation still work.'));return;}
 const refresh=()=>detail(resource,item.id);
 if(!data.configured)panel.append(element('p','Email setup needed: '+data.missing.join(', '),'muted'));
 const controls=element('div',undefined,'actions');const compose=button('Write email',async()=>{
  let requestKey=crypto.randomUUID(),last='';
  const initial=data.threads[0];
  const fields=[field('Subject','subject','text',initial?.subject||(resource==='enquiries'?'Heartara — '+topicName(item.topic):'Heartara')),
   field('Message','body','textarea','')];
  if(data.threads.length)fields.unshift(field('Conversation','thread_id','text',initial.id,data.threads.map(t=>[t.id,t.subject+' · '+t.recipient_email])));
  await edit('Send email to client',fields,async draft=>{
   const signature=JSON.stringify(draft);if(last&&last!==signature)requestKey=crypto.randomUUID();last=signature;
   return api(path,{method:'POST',headers:{'Idempotency-Key':requestKey},body:signature});
  },async()=>{await refresh();status('Email queued. Delivery status appears in the conversation. You can write another message at any time.');},'Send email');
 });compose.disabled=!data.configured||(resource==='contacts'&&Boolean(item.archived_at));controls.append(compose,button('Refresh conversation',refresh,'secondary'));panel.append(controls);
 panel.append(element('p','Replies sent here return to this conversation and the linked client file. Email confirmation does not limit how often you can respond.','muted'));
 if(!data.messages.length)panel.append(element('p','No emails in this conversation yet. Earlier messages from a separate mailbox are not imported.'));
 const states={queued:'Queued — not sent yet',provider_accepted:'Accepted by email service',delivered:'Delivered',bounced:'Bounced',failed:'Failed',received:'Received',cancelled:'Cancelled'};
 for(const message of data.messages){const card=element('article',undefined,'email-message record');
  card.append(element('h3',message.subject),element('p',(message.direction==='inbound'?'Client → Penny':'Penny → client')+' · '+display(message.created_at,'created_at')+' · '+(states[message.status]||friendly(message.status)),'muted'),element('p',message.body||'(Empty reply)','message-text'));
  if(message.attachment_count)card.append(element('p',message.attachment_count+' attachment(s) were not imported. Ask the client to provide essential details as text.','muted'));
  panel.append(card);
 }
 if(offset>0)panel.append(button('Newer messages',()=>emailPanel(resource,item,screen,Math.max(0,offset-50)),'secondary'));
 if(offset+data.messages.length<data.total)panel.append(button('Older messages',()=>emailPanel(resource,item,screen,offset+50),'secondary'));
}
async function detail(resource,id){
 const item=(await api(resource+'/'+id)).rows[0];if(!item)throw Error('Record not available.');
 const screen=element('section');$('#screen').replaceChildren(screen);screen.append(button('← Back',()=>navigate(current),'secondary'));
 if(resource==='enquiries')return enquiryDetail(item,screen);
 if(resource==='contacts')return contactDetail(item,screen);
 screen.append(element('h1',item.name||item.title||item.display_name||friendly(resource).replace(/s$/,'')));
 const visible={appointments:['starts_at','ends_at','status','mode','location_private','payment_state','change_reason'],tasks:['title','due_at','status','completed_at'],services:['name','category','reiki_level','description','duration_minutes','price_minor','status'],feedback:['display_name','original_text','public_text','permission','status','created_at'],client_journeys:['name','mode','status','created_at']}[resource]||['name','status','created_at'];
 const fields=visible.map(key=>[columnNames[key]||friendly(key),typeof item[key]==='boolean'?(item[key]?'Yes':'No'):key==='status'?friendly(item[key]):display(item[key],key)]);
 screen.append(labelledValues(fields));
 if(me.role!=='owner')return;
 const actions=element('div',undefined,'actions');
 if(resource==='appointments')actions.append(button('Reschedule / change status',()=>edit('Appointment change',[field('Start (Brisbane)','starts_at','datetime-local',localInput(item.starts_at)),field('End (Brisbane)','ends_at','datetime-local',localInput(item.ends_at)),field('Status','status','text',item.status,['requested','tentative','confirmed','completed','cancelled','no_show'].map(v=>[v,friendly(v)])),field('Reason','change_reason','textarea')],d=>patch(resource+'/'+id,{...d,starts_at:toUTC(d.starts_at),ends_at:toUTC(d.ends_at)}),()=>detail(resource,id))));
 if(resource==='tasks')actions.append(button('Complete task',()=>patch(resource+'/'+id,{status:'completed'}).then(()=>detail(resource,id))));
 if(resource==='services')actions.append(button('Edit service',()=>edit('Service catalogue',[field('Name','name','text',item.name),field('Description','description','textarea',item.description),field('Price in cents (blank = on enquiry)','price_minor','number',item.price_minor),field('Duration minutes (blank = agreed individually)','duration_minutes','number',item.duration_minutes),field('Buffer before (minutes)','buffer_before','number',item.buffer_before),field('Buffer after (minutes)','buffer_after','number',item.buffer_after),field('Status','status','text',item.status,['draft','active','inactive'].map(x=>[x,friendly(x)]))],d=>patch(resource+'/'+id,{...d,price_minor:d.price_minor===''?null:Number(d.price_minor),duration_minutes:d.duration_minutes===''?null:Number(d.duration_minutes),buffer_before:Number(d.buffer_before),buffer_after:Number(d.buffer_after)}),()=>detail(resource,id))));
 if(resource==='feedback')actions.append(button('Review & moderate',()=>edit('Feedback publication',[field('Public wording (original retained)','public_text','textarea',item.public_text),field('State','status','text',item.status,['pending_review','approved','published','rejected','withdrawn'].map(v=>[v,friendly(v)])),field('Display order','display_order','number',item.display_order)],d=>patch(resource+'/'+id,{...d,display_order:Number(d.display_order)}),()=>detail(resource,id))));
 screen.append(actions);
}

function localInput(iso){return new Date(new Date(iso).valueOf()+10*3600000).toISOString().slice(0,16)}
function toUTC(value){if(!value)throw Error('Date/time is required');return new Date(value+':00+10:00').toISOString();}
async function contactEditor(item={}){return edit(item.id?'Edit contact':'New contact',[field('Name','name','text',item.name),field('Email','email_original','email',item.email_original),field('Phone','phone','tel',item.phone),field('Reply preference','preference','text',item.preference||'email',[['email','Email'],['phone','Phone'],['either','Either']])],d=>item.id?patch('contacts/'+item.id,d):post('contacts',d),saved=>openContact(saved.id));}
async function create(resource,context={}){if(resource==='contacts')return contactEditor();const [contacts,services,staff]=await Promise.all(['contacts','services','staff_users'].map(x=>rows(x)));if(resource==='tasks')return edit('New follow-up',[field('Title','title'),choose('Owner','owner_id',staff.rows,me.id),field('Due (Brisbane)','due_at','datetime-local'),choose('Contact','contact_id',contacts.rows,context.contact_id,true)],d=>post(resource,{...d,...context,contact_id:d.contact_id||context.contact_id||null,due_at:toUTC(d.due_at)}));
 if(resource==='appointments'){const packages=(await rows('client_packages')).rows,journeys=(await rows('client_journeys')).rows;return edit('New appointment — manually arranged',[choose('Contact','contact_id',contacts.rows,'',true),choose('Service / agreed terms','service_id',services.rows),choose('Practitioner','practitioner_id',staff.rows,me.id),choose('Package (must match contact/service)','package_id',packages,'',true),choose('Journey (one slot for the group)','journey_id',journeys,'',true),field('Start (Brisbane)','starts_at','datetime-local'),field('End (Brisbane, agreed duration required)','ends_at','datetime-local'),field('Status','status','text','requested',['requested','tentative','confirmed'].map(v=>[v,v])),field('Mode','mode','text','in_person',['in_person','distance','group'].map(v=>[v,v])),field('Private location / distance channel','location_private')],d=>post(resource,{...d,contact_id:d.contact_id||null,package_id:d.package_id||null,journey_id:d.journey_id||null,starts_at:toUTC(d.starts_at),ends_at:toUTC(d.ends_at)}));}}
async function packages(screen){const data=await Promise.all([rows('client_packages'),rows('client_journeys'),rows('contacts'),rows('services'),rows('staff_users')]);const [pk,journeys,contacts,services,staff]=data;screen.append(element('p','Packages have three entitlements. Only completed linked appointments consume a session; rescheduling and cancellations do not invent forfeiture. Rites are recorded individually, separately from attendance.'));
 if(me.role==='owner'){const actions=element('div',undefined,'actions');actions.append(button('Accept a three-session package',()=>edit('Owner-approved package',[choose('Contact','contact_id',contacts.rows),choose('Package','service_id',services.rows.filter(s=>s.category==='package'))],d=>post('client_packages',d))),button('Create a Munay Ki journey',()=>edit('New nine-rite journey',[field('Journey name','name'),field('Format','mode','text','individual',[['individual','Individual'],['group','Group, maximum three']]),choose('Practitioner','practitioner_id',staff.rows,me.id)],d=>post('client_journeys',d))),button('Add participant',()=>edit('Journey participant',[choose('Journey','journey_id',journeys.rows),choose('Contact','contact_id',contacts.rows)],d=>post('journey_participants',d))),button('Link a meeting',async()=>{const a=await rows('appointments');return edit('Meeting slot',[choose('Journey','journey_id',journeys.rows),choose('Existing journey appointment','appointment_id',a.rows),field('Meeting number','sequence','number','1')],d=>post('journey_meetings',{...d,sequence:Number(d.sequence)}))}),button('Record a rite received',async()=>{const participants=await rows('journey_participants'),meetings=await rows('journey_meetings');return edit('Record actual receipt, not just attendance',[choose('Participant','participant_id',participants.rows),field('Rite number (1–9)','rite','number','1'),field('Date received','received_at','date'),choose('Meeting (optional)','meeting_id',meetings.rows,'',true)],d=>post('rite_completion_events',{...d,rite:Number(d.rite),meeting_id:d.meeting_id||null}))}));screen.append(actions);}
 const balances=(await post('rpc/package_balances',{})).result;screen.append(element('h2','Packages'));for(const pkg of pk.rows){const remaining=balances.find(b=>b.package_id===pkg.id)?.remaining??3;screen.append(element('p',`${contacts.rows.find(c=>c.id===pkg.contact_id)?.name||pkg.contact_id}: ${remaining} of 3 sessions remaining · ${pkg.payment_state}`));}
 screen.append(element('h2','Journeys'));await table('client_journeys',journeys.rows,screen);const rites=await rows('rite_completion_events'),participants=await rows('journey_participants');screen.append(element('h2','Participants & rites received'));for(const participant of participants.rows){screen.append(element('p',`${contacts.rows.find(c=>c.id===participant.contact_id)?.name||participant.contact_id} · ${journeys.rows.find(j=>j.id===participant.journey_id)?.name||participant.journey_id}: rites ${rites.rows.filter(r=>r.participant_id===participant.id).map(r=>r.rite).sort((a,b)=>a-b).join(', ')||'none recorded'}`));}}
async function merge(contact){const others=(await rows('contacts')).rows.filter(c=>c.id!==contact.id&&!c.archived_at);await edit('Preview duplicate merge',[choose('Merge this contact into '+contact.name,'remove',others)],async d=>{const preview=await post('merge-preview',{keep:contact.id,remove:d.remove});$('#editor').close();const fields=[labelledValues([['Keep',contact.name],...preview.contacts.filter(c=>c.id!==contact.id).map(c=>['Merge from',c.name+' · '+(c.email_original||'No email')]),...Object.entries(preview.affected).map(([type,count])=>[friendly(type),count+' linked records'])]),field('Surviving name','name','text',contact.name),field('Surviving email','email','email',contact.email_original),field('Surviving phone','phone','text',contact.phone)];setTimeout(()=>edit('Review affected records before merging',fields,x=>post('rpc/merge_contacts',{p_keep:contact.id,p_remove:d.remove,p_name:x.name,p_email:x.email,p_phone:x.phone})),0);});}
async function settings(screen){if(me.role!=='owner'){screen.append(element('p','Settings, exports and user administration are owner-only.'));return;}const config=(await rows('business_settings')).rows[0];screen.append(element('h2','Business settings'),element('p','Timezone: Australia/Brisbane · Currency: AUD. Keep the home session address private.'));screen.append(button('Edit settings',()=>edit('Business settings',[field('Owner notification recipient','notification_email','email',config.notification_email),field('Enable configured owner alerts','notification_enabled','text',String(config.notification_enabled),[['false','Off'],['true','On, after sender verification']]),field('Private session address','private_address','textarea',config.private_address),field('Reviewed retention categories','retention_policy','textarea',config.retention_policy)],d=>patch('business_settings/true',{...d,notification_enabled:d.notification_enabled==='true'}))));
 screen.append(element('h2','Authenticator protection'),button('Set up authenticator',async()=>{const result=await auth.auth.mfa.enroll({factorType:'totp',friendlyName:'Heartara owner'});if(result.error)throw result.error;const img=element('img');img.src=result.data.totp.qr_code;img.alt='Scan this QR code in your authenticator';img.className='qr';await edit('Scan and verify',[img,field('Six-digit authenticator code','code')],async d=>{const verified=await auth.auth.mfa.challengeAndVerify({factorId:result.data.id,code:d.code});if(verified.error)throw verified.error;await post('staff',{user_id:me.id,display_name:me.display_name,role:'owner',active:true,require_mfa:true});});}));
 screen.append(element('h2','Users & roles'),element('p','Create or invite the identity through Supabase Auth first. Link its user UUID here; never create a password in the CRM. Revocation takes effect on every API request.'));screen.append(button('Grant or revoke staff access',()=>edit('Staff membership',[field('Supabase Auth user UUID','user_id'),field('Display name','display_name'),field('Role','role','text','assistant',['owner','practitioner','assistant'].map(x=>[x,x])),field('Access','active','text','true',[['true','Active'],['false','Revoked']])],d=>post('staff',{...d,active:d.active==='true'}))));
 screen.append(element('h2','Leave / unavailable times'),button('Add practitioner block',async()=>{const staff=await rows('staff_users');return edit('Unavailable time',[choose('Practitioner','practitioner_id',staff.rows,me.id),field('Start (Brisbane)','starts_at','datetime-local'),field('End (Brisbane)','ends_at','datetime-local'),field('Reason','reason')],d=>post('practitioner_blocks',{...d,starts_at:toUTC(d.starts_at),ends_at:toUTC(d.ends_at)}))}));
 screen.append(element('h2','Email notifications'));
 const email=await api('notifications/config');
 screen.append(businessCard('Penny’s email alerts',[
  ['Send alerts to',email.recipient||'No recipient saved'],
  ['Alerts',email.ready?'Enabled and configured (delivery still needs testing)':email.enabled?'Enabled, setup incomplete':'Off'],
  ['Email service',email.mode==='resend'?'Resend':'Not enabled — no live email is sent'],
  ['Sender',email.sender||'No verified sender configured'],
  ['Required Vercel settings',email.missing.join(', ')||'Present'],
  ['Address check',email.recipient_matches?'Matches saved recipient':'OWNER_NOTIFICATION_EMAIL differs from the saved recipient']
 ]));
 if(email.configured&&!email.enabled)screen.append(button('Enable email notifications',async()=>{await patch('business_settings/true',{notification_enabled:true});await navigate('Settings');}));
 if(email.ready||email.confirmation?.ready)screen.append(button('Send queued notifications now',async()=>{const result=await post('notifications/process',{});await navigate('Settings');status(`${result.processed||0} queued notifications processed. Check their status below; provider accepted is not proof of inbox delivery.`);}));
 if(!email.configured)screen.append(element('p','Connect Resend in Vercel with RESEND_API_KEY, EMAIL_FROM and EMAIL_MODE=resend, then redeploy. Penny’s saved email address is used as the recipient. No notification is sent until setup is complete.','muted'));
 screen.append(element('h2','Visitor email confirmation'));
 const confirmation=email.confirmation;
 if(confirmation){
  screen.append(element('p',confirmation.ready?'Reply confirmation is enabled. Penny is alerted immediately; visitor confirmation is tracked separately.':'Reply confirmation is not active. Penny’s alerts continue separately.'));
  if(!confirmation.installed)screen.append(element('p','Install incremental migration 202610260004_email_confirmation.sql in Supabase.'));
  if(confirmation.missing.length)screen.append(element('p','Receiving setup needed: '+confirmation.missing.join(', '),'muted'));
  if(confirmation.configured&&!confirmation.enabled)screen.append(button('Enable visitor confirmation emails',async()=>{await post('confirmations/enable',{});await navigate('Settings');}));
 }
 const jobs=await rows('notification_outbox');
 for(const job of jobs.rows){const div=element('div',undefined,'record');const label={queued:'Waiting to send',processing:'Sending',provider_accepted:'Accepted by email service',delivered:'Delivered',bounced:'Bounced',failed:'Failed',sandboxed:'Preview only — no email sent'}[job.status]||friendly(job.status);div.append(element('p',`${job.template==='customer_email_confirmation'?'Visitor confirmation':job.template==='client_reply'?'Email to client':job.template==='owner_client_reply'?'Client reply alert':'Penny’s alert'} · ${label} · ${job.attempts} attempts`));if(job.safe_error)div.append(element('p',job.safe_error,'muted'));if(['failed','bounced'].includes(job.status))div.append(button('Queue for retry after checking the sender',()=>post('rpc/retry_notification',{p_id:job.id}).then(()=>navigate('Settings'))));screen.append(div);}

 screen.append(element('h2','Data management'),element('p','Archive contacts from their profile. Erasure and backup restoration require the reviewed database procedure in crm/README.md; archival is not deletion. No clinical records should be entered.'));}
async function exportCSV(resource){const token=(await auth.auth.getSession()).data.session.access_token;const response=await fetch('/api/private/export?resource='+resource,{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('Export unavailable');const url=URL.createObjectURL(await response.blob());const link=element('a');link.href=url;link.download=`heartara-${resource}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function enter(){if(recoveryMode){$('#login').hidden=false;$('#workspace').hidden=true;$('#login-form').hidden=true;$('#recovery-form').hidden=false;return;}const result=await auth.auth.getSession();session=result.data.session;if(!session)return;const factors=await auth.auth.mfa.listFactors();const factor=factors.data?.totp?.find(f=>f.status==='verified');const assurance=await auth.auth.mfa.getAuthenticatorAssuranceLevel();if(factor&&assurance.data.currentLevel!=='aal2'){mfaFactor=factor.id;$('#login-form').hidden=true;$('#mfa-form').hidden=false;return;}me=await api('me');$('#login').hidden=true;$('#workspace').hidden=false;const actions=$('#session-actions');actions.replaceChildren(button('Sign out',async()=>{await auth.auth.signOut();location.reload()}));$('#crm-nav').replaceChildren(...Object.keys(names).map(name=>button(name,()=>{page=0;return navigate(name)})));await navigate('Overview');}
$('#login-form').onsubmit=async event=>{event.preventDefault();status('Signing in…');try{const r=await auth.auth.signInWithPassword({email:$('#login-email').value,password:$('#login-password').value});$('#login-password').value='';if(r.error)throw Error('Could not sign in. Check your details or reset your password.');await enter();}catch(error){status(error.message)}};
$('#mfa-form').onsubmit=async event=>{event.preventDefault();const r=await auth.auth.mfa.challengeAndVerify({factorId:mfaFactor,code:$('#mfa-code').value});$('#mfa-code').value='';if(r.error)return status('The code could not be verified.');await enter().catch(e=>status(e.message));};
$('#recover').onclick=async()=>{const email=$('#login-email').value;if(!email)return status('Enter your login email first.');await auth.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/crm/'});status('If that account is registered, a password reset message will be sent.');};
$('#recovery-form').onsubmit=async event=>{event.preventDefault();const r=await auth.auth.updateUser({password:$('#new-password').value});$('#new-password').value='';if(r.error)return status('Password could not be updated.');status('Password updated. Sign in to continue.');await auth.auth.signOut();location.href='/crm/';};
(async()=>{try{const response=await fetch('/api/config');const config=await response.json();if(!response.ok)throw Error(config.error);auth=createClient(config.supabaseUrl,config.publishableKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});auth.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY'){$('#login').hidden=false;$('#workspace').hidden=true;$('#login-form').hidden=true;$('#recovery-form').hidden=false;}});await enter();}catch(error){status(error.message);$('#login-form').querySelector('button').disabled=true;}})();
