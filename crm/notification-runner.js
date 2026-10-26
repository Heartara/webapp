import { createClient } from '@supabase/supabase-js';
import { deliverBatch, notificationTransport } from './worker.js';
// Used internally by the Vercel request function. Not an HTTP entry point.
export async function processNotifications() {
  if ((process.env.EMAIL_MODE || 'sandbox') !== 'resend') return {processed:0,disabled:true};
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  return deliverBatch(db,notificationTransport(process.env));
}
