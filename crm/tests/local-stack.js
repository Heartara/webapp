// Isolated integration harness. The auth endpoint is synthetic, not hosted Supabase Auth.
import http from 'node:http';
import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {createApp} from '../server.js';
export const testSecret='heartara-local-synthetic-jwt-signing-key-only-do-not-deploy';
export function token(role,sub){const b=value=>Buffer.from(JSON.stringify(value)).toString('base64url');const s=b({alg:'HS256',typ:'JWT'})+'.'+b({role,sub,aud:role==='authenticated'?'authenticated':role,iss:'supabase',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),aal:'aal1'});return s+'.'+createHmac('sha256',testSecret).update(s).digest('base64url');}
export async function startStack({port=0,gatewayPort=0}={}){
 const db=new pg.Client({connectionString:'postgresql://postgres@127.0.0.1:55432/heartara_test'});await db.connect();
 await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit;end if;end $$; grant anon,authenticated,service_role to authenticator;");
 await db.query(`create or replace function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub',true),'')::uuid,(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid) $$;`);
 await db.query('delete from crm_private.rate_buckets');
 const owner=randomUUID(),assistant=randomUUID();for(const [id,role]of [[owner,'owner'],[assistant,'assistant']]){await db.query('insert into auth.users(id,email) values($1,$2)',[id,role+'@example.invalid']);await db.query('insert into public.staff_users(id,display_name,role) values($1,$2,$2)',[id,role]);}
 const env='/tmp/heartara-pgrst-test.env';writeFileSync(env,`PGRST_DB_URI=postgres://authenticator@127.0.0.1:55432/heartara_test\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET=${testSecret}\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT=55433\n`,{mode:0o600});
 try{execFileSync('docker',['rm','-f','heartara-crm-test-rest'],{stdio:'ignore'})}catch{}
 execFileSync('docker',['run','-d','--name','heartara-crm-test-rest','--network','host','--env-file',env,'postgrest/postgrest:v12.2.12'],{stdio:'ignore'});
 for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:55433/');if(r.ok)break}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const verify=value=>{try{const [a,b,s]=value.split('.');const sig=createHmac('sha256',testSecret).update(a+'.'+b).digest();if(!timingSafeEqual(Buffer.from(s,'base64url'),sig))return null;const payload=JSON.parse(Buffer.from(b,'base64url'));if(payload.exp<Date.now()/1000)return null;return payload;}catch{return null}};
 const gateway=http.createServer(async(req,res)=>{try{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,x-client-info,content-type,x-supabase-api-version');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
 if(req.url.startsWith('/auth/v1/')){res.setHeader('Content-Type','application/json');if(req.url.startsWith('/auth/v1/token')){let b='';for await(const c of req)b+=c;const input=JSON.parse(b);if(!['owner@example.invalid','assistant@example.invalid'].includes(input.email)||input.password!=='synthetic-test-password'){res.writeHead(400);return res.end(JSON.stringify({error:'invalid_grant',error_description:'Synthetic credentials required'}))}const id=input.email.startsWith('owner')?owner:assistant;return res.end(JSON.stringify({access_token:token('authenticated',id),token_type:'bearer',expires_in:3600,refresh_token:'synthetic-refresh',user:{id,email:input.email,aud:'authenticated',factors:[]}}));}
 const identity=verify((req.headers.authorization||'').replace('Bearer ',''));if(!identity?.sub){res.writeHead(401);return res.end(JSON.stringify({msg:'Unauthorized'}))}if(req.url.startsWith('/auth/v1/factors'))return res.end(JSON.stringify({all:[],totp:[],phone:[]}));return res.end(JSON.stringify({id:identity.sub,email:identity.sub===owner?'owner@example.invalid':'assistant@example.invalid',aud:'authenticated',factors:[]}));}
 const dest='http://127.0.0.1:55433'+req.url.replace(/^\/rest\/v1/,'');const headers={...req.headers};delete headers.host;let b='';for await(const c of req)b+=c;const upstream=await fetch(dest,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:b});res.writeHead(upstream.status,Object.fromEntries(upstream.headers));res.end(Buffer.from(await upstream.arrayBuffer()));
 }catch{res.writeHead(500);res.end('{}')}});
 await new Promise(resolve=>gateway.listen(gatewayPort,'127.0.0.1',resolve));const supabaseUrl=`http://127.0.0.1:${gateway.address().port}`;
 const app=createApp({supabaseUrl,publicKey:token('anon'),secret:token('service_role'),origins:'http://localhost:3100,http://127.0.0.1:3110',rateSalt:'synthetic-rate-salt'});await new Promise(resolve=>app.listen(port,'127.0.0.1',resolve));
 return {app,gateway,db,owner,assistant,supabaseUrl,base:`http://127.0.0.1:${app.address().port}`,publicKey:token('anon'),secret:token('service_role'),async close(){await new Promise(r=>app.close(r));await new Promise(r=>gateway.close(r));await db.end()}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const stack=await startStack({port:3110,gatewayPort:3111});console.log('Synthetic CRM browser harness on ports 3110/3111. No live customer data or real emails.');process.on('SIGTERM',async()=>{await stack.close();process.exit(0)})}
