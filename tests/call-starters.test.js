import test from 'node:test';
import assert from 'node:assert/strict';
import {callStarters} from '../public/call-starters.js';

test('ready-made call starters include a clear objective, opening, discussion, closing and end trigger',()=>{
 assert.equal(new Set(callStarters.map(item=>item.id)).size,callStarters.length);
 assert.ok(callStarters.some(item=>item.category==='Personal'));
 for(const starter of callStarters){
  for(const key of ['name','category','objective','opening','talkingPoints','closing','completionTrigger'])assert.ok(starter[key].trim(),`${starter.id} is missing ${key}`);
  assert.ok(starter.completionTrigger.length<600,`${starter.id} end trigger exceeds the call-plan limit`);
 }
});
