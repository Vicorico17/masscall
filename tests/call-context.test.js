import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCallTwiml} from '../lib/call-context.js';
import {supportedLanguages} from '../public/identity.js';

test('call connects to the voice bridge and speaks a fallback only after the stream ends',()=>{
 for(const language of supportedLanguages){
  const twiml=buildCallTwiml({bridge:'wss://bridge.example.com/media',secret:'test-secret',agent:{language:language.name},contact:'Test Contact',objective:'Confirm a detail',recording:true});
  assert.match(twiml,/<Response><Connect><Stream/);
  assert.match(twiml,/<\/Connect><Say\b/);
  assert.doesNotMatch(twiml.split('</Connect>')[0],/<Say\b/);
  if(language.name==='Romanian')assert.match(twiml,/<Say voice="Polly.Carmen" language="ro-RO">/);
  assert.doesNotMatch(twiml,new RegExp(language.recorded.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const context=[...twiml.matchAll(/name="context\d+" value="([^"]+)"/g)].map(match=>match[1]).join('');
  const data=JSON.parse(Buffer.from(context,'base64url').toString());
  assert.equal(data.agent.language,language.name);
  assert.equal(data.recording,true);
 }
});
