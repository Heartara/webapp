const grid=document.querySelector('#published-reviews');
fetch('reviews.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(reviews=>{
 if(!Array.isArray(reviews)||!reviews.length){grid.textContent='More experiences will be shared here soon.';return;}
 grid.removeAttribute('aria-live');grid.style.display='grid';grid.style.gridTemplateColumns='minmax(0,1fr)';
 grid.setAttribute('role','region');grid.setAttribute('aria-label','Client experiences');
 const nodes=reviews.map(review=>{
  const figure=document.createElement('figure');figure.className='review';figure.style.gridArea='1 / 1';
  const quote=document.createElement('blockquote'),text=document.createElement('p');text.textContent='“'+review.text+'”';quote.append(text);figure.append(quote);
  if(review.name){const credit=document.createElement('figcaption');credit.textContent=review.name+(review.year?' · '+review.year:'');figure.append(credit);}
  return figure;
 });
 grid.replaceChildren(...nodes);
 if(nodes.length===1)return;
 const controls=document.createElement('div');controls.className='actions';controls.style.cssText='flex-wrap:wrap;justify-content:center;gap:14px;margin-top:22px;';
 const makeButton=label=>{const button=document.createElement('button');button.type='button';button.className='button small';button.textContent=label;return button;};
 const previous=makeButton('← Previous'),pause=makeButton('Pause rotation'),next=makeButton('Next →');
 const count=document.createElement('span');count.style.fontSize='13px';
 const status=document.createElement('span');status.setAttribute('role','status');status.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);';
 controls.append(previous,pause,count,next,status);grid.after(controls);
 let index=0,timer=null,hovering=false,paused=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const show=(number,announce=false)=>{
  index=(number+nodes.length)%nodes.length;
  nodes.forEach((node,i)=>{node.style.visibility=i===index?'visible':'hidden';node.setAttribute('aria-hidden',String(i!==index));node.inert=i!==index;});
  count.textContent=(index+1)+' of '+nodes.length;
  if(announce)status.textContent='Review '+(index+1)+' of '+nodes.length+', from '+reviews[index].name;
 };
 const schedule=()=>{
  clearInterval(timer);timer=null;pause.textContent=paused?'Play rotation':'Pause rotation';
  pause.setAttribute('aria-label',paused?'Play automatic review rotation':'Pause automatic review rotation');
  if(!paused&&!hovering&&!document.hidden)timer=setInterval(()=>show(index+1),25000);
 };
 previous.addEventListener('click',()=>{paused=true;show(index-1,true);schedule();});
 next.addEventListener('click',()=>{paused=true;show(index+1,true);schedule();});
 pause.addEventListener('click',()=>{paused=!paused;schedule();});
 grid.addEventListener('mouseenter',()=>{hovering=true;schedule();});
 grid.addEventListener('mouseleave',()=>{hovering=false;schedule();});
 grid.addEventListener('focusin',()=>{paused=true;schedule();});
 document.addEventListener('visibilitychange',schedule);
 show(0);schedule();
}).catch(()=>{grid.textContent='Reviews could not load. Please refresh or contact Penny directly.';});
document.querySelector('#feedback-form').addEventListener('submit',event=>{event.preventDefault();if(!event.target.reportValidity())return;const name=document.querySelector('#feedback-name').value.trim();const text=document.querySelector('#feedback-text').value.trim();if(!name||!text)return;const body=`Name to display: ${name}\n\nMy experience:\n${text}\n\nI agree that Penny may publish this feedback and my display name on the Heartara website.`;window.location.href='mailto:heartarahealing@gmail.com?subject='+encodeURIComponent('Heartara website feedback')+'&body='+encodeURIComponent(body);document.querySelector('#feedback-status').textContent='Your email app should open. Please press Send there to submit your feedback. If it does not open, email heartarahealing@gmail.com directly.';});
