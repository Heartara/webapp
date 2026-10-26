import {test} from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../server.js';import {readFile} from 'node:fs/promises';
test('direct routes, real 404s, redirects, robots and private paths over HTTP',async t=>{
 const app=createApp({env:{NODE_ENV:'production'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const base='http://127.0.0.1:'+app.address().port;
 for(const path of ['/webapp/','/webapp/about.html','/webapp/reiki.html','/webapp/reiki-training.html','/webapp/ceremony.html','/webapp/group-healing.html','/webapp/oracle-cards.html','/webapp/contact.html','/webapp/booking.html','/robots.txt','/webapp/sitemap.xml']){const res=await fetch(base+path);assert.equal(res.status,200,path);}
 for(const path of ['/webapp/does-not-exist','/backend/crm.mjs','/.env','/package.json','/site.config.json','/write.html','/manage-reviews.html'])assert.equal((await fetch(base+path)).status,404,path);
 const redirect=await fetch(base+'/webapp/oracle.html',{redirect:'manual'});assert.equal(redirect.status,301);assert.equal(redirect.headers.get('location'),'/webapp/oracle-cards.html');
 const alias=await fetch(base+'/webapp/reiki/',{redirect:'manual'});assert.equal(alias.status,301);assert.equal(alias.headers.get('location'),'/webapp/reiki.html');
 const html=await (await fetch(base+'/webapp/')).text();assert.match(html,/Wendy/);assert.match(html,/Kris/);assert.match(html,/class="review"/);assert.match(html,/Reiki training/);assert.ok(!html.includes('Loading client reviews'));
 const oracle=await (await fetch(base+'/webapp/oracle-cards.html')).text();assert.equal([...oracle.matchAll(/data-card=/g)].length,44);
});
test('preview server sends noindex and generated forms only signal persisted success',async t=>{
 const app=createApp({env:{NODE_ENV:'development'}});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));const res=await fetch('http://127.0.0.1:'+app.address().port+'/');assert.equal(res.headers.get('x-robots-tag'),'noindex');
 const js=await readFile(new URL('../forms.js',import.meta.url),'utf8');assert.ok(js.indexOf('data.saved!==true')<js.indexOf('recordSaved(form.dataset.kind)'));assert.match(js,/const names=\{enquiry:'enquiry_saved',booking:'booking_request_saved',feedback:'feedback_saved'\}/);assert.ok(!js.includes('dataLayer.push(payload)'));
});
