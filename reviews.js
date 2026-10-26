const reviewGrid=document.querySelector('#published-reviews');
const reviewBase=(window.HEARTARA_CRM?.apiBase||'').replace(/\/$/,'');
// Legacy approved reviews remain displayed until the backend is connected and imported.
const reviewURL=reviewBase?reviewBase+'/api/public/reviews':location.hostname.endsWith('github.io')?'reviews.json':'/api/public/reviews';
fetch(reviewURL,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(reviews=>{
 reviewGrid.replaceChildren();if(!reviews.length){reviewGrid.textContent='No published reviews yet.';return;}
 let index=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const figure=document.createElement('figure');figure.className='review';const quote=document.createElement('blockquote'),text=document.createElement('p'),credit=document.createElement('figcaption');quote.append(text);figure.append(quote,credit);reviewGrid.append(figure);
 const controls=document.createElement('div');controls.className='actions';const counter=document.createElement('span');counter.setAttribute('aria-live','polite');
 const previous=document.createElement('button'),next=document.createElement('button'),pause=document.createElement('button');for(const b of [previous,next,pause]){b.type='button';b.className='button';}previous.textContent='Previous review';next.textContent='Next review';
 function render(){const review=reviews[index];text.textContent='“'+review.text+'”';credit.textContent=(review.name||'')+(review.year?' · '+review.year:'');counter.textContent=`${index+1} of ${reviews.length}`;pause.textContent=paused?'Play rotation':'Pause rotation';pause.setAttribute('aria-pressed',String(paused));}
 previous.onclick=()=>{paused=true;index=(index+reviews.length-1)%reviews.length;render()};next.onclick=()=>{paused=true;index=(index+1)%reviews.length;render()};pause.onclick=()=>{paused=!paused;render()};controls.append(previous,pause,next,counter);reviewGrid.after(controls);render();
 setInterval(()=>{if(!paused&&!document.hidden&&!controls.contains(document.activeElement)){index=(index+1)%reviews.length;render()}},10000);
}).catch(()=>{reviewGrid.textContent='Reviews are temporarily unavailable. Please try again later.'});
