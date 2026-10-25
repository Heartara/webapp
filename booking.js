import {queenslandDate,weekday,requestError} from './booking-rules.js?v=weekend-hours';
const calendar=document.querySelector('#booking-calendar');
const dateInput=document.querySelector('#booking-date');
const clock=document.querySelector('#booking-clock');
const selection=document.querySelector('#calendar-selection');
const guidance=document.querySelector('#booking-time-guidance');
const today=queenslandDate();
let [year,month]=today.split('-').map(Number);month--;
dateInput.min=today;
const label=key=>new Intl.DateTimeFormat('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T00:00:00Z'));
function selectDate(key){
 dateInput.value=key;
 const day=weekday(key),evening=day>=2&&day<=5,weekend=day===0||day===6;
 clock.min=weekend?'09:00':evening?'17:00':'';
 clock.max=weekend?'17:00':'';
 clock.setCustomValidity('');
 guidance.textContent=evening?'Tuesday to Friday: request an evening time from 5 pm (Queensland).':weekend?'Saturday and Sunday: choose a preferred time between 9 am and 5 pm (Queensland). Penny will get back in touch to confirm.':'Monday: enter your preferred time (Queensland).';
 selection.textContent=label(key)+' selected. Choose a preferred time below. Penny will personally confirm whether she is available.';
 render();
}
function render(){
 calendar.replaceChildren();
 document.querySelector('#calendar-month').textContent=new Intl.DateTimeFormat('en-AU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
 document.querySelector('#calendar-prev').disabled=year===Number(today.slice(0,4))&&month===Number(today.slice(5,7))-1;
 for(const name of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const el=document.createElement('div');el.className='calendar-weekday';el.textContent=name;calendar.append(el);}
 const offset=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;
 for(let i=0;i<offset;i++){const blank=document.createElement('div');blank.setAttribute('aria-hidden','true');calendar.append(blank);}
 const days=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 for(let day=1;day<=days;day++){
  const key=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const dow=weekday(key),evening=dow>=2&&dow<=5,weekend=dow===0||dow===6,past=key<queenslandDate();
  const button=document.createElement('button');button.type='button';button.className='calendar-day'+(evening?' evening':'');button.disabled=past;
  button.textContent=day;button.setAttribute('aria-pressed',String(dateInput.value===key));
  button.setAttribute('aria-label',label(key)+(past?' — past date':weekend?' — request between 9 am and 5 pm, subject to confirmation':evening?' — request from 5 pm, subject to confirmation':' — request a time, subject to confirmation'));
  const note=document.createElement('span');note.textContent=past?'Past':weekend?'9 am–5 pm':evening?'From 5 pm':'By request';button.append(note);
  button.addEventListener('click',()=>{selectDate(key);clock.focus();});calendar.append(button);
 }
}
document.querySelector('#calendar-prev').addEventListener('click',()=>{if(month===0){month=11;year--;}else month--;render();});
document.querySelector('#calendar-next').addEventListener('click',()=>{if(month===11){month=0;year++;}else month++;render();});
dateInput.addEventListener('change',()=>{if(weekday(dateInput.value)!==null){[year,month]=dateInput.value.split('-').map(Number);month--;selectDate(dateInput.value);}});
clock.addEventListener('input',()=>clock.setCustomValidity(''));
render();
const slots=document.querySelector('#appointment-slots');
fetch('availability.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(items=>{
 if(!Array.isArray(items))throw Error();
 const upcoming=items.filter(item=>typeof item.start==='string'&&Date.parse(item.start)>Date.now()&&typeof item.type==='string').sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 if(!upcoming.length)return;
 const heading=document.createElement('h3');heading.textContent='Additional times shared by Penny';slots.append(heading);
 upcoming.forEach(item=>{
  const row=document.createElement('div');row.className='slot';const link=document.createElement('a');link.href='#request';
  const instant=new Date(item.start),key=queenslandDate(instant);
  const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Australia/Brisbane',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant);
  link.textContent=label(key)+' · '+time+' Queensland · '+item.type+' (request only)';
  link.addEventListener('click',()=>{[year,month]=key.split('-').map(Number);month--;selectDate(key);clock.value=time;});row.append(link);slots.append(row);
 });
}).catch(()=>{slots.textContent='Additional appointment information could not be loaded. You can still request your preferred date using the calendar.';});
document.querySelector('#booking-form').addEventListener('submit',event=>{
 event.preventDefault();
 const error=requestError(dateInput.value,clock.value);
 clock.setCustomValidity(error);
 if(!event.target.reportValidity())return;
 const value=id=>document.querySelector(id).value.trim();
 const preferred=label(dateInput.value)+' at '+clock.value+' (Queensland AEST)';
 document.querySelector('#booking-time').value=preferred;
 const body=`Name: ${value('#booking-name')}\nEmail: ${value('#booking-email')}\nSession: ${value('#booking-service')}\nRequested time: ${preferred}\n\n${value('#booking-note')}\n\nI understand this is a request only. My appointment is not booked until Penny personally confirms it.`;
 window.location.href='mailto:heartarahealing@gmail.com?subject='+encodeURIComponent('Heartara appointment request')+'&body='+encodeURIComponent(body);
 document.querySelector('#booking-status').textContent='Your email app will open. Please review and send your request there. If it does not open, email heartarahealing@gmail.com directly. No appointment has been booked. Penny will reply to confirm availability or arrange another time.';
});
