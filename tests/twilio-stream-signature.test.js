import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyStreamSignature} from '../lib/twilio-stream-signature.js';

const sign=(url,token)=>createHmac('sha1',token).update(url).digest('base64');
test('stream signature accepts Twilio WebSocket URL with trailing slash',()=>{
 const token='twilio-test-token',url='https://masscall.onrender.com/media/';
 assert.equal(verifyStreamSignature('wss://masscall.onrender.com/media',token,sign(url,token)),true);
});
test('stream signature still accepts canonical URL without trailing slash',()=>{
 const token='twilio-test-token',url='https://masscall.onrender.com/media';
 assert.equal(verifyStreamSignature('wss://masscall.onrender.com/media',token,sign(url,token)),true);
});
test('stream signature rejects a different token or URL',()=>{
 const token='twilio-test-token',signature=sign('https://masscall.onrender.com/media/',token);
 assert.equal(verifyStreamSignature('wss://masscall.onrender.com/media','wrong-token',signature),false);
 assert.equal(verifyStreamSignature('wss://other.onrender.com/media',token,signature),false);
});
