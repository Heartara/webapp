import {resolveConfiguration} from './src/configuration.js';
import { createClient } from '@supabase/supabase-js';
import { deliverBatch, notificationTransport } from './worker.js';
// Used internally by the Vercel request function. Not an HTTP entry point.
export async function processNotifications() {
  if ((process.env.EMAIL_MODE || 'sandbox') !== 'resend') return {processed:0,disabled:true};
  const connection=resolveConfiguration();if(!connection.ready)throw Error('Supabase connection is not configured');
  const db=createClient(connection.url,connection.secret,{auth:{persistSession:false,autoRefreshToken:false}});
  return deliverBatch(db,notificationTransport(process.env));
}
