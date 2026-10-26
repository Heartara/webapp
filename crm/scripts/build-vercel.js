import { mkdir, rm, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(new URL('../../',import.meta.url).pathname),output=resolve(root,'dist');
const pages=['index.html','about.html','offerings.html','group-healing.html','oracle.html','journal.html','contact.html','booking.html','disclaimer.html','manage-reviews.html'];
const scripts=['app.js','public-forms.js','reviews.js','journal.js','styles.css','posts.json'];
await rm(output,{recursive:true,force:true});await mkdir(resolve(output,'crm'),{recursive:true});
for(const name of [...pages,...scripts])await cp(resolve(root,name),resolve(output,name));
await cp(resolve(root,'assets'),resolve(output,'assets'),{recursive:true});
for(const name of ['index.html','app.js','crm.css'])await cp(resolve(root,'crm/public',name),resolve(output,'crm',name));
// No environment values are copied into public assets. Same-origin Vercel API handles all forms.
await writeFile(resolve(output,'crm-public-config.js'),"window.HEARTARA_CRM = {apiBase:''};\n");
// The old journal export editor remains a separate draft feature; don't ship its Github upload flow as CRM.
for(const name of pages){const path=resolve(output,name);let html=await readFile(path,'utf8');html=html.replace('</footer>','<p class="owner-login"><a href="/crm/">Private Heartara login</a></p></footer>');await writeFile(path,html);}
console.log('Vercel public bundle built: website, private login shell and public assets only.');
