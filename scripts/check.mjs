import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'../dist');
const files=await readdir(root);const titles=new Set(),descriptions=new Set(),canonicals=new Set();let count=0,images=0,schemas=0;
const publicPages=[];
for(const file of files.filter(f=>f.endsWith('.html'))){
 const text=await readFile(resolve(root,file),'utf8');
 assert.match(text,/<html lang="en-AU">/);assert.equal([...text.matchAll(/<title>/g)].length,1,file+' title');
 const canonical=text.match(/rel="canonical" href="([^"]+)"/)[1];assert.ok(!canonical.includes('?')&&!canonical.includes('#'));
 const isPublic=/name="robots" content="index, follow"/.test(text);
 if(isPublic){
  publicPages.push(file);const title=text.match(/<title>(.*?)<\/title>/s)[1],description=text.match(/name="description" content="([^"]+)"/)[1];
  assert.ok(!titles.has(title),'duplicate title '+file);titles.add(title);assert.ok(!descriptions.has(description),'duplicate description '+file);descriptions.add(description);assert.ok(!canonicals.has(canonical),'duplicate canonical');canonicals.add(canonical);
  assert.equal([...text.matchAll(/<h1\b/g)].length,1,file+' main heading');count++;
 }
 assert.ok(!/mailto:|formsubmit\.co/.test(text),file+' uses an external email substitute');
 for(const [,json] of text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)){
  const data=JSON.parse(json);schemas++;assert.equal(data['@context'],'https://schema.org');
  for(const node of data['@graph']){
   assert.ok(!['LocalBusiness','Product','Event','FAQPage','Review','AggregateRating'].includes(node['@type']));
   if(node['@type']==='BreadcrumbList'){assert.equal(node.itemListElement.length,2);assert.equal(node.itemListElement[0].position,1);assert.equal(node.itemListElement[1].item,canonical);assert.match(text,/aria-label="Breadcrumb"/);}
  }
 }
 for(const [,src,attrs] of text.matchAll(/<img\b(?=[^>]*src="([^"]+)")([^>]+)>/g)){
  assert.match(attrs,/\balt="[^"]*"/);assert.match(attrs,/\bwidth="\d+"/);assert.match(attrs,/\bheight="\d+"/);await stat(resolve(root,src));images++;
 }
 for(const [,href] of text.matchAll(/(?:href|src)="([^"]+)"/g)){
  if(/^(https?:|data:)/.test(href))continue;
  const [path,fragment]=href.split('#');const target=path.split('?')[0]||file;if(target==='api/submissions')continue;
  const targetContent=await readFile(resolve(root,target));
  if(fragment&&target.endsWith('.html'))assert.ok(targetContent.toString().includes('id="'+fragment+'"'),file+' broken '+href);
 }
}
const sitemap=await readFile(resolve(root,'sitemap.xml'),'utf8');
for(const url of canonicals)assert.ok(sitemap.includes('<loc>'+url+'</loc>'));
assert.equal([...sitemap.matchAll(/<loc>/g)].length,canonicals.size);
assert.ok(!/journal|thank-you|write.html|manage-reviews|admin|preview/.test(sitemap));
assert.match(await readFile(resolve(root,'robots.txt'),'utf8'),/Sitemap: https:\/\/heartara.github.io\/webapp\/sitemap.xml/);
assert.ok(!files.includes('server.js')&&!files.includes('.env')&&!files.includes('write.html'));
console.log(JSON.stringify({publicPages:count,uniqueMetadata:true,internalLinks:'passed',imagesWithDimensions:images,structuredDataGraphs:schemas,sitemap:'passed',noMailtoOrExternalEmailForms:true},null,2));
