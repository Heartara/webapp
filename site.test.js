import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { server } from './server.js';
let base;
before(async () => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));
test('pages and required assets are served with appropriate content types', async () => {
 for (const [path, type] of [['/','text/html'],['/oracle.html','text/html'],['/styles.css','text/css'],['/app.js','text/javascript'],['/assets/landscape.svg','image/svg+xml']]) {
  const res = await fetch(base + path); assert.equal(res.status,200); assert.ok(res.headers.get('content-type').startsWith(type)); assert.ok((await res.text()).length > 100);
 }
});
test('private files and missing routes are not exposed', async () => { for (const path of ['/.git/config','/package.json','/missing.html']) assert.equal((await fetch(base+path)).status,404); });
test('all internal page and fragment links resolve', async () => {
 for (const file of ['index.html','oracle.html']) {
  const html = await readFile(new URL(file, import.meta.url),'utf8');
  for (const [,href] of html.matchAll(/href="([^\"]+)"/g)) {
   if (href.startsWith('mailto:')) continue;
   const [target,fragment] = href.split('#');
   const content = await readFile(new URL(target || file, import.meta.url),'utf8');
   if (fragment) assert.ok(content.includes(`id="${fragment}"`), `${file}: ${href}`);
  }
 }
});
test('oracle contains exactly 44 unique main cards and two separate bonuses', async () => {
 const html = await (await fetch(base+'/oracle.html')).text();
 const cards = [...html.matchAll(/data-card="([^\"]+)"/g)].map(m=>m[1]);
 assert.equal(cards.length,44); assert.equal(new Set(cards).size,44);
 assert.equal(cards[0],'acceptance'); assert.equal(cards[43],'wholeness');
 assert.ok(cards.includes('return to your heart')); assert.ok(cards.includes('reflection'));
 assert.match(html,/45 · Yes/); assert.match(html,/46 · No/);
});
