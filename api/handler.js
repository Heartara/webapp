import { createApp } from '../crm/server.js';
import { waitUntil } from '@vercel/functions';
import { processNotifications } from '../crm/notification-runner.js';
// Reuse the tested Node request handler; Vercel owns the HTTP listener.
const app = createApp();
export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const route = url.searchParams.get('__route');
  if (route !== null) {
    url.searchParams.delete('__route');
    if (!/^[a-zA-Z0-9_/-]+$/.test(route) || route.includes('..')) {
      res.statusCode = 400; return res.end('Invalid API route');
    }
    req.url = '/api/' + route + (url.search ? url.search : '');
  }
  if (!req.url.startsWith('/api/')) { res.statusCode = 404; return res.end('Not found'); }
  return new Promise(resolve => { res.once('finish', () => { if (process.env.VERCEL === '1' && req.method === 'POST' && (req.url.startsWith('/api/public/submissions')||/^\/api\/private\/(enquiries|contacts)\/[a-f0-9-]+\/emails(?:\?|$)/.test(req.url)||req.url.startsWith('/api/provider/resend-webhook')) && res.statusCode === 200) waitUntil(processNotifications().catch(() => { /* Durable queued jobs remain visible for retry. */ })); resolve(); }); res.once('close', resolve); app.emit('request', req, res); });
}
