import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCallTwiml} from '../lib/call-context.js';
import {supportedLanguages} from '../public/identity.js';

test('call disclosures use the selected language and matching Twilio locale voice',()=>{
 for(const language of supportedLanguages){
  const twiml=buildCallTwiml({bridge:'wss://bridge.example.com/media',secret:'test-secret',agent:{language:language.name},contact:'Test Contact',objective:'Confirm a detail',recording:true});
  assert.ok(twiml.includes(`<Say language="${language.locale}" voice="${language.voice}">`),language.name);
  assert.ok(twiml.includes(language.recorded),language.name);
  const context=[...twiml.matchAll(/name="context\d+" value="([^"]+)"/g)].map(match=>match[1]).join('');
  assert.equal(JSON.parse(Buffer.from(context,'base64url').toString()).agent.language,language.name);
 }
});
