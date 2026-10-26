import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,timingSafeEqual} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createCRM,createMailer,InputError} from './backend/crm.mjs';
const project=fileURLToPath(new URL('.',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.xml':'application/xml','.txt':'text/plain; charset=utf-8','.ico':'image/x-icon'};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function equal(a,b){const x=createHash('sha256').update(a).digest(),y=createHash('sha256').update(b).digest();return timingSafeEqual(x,y);}
export function createApp({root=resolve(project,'dist'),env=process.env,crm=null,sendMail=null,verifySpam=null}={}){
 const production=env.NODE_ENV==='production';const config=JSON.parse(readConfig());
 const base=new URL(config.productionBase),prefix=base.pathname.replace(/\/$/,'');
 const allowed=new Set([base.origin,...(env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)]);
 if(!production){allowed.add('http://localhost:3000');allowed.add('http://127.0.0.1:3000');}
 const configured=Boolean(crm&&(!production||(env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&env.ADMIN_TOKEN?.length>=24)));
 const mail=sendMail||createMailer(env);
 let delivering=false;
 const deliver=async()=>{if(!crm||delivering)return;delivering=true;try{await crm.deliver(mail);}finally{delivering=false;}};
 async function checkSpam(value){
  if(verifySpam)return verifySpam(value);
  if(!production&&!env.TURNSTILE_SECRET)return true;
  if(!value||!env.TURNSTILE_SECRET)return false;
  try{const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',signal:AbortSignal.timeout(10000),body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:value})});const result=await response.json();return result.success===true&&allowed.size>0&&[...allowed].some(origin=>new URL(origin).hostname===result.hostname);}catch{return false;}
 }
 function authorised(req){
  if(!env.ADMIN_TOKEN||env.ADMIN_TOKEN.length<24)return false;
  const auth=req.headers.authorization||'';
  if(auth.startsWith('Bearer '))return equal(auth.slice(7),env.ADMIN_TOKEN);
  if(auth.startsWith('Basic ')){const decoded=Buffer.from(auth.slice(6),'base64').toString('utf8');return equal(decoded,'penny:'+env.ADMIN_TOKEN);}
  return false;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Robots-Tag':'noindex'});res.end(JSON.stringify(data));};
  try{
   const u=new URL(req.url,'http://localhost');let pathname=decodeURIComponent(u.pathname);if(pathname===prefix) {res.writeHead(308,{Location:prefix+'/'});return res.end();}
   if(prefix&&pathname.startsWith(prefix+'/'))pathname=pathname.slice(prefix.length);
   if(pathname.startsWith('/api/')||pathname==='/admin'){
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex');
    const origin=req.headers.origin;
    if(origin){if(!allowed.has(origin))return json(403,{error:'This origin is not allowed.'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
    if(pathname.startsWith('/api/admin/')||pathname==='/admin'){
     if(!authorised(req)){res.setHeader('WWW-Authenticate','Basic realm="Heartara private CRM", charset="UTF-8"');return json(401,{error:'Authentication required.'});}
     if(!crm)return json(503,{error:'CRM is not configured.'});
     if(req.method==='GET'&&pathname==='/api/admin/submissions')return json(200,{records:crm.list(),notifications:crm.outbox()});
     if(req.method==='GET'&&pathname==='/admin'){
      const records=crm.list();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"});
      return res.end('<!doctype html><html lang="en-AU"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Heartara private CRM</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:40px auto;padding:20px}article{border-top:1px solid #bbb;padding:20px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Heartara private CRM</h1><p>Booking requests remain pending personal confirmation. This inbox does not automatically approve appointments.</p>'+records.map(r=>'<article><h2>'+escape(r.kind)+' · '+escape(r.payload.name)+'</h2><p>'+escape(new Date(r.created_at).toISOString())+'</p><pre>'+escape(JSON.stringify(r.payload,null,2))+'</pre><form method="post" action="'+prefix+'/api/admin/retry/'+r.id+'"><button>Retry pending notification</button></form></article>').join('')+'</html>');
     }
     if(req.method==='POST'&&/^\/api\/admin\/retry\/[a-f0-9-]{36}$/.test(pathname)){
      if(!origin||!allowed.has(origin))return json(403,{error:'Same-origin request required.'});
      const count=crm.retry(pathname.split('/').at(-1));void deliver();return json(200,{queued:count>0});
     }
     return json(404,{error:'Not found'});
    }
    if(!configured)return json(503,{error:'Online requests are temporarily unavailable. Your details have not been saved. Please try again later.'});
    if(req.method==='GET'&&pathname==='/api/form-token')return json(200,{token:crm.issueToken(),turnstileSiteKey:env.TURNSTILE_SITE_KEY||''});
    if(req.method!=='POST'||pathname!=='/api/submissions')return json(404,{error:'Not found'});
    if(!origin||!allowed.has(origin))return json(403,{error:'Please submit using the Heartara website.'});
    if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'Please submit a valid form.'});
    const ip=env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0].trim():req.socket.remoteAddress;
    if(!crm.rateLimit(ip))return json(429,{error:'Too many requests. Please wait a little before trying again.'});
    let bytes=0,body='';for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)return json(413,{error:'Your message is too long.'});body+=chunk;}
    let input;try{input=JSON.parse(body);}catch{return json(400,{error:'Please submit a valid form.'});}
    if(!crm.verifyToken(input.token))return json(400,{error:'Please refresh this page, wait a moment, and try again.'});
    const existing=crm.lookup?.(input);if(existing)return json(200,{saved:true,id:existing.id,bookingStatus:input.kind==='booking'?'pending':undefined});
    if(!(await checkSpam(input.turnstileToken)))return json(400,{error:'Please complete the spam check and try again.'});
    const saved=crm.save(input);json(201,{saved:true,id:saved.id,bookingStatus:input.kind==='booking'?'pending':undefined});void deliver();return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
   const redirects={'/index.html':'/','/oracle.html':'/oracle-cards.html','/reiki/':'/reiki.html','/reiki-training/':'/reiki-training.html','/oracle-cards/':'/oracle-cards.html'};
   if(redirects[pathname]){res.writeHead(301,{Location:prefix+redirects[pathname]+u.search});return res.end();}
   if(pathname==='/robots.txt')pathname='/robots.txt';
   const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   if(!file.startsWith(resolve(root)+sep)||!types[extname(file)]||/\/\./.test(pathname))throw Error('404');
   const body=await readFile(file);const etag='"'+createHash('sha256').update(body).digest('hex').slice(0,24)+'"';
   res.setHeader('ETag',etag);res.setHeader('Content-Type',types[extname(file)]);res.setHeader('Cache-Control',pathname.startsWith('/assets/')?'public, max-age=86400':'no-cache');
   if(!production)res.setHeader('X-Robots-Tag','noindex');
   if(req.headers['if-none-match']===etag){res.writeHead(304);return res.end();}
   if(req.method==='HEAD'){res.writeHead(200);return res.end();}
   if(/text|json|xml|svg/.test(types[extname(file)])&&req.headers['accept-encoding']?.includes('gzip')){res.setHeader('Content-Encoding','gzip');res.setHeader('Vary','Accept-Encoding');return res.end(gzipSync(body,{level:5}));}
   res.end(body);
  }catch(error){if(error instanceof InputError)return json(422,{error:error.message});if(req.url.includes('/api/'))return json(503,{error:'Your request could not be saved. Your entries have been kept so you can retry.'});res.writeHead(404,{'Content-Type':'text/html; charset=utf-8','X-Robots-Tag':'noindex'});try{res.end(await readFile(resolve(root,'404.html')));}catch{res.end('Not found');}}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 let timer;server.on('listening',()=>{if(crm){timer=setInterval(()=>void deliver(),30000);timer.unref();void deliver();}});server.on('close',()=>clearInterval(timer));
 return server;
}
function readConfig(){return JSON.stringify({productionBase:process.env.PUBLIC_BASE_URL||'https://heartara.github.io/webapp/'});}
let crm=null;if(process.env.CRM_DB_PATH&&process.env.CRM_ENCRYPTION_KEY){const dbPath=resolve(process.env.CRM_DB_PATH);if(dbPath.startsWith(resolve(project,'dist')+sep))throw Error('CRM storage must be outside the public directory.');crm=createCRM({dbPath,key:process.env.CRM_ENCRYPTION_KEY});}
export const server=createApp({crm});
const portFlag=process.argv.includes('--port')?process.argv[process.argv.indexOf('--port')+1]:undefined;
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||portFlag||3000),'0.0.0.0',()=>console.log('Heartara server listening; CRM '+(crm?'configured':'not configured')));
