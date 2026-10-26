// Generates an owner-reviewed SQL import; does not connect or publish anything.
import {readFile,writeFile} from 'node:fs/promises';
const reviews=JSON.parse(await readFile(new URL('../../reviews.json',import.meta.url),'utf8'));
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const lines=['-- Review this text and permission provenance before running.',"-- Replace OWNER_AUTH_UUID with Penny's Supabase Auth UUID.",'begin;',"set local role authenticated;","select set_config('request.jwt.claim.sub','OWNER_AUTH_UUID',true);","select set_config('request.jwt.claims','{\"sub\":\"OWNER_AUTH_UUID\",\"aal\":\"aal2\"}',true);"];
reviews.forEach((r,i)=>lines.push(`insert into public.feedback(display_name,original_text,public_text,permission,notice_version,permission_provenance,status,display_year,display_order) values(${literal(r.name||'')},${literal(r.text)},${literal(r.text)},true,'legacy-owner-import-v1','Supplied by Penny for website publication in chat; original consent timestamp unavailable. Owner review required.','published',${r.year?literal(r.year):'null'},${i});`));
lines.push('commit;');await writeFile(new URL('../legacy-reviews-review.sql',import.meta.url),lines.join('\n')+'\n');console.log('Generated crm/legacy-reviews-review.sql for owner review; nothing published.');
