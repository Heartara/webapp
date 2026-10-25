import {readFile,writeFile,mkdir,rm,cp,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
const config=JSON.parse(await readFile(resolve(root,'site.config.json'),'utf8'));
const base=new URL(process.env.PUBLIC_BASE_URL||config.productionBase);
if(base.protocol!=='https:'||base.search||base.hash||!base.pathname.endsWith('/'))throw Error('Use a confirmed HTTPS production URL ending in /, without query parameters.');
const production=process.env.SITE_ENV==='production';
const apiBase=process.env.PUBLIC_API_BASE??config.apiBase;
if(apiBase&&(!apiBase.startsWith('https://')||!apiBase.endsWith('/')))throw Error('PUBLIC_API_BASE must be an HTTPS URL ending in /.');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=p=>new URL(p,base).href;
const pages={
 'index.html':['Heartara | Reiki, attunements & ceremony in Killarney','Heartara with Penny Kinman: Reiki in Killarney, distance Reiki, attunements, Munay Ki rites, ceremony and Return to Your Heart oracle cards.','Home','assets/penny-forest.jpg'],
 'about.html':['About Penny Kinman | Heartara, Killarney','Meet Penny Kinman, founder of Heartara. Explore her Reiki practice and heart-led approach to spiritual wellbeing.','About Penny'],
 'offerings.html':['Reiki, rites & ceremony | Heartara offerings','Explore Reiki sessions and training, Munay Ki rites, despacho ceremony and group gatherings with Penny at Heartara in Killarney, Queensland.','Offerings'],
 'reiki.html':['Reiki sessions in Killarney & distance Reiki | Heartara','What to expect from Reiki with Penny: 60- or 90-minute sessions in Killarney, distance Reiki, preparation and three-session packages.','Reiki sessions'],
 'reiki-training.html':['Reiki 1, 2, 3A & Master attunements | Heartara','Explore Reiki training and attunements with Penny, individually or in groups of up to three. Includes a Heartara booklet, certificate and continued support.','Reiki training','assets/reiki-attunements.jpg'],
 'munay-ki.html':['Munay Ki rites & Penny’s Peru journey | Heartara','Explore all nine Munay Ki rites, sacred space, ceremony and Penny’s Peru journey. Individual journeys and intimate groups of up to three.','Munay Ki'],
 'ceremony.html':['Despacho & sacred ceremony | Heartara','Explore despacho, sacred space and fire ceremony with Penny. An invitation to gratitude, intention and connection with the Earth.','Ceremony','assets/penny-despacho.jpg'],
 'group-healing.html':['Retreats & group healing with Penny | Heartara','Discover Heartara’s Return to Your Heart group gathering: reflection, guided journeying, ceremony and shared presence. Enquire about retreats and dates.','Retreats & groups'],
 'oracle-cards.html':['Return to Your Heart oracle cards by Penny Kinman | Heartara','Discover Penny’s first oracle deck: 44 main cards, two Yes and No bonus cards, a companion guidebook and healing intention at its heart.','Oracle cards','assets/return-to-your-heart-front-web.webp'],
 'contact.html':['Contact Penny at Heartara | Enquiries in Killarney','Ask Penny about Reiki, attunements, Munay Ki, ceremony, retreats or oracle cards. Send an enquiry through Heartara’s website.','Contact'],
 'booking.html':['Request a Reiki appointment | Heartara, Killarney','Choose a preferred date and time for a Heartara session or package. Weekend, Monday and selected evening requests need Penny’s personal confirmation.','Bookings'],
 'disclaimer.html':['Disclaimer, privacy & client rights | Heartara','Read Heartara’s wellbeing disclaimer, consent information, privacy notice, consumer rights and how to raise a concern.','Client rights'],
 'policies.html':['Bookings, cancellations & oracle orders | Heartara','How Heartara booking requests are confirmed, how to ask about changes, and what to check before ordering Return to Your Heart oracle cards.','Practical policies']
};
const noindex={'journal.html':['Heartara journal','Heartara reflections. Approved journal entries will be shared here.'],'thank-you.html':['Heartara acknowledgement','An acknowledgement does not confirm an appointment.'],'404.html':['Page not found | Heartara','The page you requested could not be found.']};
const aliases={'oracle.html':'oracle-cards.html'};
const images=JSON.parse(await readFile(resolve(root,'image-manifest.json'),'utf8'));
let dates={};try{dates=JSON.parse(await readFile(resolve(root,'.content-dates.json'),'utf8'));}catch{}
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Brisbane',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});await cp(resolve(root,'assets'),resolve(dist,'assets'),{recursive:true});
const publicAssets=['app.js','styles.css','forms.js','booking.js','booking-rules.js','reviews.js','journal.js','availability.json','posts.json','reviews.json'];
for(const path of publicAssets)await cp(resolve(root,path),resolve(dist,path));
await writeFile(resolve(dist,'public-config.js'),'// Public configuration only; no secrets.\nexport default '+JSON.stringify({apiBase,analyticsEnabled:config.analyticsEnabled===true})+';\n');
function imageAttrs(tag){const m=tag.match(/src="([^"]+)"/);if(!m)return tag;const info=images[m[1]];if(!info)return tag;
 let out=tag.replace(/\s(?:width|height|srcset|sizes|fetchpriority)="[^"]*"/g,'');
 const v=info.variants;const primary=v[Math.min(1,v.length-1)];out=out.replace('src="'+m[1]+'"','src="'+primary.src+'"');
 const sizes=m[1].includes('logo')?'(max-width: 760px) 130px, 170px':m[1].includes('peru-')?'(max-width: 600px) 45vw, 240px':m[1].includes('forest')?'(max-width: 760px) 88vw, 420px':'(max-width: 760px) 88vw, 620px';
 out=out.replace(/\s*\/?\>$/,` width="${info.width}" height="${info.height}" srcset="${v.map(x=>x.src+' '+x.width+'w').join(', ')}" sizes="${sizes}" decoding="async">`);
 if(m[1].includes('forest')&&current==='index.html')out=out.replace(/ loading="lazy"/g,'').replace('>',' fetchpriority="high">');
 else if(!m[1].includes('logo')&&!out.includes('loading='))out=out.replace('>',' loading="lazy">');
 return out;
}
const hashes={};for(const file of publicAssets)hashes[file]=hashFile(await readFile(resolve(dist,file)));
let current='';
for(const name of [...Object.keys(pages),...Object.keys(noindex),...Object.keys(aliases)]){
 current=name;let source=await readFile(resolve(root,name),'utf8');const data=pages[name]||noindex[name]||pages[aliases[name]];const [title,description,label,socialImage='assets/heartara-logo.jpeg']=data;
 const canonical=url(name==='index.html'?'':aliases[name]||name);const indexable=production&&Object.hasOwn(pages,name);
 source=source.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*(?:name="(?:description|robots|google-site-verification|twitter:[^"]*)"|property="og:[^"]*")[^>]*>/gi,'').replace(/<link\b[^>]*(?:rel="canonical"|rel="icon")[^>]*>/gi,'').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g,'');
 const social=images[socialImage]?.variants.at(-1)?.src||socialImage;
 let metadata=`<title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${indexable?'index, follow':'noindex, follow'}"><link rel="canonical" href="${canonical}"><link rel="icon" type="image/png" sizes="192x192" href="assets/favicon.png"><meta property="og:type" content="website"><meta property="og:site_name" content="Heartara"><meta property="og:locale" content="en_AU"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${url(social)}"><meta property="og:image:alt" content="${socialImage.includes('logo')?'Heartara logo':socialImage.includes('forest')?'Penny beside a moss-covered tree':socialImage.includes('attunements')?'Penny with Reiki participants and their certificates':socialImage.includes('despacho')?'Penny with a despacho offering':'Return to Your Heart oracle card'}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}"><meta name="twitter:image" content="${url(social)}">`;
 if(production&&config.searchConsoleVerification)metadata+='<meta name="google-site-verification" content="'+escape(config.searchConsoleVerification)+'">';
 if(Object.hasOwn(pages,name)){
  const graph=[{'@type':'WebPage','@id':canonical+'#page',url:canonical,name:title,description,inLanguage:'en-AU',isPartOf:{'@id':url('')+'#website'}}];
  if(name==='index.html')graph.push({'@type':'Organization','@id':url('')+'#organization',name:'Heartara',url:url(''),logo:url('assets/heartara-logo.jpeg'),email:'heartarahealing@gmail.com',founder:{'@type':'Person',name:'Penny Kinman'},sameAs:['https://www.facebook.com/groups/heartara']},{'@type':'WebSite','@id':url('')+'#website',url:url(''),name:'Heartara',publisher:{'@id':url('')+'#organization'},inLanguage:'en-AU'});
  else{
   source=source.replace(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/g,'');
   source=source.replace('<main id="main">','<main id="main"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="index.html">Home</a> <span aria-hidden="true">/</span> <span aria-current="page">'+escape(label)+'</span></nav>');
   graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Home',item:url('')},{'@type':'ListItem',position:2,name:label,item:canonical}]});
  }
  metadata+='<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')+'</script>';
 }
 source=source.replace('</head>',metadata+'</head>').replace(/<html\b[^>]*>/,'<html lang="en-AU">').replace(/<img\b[^>]*>/g,imageAttrs);
 // Version all shared files by content hash; navigation changes cannot retain old scripts.
 source=source.replace(/(src|href)="((?:app|styles|forms|booking|reviews|journal)\.(?:js|css))(?:\?[^"]*)?"/g,(all,attr,file)=>{return attr+'="'+file+'?v='+hashes[file]+'"';});
 if(aliases[name])source='<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><link rel="canonical" href="'+canonical+'"><meta name="robots" content="noindex, follow"><meta http-equiv="refresh" content="0;url='+aliases[name]+'"></head><body><p>This page has moved to <a href="'+aliases[name]+'">'+escape(label)+'</a>.</p></body></html>';
 if(Object.hasOwn(pages,name)){
  const contentHash=createHash('sha256').update((source.match(/<main[\s\S]*?<\/main>/)||[''])[0]+metadata).digest('hex');
  if(dates[name]?.hash!==contentHash)dates[name]={hash:contentHash,lastmod:today};
 }
 await writeFile(resolve(dist,name),source);if(process.argv.includes('--publish-root'))await writeFile(resolve(root,name),source);
}
await writeFile(resolve(root,'.content-dates.json'),JSON.stringify(dates,null,2)+'\n');
const sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+(production?Object.keys(pages).map(name=>'  <url><loc>'+escape(url(name==='index.html'?'':name))+'</loc><lastmod>'+dates[name].lastmod+'</lastmod></url>').join('\n'):'')+'\n</urlset>\n';
const robots='User-agent: *\n'+(production?'Allow: /\n':'Disallow: /\n')+'Sitemap: '+url('sitemap.xml')+'\n';
for(const [name,body] of [['sitemap.xml',sitemap],['robots.txt',robots],['.nojekyll','']]){await writeFile(resolve(dist,name),body);if(process.argv.includes('--publish-root'))await writeFile(resolve(root,name),body);}
if(process.argv.includes('--publish-root'))await cp(resolve(dist,'public-config.js'),resolve(root,'public-config.js'));
console.log('Built '+Object.keys(pages).length+' public pages; '+(production?'production indexing enabled':'preview: noindex')+'.');
function hashFile(bytes){return createHash('sha256').update(bytes).digest('hex').slice(0,12);}
// Declaration is populated before the page loop through top-level await below.
