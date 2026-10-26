import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { deliverBatch, notificationTransport } from '../crm/worker.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const expected = process.env.CRON_SECRET, provided = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(provided) || !timingSafeEqual(Buffer.from(expected),Buffer.from(provided))) { res.statusCode=401; return res.end('Unauthorized'); }
  if (!['GET','POST'].includes(req.method)) { res.statusCode=405; return res.end('Method not allowed'); }
  // Cron must never discard real queued notifications into ephemeral sandbox files.
  if ((process.env.EMAIL_MODE || 'sandbox') !== 'resend') { res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify({processed:0,disabled:true,reason:'Live sender is not enabled; notifications remain queued.'})); }
  try {
    const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const transport=notificationTransport(process.env);
    const result=await deliverBatch(db,transport);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
  } catch { res.statusCode=503;res.end('Notification processing unavailable. Stored enquiries are retained.'); }
}
