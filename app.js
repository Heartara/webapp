const menu = document.querySelector('.menu');
const navigation = document.querySelector('#navigation');
menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); navigation.classList.toggle('open', open); });
navigation?.addEventListener('click', event => { if (event.target.closest('a')) { menu.setAttribute('aria-expanded', 'false'); navigation.classList.remove('open'); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') { menu.setAttribute('aria-expanded', 'false'); navigation.classList.remove('open'); menu.focus(); } });
const search = document.querySelector('#card-search');
search?.addEventListener('input', () => { const query = search.value.trim().toLowerCase(); let count = 0; document.querySelectorAll('[data-card]').forEach(card => { card.hidden = !card.dataset.card.includes(query); if (!card.hidden) count++; }); document.querySelector('#card-count').textContent = query ? `${count} matching ${count === 1 ? 'card' : 'cards'}` : '44 main cards'; });

// Keep the shared navigation current on existing pages as well as the new ones.
if(navigation && !navigation.querySelector('a[href="munay-ki.html"]')) {
  const link=document.createElement('a');link.href='munay-ki.html';link.textContent='Munay Ki';
  navigation.insertBefore(link,navigation.querySelector('.button'));
}
const bookingLink=navigation?.querySelector('.button');
if(bookingLink){bookingLink.href='booking.html';bookingLink.textContent='Book a session ↗';}
const ritesLink=document.querySelector('.offerings a[href="offerings.html#munay-ki"]');
if(ritesLink){ritesLink.href='munay-ki.html';ritesLink.previousElementSibling.textContent='All nine rites: $450 for an individual journey, or $300 per person in a group of three. Explore sacred space, ceremony and my Peru journey.';}
const availability=document.querySelector('.offerings .availability');
if(availability){availability.textContent='In-person and distance Reiki · Three-session packages from AUD $280. Weekends, Mondays and selected weekday evenings after 5 pm. ';const link=document.createElement('a');link.href='booking.html';link.textContent='Request a booking →';availability.append(link);}


// Penny's own photographs bring each offering to life.
const offeringPhotos = [
  {src:'assets/peru-1.webp', alt:'Penny beside a waterfall, surrounded by green forest'},
  {src:'assets/peru-6.webp', alt:'Penny taking part in a ceremony beside a tree in Peru'},
  {src:'assets/peru-3.webp', alt:'Penny standing beside the warm glow of a sacred fire'}
];
document.querySelectorAll('.offerings .line-symbol').forEach((frame,index)=>{
  const photo=offeringPhotos[index];if(!photo)return;
  const img=document.createElement('img');img.src=photo.src;img.alt=photo.alt;img.loading='lazy';img.decoding='async';
  frame.classList.add('offering-photo');frame.replaceChildren(img);
});


// A clear contact route on every page, with email kept on the contact page.
if(navigation && !navigation.querySelector('a[href="contact.html"]')){
 const link=document.createElement('a');link.href='contact.html';link.textContent='Contact';navigation.insertBefore(link,navigation.querySelector('.button'));
}
if(!location.pathname.endsWith('/contact.html')){
 document.querySelectorAll('footer a[href^="mailto:"]').forEach(link=>{link.href='contact.html';});
}

// Connect visitors with Penny's Heartara Facebook community.
const facebookGroup='https://www.facebook.com/groups/heartara';
document.querySelectorAll('footer').forEach(footer=>{
  if(footer.querySelector('a[href="'+facebookGroup+'"]'))return;
  const paragraph=document.createElement('p');
  const link=document.createElement('a');
  link.href=facebookGroup;link.target='_blank';link.rel='noopener noreferrer';
  link.textContent='Join the Heartara Facebook group ↗';
  link.style.textDecoration='underline';
  paragraph.append(link);footer.append(paragraph);
});

// Refresh the shared design when a browser has retained an older stylesheet.
const themeLink=document.querySelector('link[rel="stylesheet"][href^="styles.css"]');
if(themeLink){themeLink.href='styles.css?v=close-logo-20261025';}

// Make the full disclaimer and client rights available from every page.
document.querySelectorAll('footer').forEach(footer=>{
 const summary=footer.querySelector('small');
 if(summary)summary.textContent='Heartara offers complementary wellbeing and spiritual practices. These do not replace medical or mental health care. Individual experiences vary; no particular outcome is guaranteed. Your Australian Consumer Law rights are preserved.';
 const paragraph=document.createElement('p');const link=document.createElement('a');
 link.href='disclaimer.html';link.textContent='Disclaimer, privacy & client rights';link.style.textDecoration='underline';paragraph.append(link);footer.append(paragraph);
});

// Frame the original artwork closely, including browsers without object-view-box support.
document.querySelectorAll('.logo-brand img').forEach(img=>{
 if(img.parentElement.classList.contains('logo-mark'))return;
 const frame=document.createElement('span');frame.className='logo-mark';
 frame.style.cssText='display:block;max-width:none;overflow:hidden;border-radius:50%;flex-shrink:0;line-height:0;';
 img.before(frame);frame.append(img);
 img.style.objectViewBox='none';img.style.objectFit='contain';
 img.style.borderRadius='0';img.style.transform='scale(1.56)';
});
