import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {submissionError} from '../../form-response.js';
import {rateLimitKey} from '../src/configuration.js';
test('public forms retain same-origin Vercel preview cookies without sending them cross-origin',async()=>{const js=await readFile(new URL('../../forms.js',import.meta.url),'utf8');assert.ok(js.includes("credentials:'same-origin'"));assert.ok(!js.includes("credentials:'omit'"));});
test('object-shaped deployment errors never become object Object',()=>{assert.equal(submissionError({error:{message:'Function temporarily unavailable'}},503),'Function temporarily unavailable');assert.ok(submissionError({error:{code:'AUTHENTICATION_REQUIRED'}},401).includes('preview'));assert.ok(!submissionError({error:{code:'UNKNOWN'}},500).includes('[object Object]'));assert.equal(submissionError({error:'Check your email address.'},422),'Check your email address.');});
test('derived limiter key is stable, separate from credential, and respects explicit override',()=>{const secret='e30.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.synthetic-private-signature-long-enough';const a=rateLimitKey({secret}),b=rateLimitKey({secret});assert.equal(a.length,32);assert.deepEqual(a,b);assert.notEqual(a.toString(),secret);assert.notDeepEqual(a,rateLimitKey({secret:secret+'changed'}));assert.equal(rateLimitKey({secret,explicit:'dedicated-salt'}),'dedicated-salt');assert.equal(rateLimitKey({secret:'public-or-placeholder'}),null);});
