import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRehearsalRequest,rehearsalInstructions,rehearsalInput} from '../lib/rehearsal.js';
import handler from '../api/rehearsal.js';

const base={agent:{name:'Andreea',company:'Masscall',language:'Italian',voice:'marin'},contact:'Ana Popescu',objective:'Qualify a new prospect',callPlan:{category:'Prospects',company:'Atelier',personNotes:'Asked for a call this week.',opening:'Ask if now is a good time.',talkingPoints:'Ask about their needs.',closing:'Thank them and confirm next steps.',completionTrigger:'They agree to a follow-up or decline.'}};

test('rehearsal uses the selected identity, person, plan, language and end condition',()=>{
 const request=normalizeRehearsalRequest({...base,start:true,messages:[]}),prompt=rehearsalInstructions(request);
 for(const phrase of ['Andreea','Ana Popescu','Qualify a new prospect','Italian','Asked for a call this week.','They agree to a follow-up or decline.','masscall.vercel.app','JSON'])assert.ok(prompt.includes(phrase),phrase);
 assert.deepEqual(rehearsalInput(request),[{role:'user',content:'The outbound call has connected. Give the agent’s first spoken response now.'}]);
});

test('rehearsal turn history must alternate and end with the caller reply',()=>{
 const request=normalizeRehearsalRequest({...base,start:false,messages:[{role:'assistant',content:'Buongiorno, Ana.'},{role:'user',content:'Sì, mi dica.'}]});
 assert.deepEqual(rehearsalInput(request),request.messages);
 assert.throws(()=>normalizeRehearsalRequest({...base,start:false,messages:[{role:'user',content:'Hello'}]}),/needs an agent greeting/);
 assert.throws(()=>normalizeRehearsalRequest({...base,start:false,messages:[{role:'assistant',content:'Hello'},{role:'assistant',content:'Again'}]}),/invalid/);
});

test('rehearsal bounds transcript sizes and requires a call objective',()=>{
 assert.throws(()=>normalizeRehearsalRequest({...base,objective:'  ',start:true,messages:[]}),/call objective/);
 assert.throws(()=>normalizeRehearsalRequest({...base,start:true,messages:[{role:'assistant',content:'Hello'}]}),/Start a new rehearsal/);
 const truncated=normalizeRehearsalRequest({...base,start:false,messages:[{role:'assistant',content:'Hello'},{role:'user',content:'x'.repeat(1201)}]});assert.equal(truncated.messages[1].content.length,1200);
 const longHistory=Array.from({length:21},(_,index)=>({role:index%2?'user':'assistant',content:'A'.repeat(600)}));
 assert.throws(()=>normalizeRehearsalRequest({...base,start:false,messages:longHistory}),/invalid or too long/);
});

test('rehearsal API authenticates and forwards the bounded request only to the secure bridge',async()=>{
 const previous={...process.env},originalFetch=globalThis.fetch;process.env.MASSCALL_ADMIN_TOKEN='workspace-test-token-at-least-24';process.env.VOICE_BRIDGE_URL='wss://bridge.example.com/media';process.env.VOICE_BRIDGE_SECRET='bridge-test-secret';let seen;
 const request=async({authorization,body,method='POST'}={})=>{let status,payload;const req={method,url:'/api/rehearsal',headers:{authorization},body};const res={writeHead(value){status=value},end(value){payload=value}};await handler(req,res);return {status,data:JSON.parse(payload)}};
 try{
  assert.equal((await request({authorization:'Bearer wrong',body:{}})).status,401);
  globalThis.fetch=async(url,options)=>{seen={url:String(url),authorization:options.headers.Authorization,body:JSON.parse(options.body)};return Response.json({reply:'Buongiorno, Ana!',callComplete:false})};
  const response=await request({authorization:'Bearer workspace-test-token-at-least-24',body:{...base,start:true,messages:[]}});
  assert.equal(response.status,200);assert.deepEqual(response.data,{reply:'Buongiorno, Ana!',callComplete:false});assert.equal(seen.url,'https://bridge.example.com/rehearsal');assert.equal(seen.authorization,'Bearer bridge-test-secret');assert.equal(seen.body.start,true);assert.equal(seen.body.agent.language,'Italian');
 }finally{globalThis.fetch=originalFetch;for(const key of ['MASSCALL_ADMIN_TOKEN','VOICE_BRIDGE_URL','VOICE_BRIDGE_SECRET'])if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}
});
