import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queenslandDate, weekday, requestError} from './booking-rules.js';
test('calendar uses the Queensland date across midnight',()=>{
 assert.equal(queenslandDate(new Date('2026-10-25T15:00:00Z')),'2026-10-26');
});
test('Monday and weekend daytime requests are permitted, weekdays start at 5 pm',()=>{
 const now=new Date('2026-10-25T00:00:00Z');
 for(const date of ['2026-10-26','2026-10-31','2026-11-01'])assert.equal(requestError(date,'10:00',now),'');
 for(const date of ['2026-10-27','2026-10-28','2026-10-29','2026-10-30']){
  assert.match(requestError(date,'16:59',now),/5 pm/);
  assert.equal(requestError(date,'17:00',now),'');
 }
});
test('reject invalid dates, malformed times and past Queensland times',()=>{
 assert.equal(weekday('2026-02-30'),null);
 assert.match(requestError('2026-02-30','18:00'),/valid/);
 assert.match(requestError('2026-11-02','25:00'),/valid/);
 assert.match(requestError('2026-10-26','09:00',new Date('2026-10-26T00:00:00Z')),/future/);
});

test('Saturday and Sunday enforce inclusive 9 am to 5 pm request hours',()=>{
 const now=new Date('2026-10-25T00:00:00Z');
 for(const date of ['2026-10-31','2026-11-01']){
  assert.match(requestError(date,'08:59',now),/9 am and 5 pm/);
  assert.equal(requestError(date,'09:00',now),'');
  assert.equal(requestError(date,'17:00',now),'');
  assert.match(requestError(date,'17:01',now),/9 am and 5 pm/);
 }
 assert.equal(requestError('2026-10-26','08:00',now),'');
 assert.equal(requestError('2026-10-27','18:00',now),'');
});
