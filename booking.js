const slots = document.querySelector('#appointment-slots');
fetch('availability.json', {cache:'no-store'}).then(r => {if(!r.ok) throw Error(); return r.json();}).then(items => {
  if(!Array.isArray(items)) throw Error();
  slots.replaceChildren();
  const upcoming = items.filter(item => typeof item.start === 'string' && Date.parse(item.start) > Date.now() && typeof item.type === 'string').sort((a,b) => Date.parse(a.start)-Date.parse(b.start));
  if(!upcoming.length) {slots.textContent='Please contact Penny for the next available appointments.';return;}
  upcoming.forEach(item => {const row=document.createElement('div');row.className='slot';const link=document.createElement('a');const time=new Intl.DateTimeFormat('en-AU',{dateStyle:'full',timeStyle:'short',timeZone:'Australia/Brisbane'}).format(new Date(item.start));link.textContent=time+' (Queensland) · '+item.type;link.href='#request';link.addEventListener('click',()=>{document.querySelector('#booking-time').value=time+' (Queensland) · '+item.type;});row.append(link);slots.append(row);});
}).catch(()=>{slots.textContent='Availability could not be loaded. Please contact Penny with your preferred times.';});
document.querySelector('#booking-form').addEventListener('submit',event=>{
  event.preventDefault();if(!event.target.reportValidity())return;
  const value=id=>document.querySelector(id).value.trim();
  const body=`Name: ${value('#booking-name')}\nEmail: ${value('#booking-email')}\nSession: ${value('#booking-service')}\nPreferred time: ${value('#booking-time')}\n\n${value('#booking-note')}\n\nI understand my appointment is subject to confirmation.`;
  window.location.href='mailto:heartarahealing@gmail.com?subject='+encodeURIComponent('Heartara booking request')+'&body='+encodeURIComponent(body);
  document.querySelector('#booking-status').textContent='Your email app will open. Please review and send your request there. If it does not open, email heartarahealing@gmail.com directly. Your appointment is not yet confirmed.';
});
