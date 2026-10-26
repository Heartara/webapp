import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root=resolve(new URL('../../',import.meta.url).pathname),output=resolve(root,'dist');
const base=process.env.PUBLIC_BASE_URL||'https://heartarahealing.com/';
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,PUBLIC_BASE_URL:base,PUBLIC_API_BASE:'',SITE_ENV:process.env.VERCEL_ENV==='production'?'production':'preview'},stdio:'inherit'});
await mkdir(resolve(output,'crm'),{recursive:true});
for(const name of ['index.html','app.js','crm.css'])await cp(resolve(root,'crm/public',name),resolve(output,'crm',name));
await writeFile(resolve(output,'crm-public-config.js'),"window.HEARTARA_CRM = {apiBase:''};\n");
// Serve the current site and its metadata; owner moderation lives only in the authenticated CRM.
for(const name of ['index.html','about.html','offerings.html','reiki.html','reiki-training.html','munay-ki.html','ceremony.html','group-healing.html','oracle-cards.html','contact.html','booking.html','disclaimer.html','policies.html','journal.html']){
 const path=resolve(output,name);let html=await readFile(path,'utf8');
 html=html.replace('</footer>','<p class="owner-login"><a href="/crm/">Private Heartara login</a></p></footer>');
 if(name==='index.html')html=html.replace(/<div id="published-reviews" class="review-grid">[\s\S]*?<\/div>/,'<div id="published-reviews" class="review-grid"><p>Loading approved client reviews…</p></div>');
 await writeFile(path,html);
}
// Raw legacy reviews must not survive withdrawal through a public static JSON file.
await rm(resolve(output,'reviews.json'),{force:true});
console.log('Vercel bundle built from current website: same-origin Supabase forms and private CRM.');
