// Public diagnostics list variable names only. Never return server credentials.
export function isPublicKey(key){
 if(typeof key!=='string')return false;
 if(key.startsWith('sb_publishable_'))return true;
 try{return JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{return false;}
}
export function resolveConfiguration(config={},env=process.env){
 const first=(...values)=>values.find(value=>typeof value==='string'&&value.trim())?.trim();
 const url=config.unconfigured?undefined:first(config.supabaseUrl,env.SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_URL);
 const publicKey=config.unconfigured?undefined:first(config.publicKey,env.SUPABASE_PUBLISHABLE_KEY,env.SUPABASE_ANON_KEY,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
 const secret=config.unconfigured?undefined:first(config.secret,env.SUPABASE_SERVICE_ROLE_KEY,env.SUPABASE_SECRET_KEY);
 const missing=[];if(!url)missing.push('SUPABASE_URL');if(!publicKey)missing.push('SUPABASE_PUBLISHABLE_KEY');if(!secret&&!config.admin)missing.push('SUPABASE_SERVICE_ROLE_KEY');
 const errors=[];let origin='';
 if(url){try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error();if(parsed.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error();origin=parsed.origin;}catch{errors.push('SUPABASE_URL must be the project URL, such as https://your-project.supabase.co.');}}
 if(publicKey&&!isPublicKey(publicKey))errors.push('SUPABASE_PUBLISHABLE_KEY must be the publishable key or legacy anon key, never a service-role or secret key.');
 const environment=['production','preview','development'].includes(env.VERCEL_ENV)?env.VERCEL_ENV:'this deployment';
 let message='';if(missing.length)message=`Missing Vercel settings for ${environment}: ${missing.join(', ')}. Add them to this environment, then redeploy.`;
 if(errors.length)message+=(message?' ':'')+errors.join(' ');
 return {url:origin||undefined,publicKey,secret,missing,errors,environment,message,ready:missing.length===0&&errors.length===0};
}
