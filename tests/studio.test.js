import {test} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/studio.js';
import {withinCallingHours,premiumContactCall} from '../lib/studio.js';
const originalFetch=globalThis.fetch;
function env(){Object.assign(process.env,{STUDIO_ENABLED:'true',TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'test',TWILIO_VERIFY_SERVICE_SID:'VA'+'2'.repeat(32),DEMO_FROM_NUMBER:'+40210000123',VOICE_BRIDGE_URL:'wss://bridge.example.com/media',VOICE_BRIDGE_SECRET:'bridge-secret',UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'redis-test',DEMO_HASH_SECRET:'h'.repeat(32),TURNSTILE_SECRET_KEY:'turnstile-test',TURNSTILE_SITE_KEY:'public-site-test',STRIPE_SECRET_KEY:'stripe-test',STRIPE_PRICE_ID:'price_test',SITE_URL:'https://masscall.example.com'})}
async function request(action,body={},cookie='',method='POST'){const req={url:'/api/studio?action='+action,method,headers:{cookie,origin:'https://masscall.example.com'},body};let status,payload;const res={setHeader(){},writeHead(s){status=s},end(v){payload=v}};await handler(req,res);return {status,data:JSON.parse(payload)}}
test('premium studio requires authentication and active subscription',async()=>{env();assert.equal((await request('agent',{agent:{}})).status,401);globalThis.fetch=async(url,options)=>{if(String(url).includes('redis.example.com')){const command=JSON.parse(options.body);if(command[0]==='GET'&&String(command[1]).startsWith('studio:session:'))return Response.json({result:'+40712345678'});return Response.json({result:null})}throw new Error('Unexpected request')};try{const cookie='masscall_studio='+'a'.repeat(43);assert.equal((await request('agent',{agent:{name:'A',company:'B',goal:'C',introduction:'D'}},cookie)).status,402)}finally{globalThis.fetch=originalFetch}});
test('paid Romanian agent can save a voice and place a recorded call to the verified mobile',async()=>{
 env();let created;const cookie='masscall_studio='+'a'.repeat(43);let savedAccount;
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.includes('redis.example.com')){const command=JSON.parse(options.body);if(command[0]==='GET'){if(String(command[1]).startsWith('studio:session:'))return Response.json({result:'+40712345678'});if(String(command[1]).startsWith('studio:account:'))return Response.json({result:savedAccount||JSON.stringify({agent:{name:'Andreea',company:'Studio',goal:'Confirmă o programare',introduction:'Sunt asistent AI',voice:'marin',language:'Romanian'},subscription:'sub_test',customer:'cus_test'})})}if(command[0]==='SET'&&String(command[1]).startsWith('studio:account:'))savedAccount=command[2];return Response.json({result:command[0]==='EVAL'?1:'OK'})}
  if(target.includes('api.stripe.com/v1/subscriptions/sub_test'))return Response.json({status:'active'});
  if(target==='https://bridge.example.com/health')return Response.json({status:'ok'});
  if(target.includes('/Calls.json')){created=new URLSearchParams(options.body);return Response.json({sid:'CA'+'3'.repeat(32),status:'queued'})}
  throw new Error('Unexpected request '+target);
 };
 try{
  const agent={name:'Elena',company:'Atelier',goal:'Confirmă programarea',introduction:'Sunt {agent_name}, asistent AI al {company_name}.',voice:'cedar',language:'Romanian'};
  let r=await request('agent',{agent},cookie);assert.equal(r.status,200);assert.equal(r.data.agent.voice,'cedar');assert.ok(savedAccount);
  r=await request('test-call',{consent:true,recordingConsent:true},cookie);assert.equal(r.status,201);assert.equal(created.get('To'),'+40712345678');assert.equal(created.get('Record'),'true');assert.equal(created.get('RecordingChannels'),'dual');assert.match(created.get('Twiml'),/<\/Connect><Say\b/);assert.match(created.get('Twiml'),/<Connect><Stream/);assert.equal(JSON.parse(Buffer.from([...created.get('Twiml').matchAll(/name="context\d+" value="([^"]+)"/g)].map(match=>match[1]).join(''),'base64url').toString()).recording,true);
 }finally{globalThis.fetch=originalFetch}
});
test('customer calls obey Romanian business hours',()=>{
 assert.equal(withinCallingHours(new Date('2026-09-23T06:00:00Z')),true);
 assert.equal(withinCallingHours(new Date('2026-09-23T15:00:00Z')),false);
 assert.equal(withinCallingHours(new Date('2026-09-26T10:00:00Z')),false);
});
test('contact calls require consent and an assigned number',async()=>{
 env();const agent={name:'Elena',company:'Atelier',goal:'Confirmă programarea',introduction:'Sunt asistent AI',language:'Romanian',voice:'marin'};
 await assert.rejects(()=>premiumContactCall('+40712345678',{agent},{to:'+40722222222',contact:'Ana',consent:true,recordingConsent:true},new Date('2026-09-23T10:00:00Z')),error=>error.status===403);
 await assert.rejects(()=>premiumContactCall('+40712345678',{agent,number:'+40210000123'},{to:'+40722222222',contact:'Ana',consent:true,recordingConsent:false},new Date('2026-09-23T10:00:00Z')),error=>error.status===400);
});
test('paid contact call uses assigned number, goal, recording and Romanian mobile',async()=>{
 env();let created;
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.includes('redis.example.com')){const command=JSON.parse(options.body);return Response.json({result:command[0]==='EVAL'?1:'OK'})}
  if(target==='https://bridge.example.com/health')return Response.json({status:'ok'});
  if(target.includes('/Calls.json')){created=new URLSearchParams(options.body);return Response.json({sid:'CA'+'4'.repeat(32),status:'queued'})}
  throw new Error('Unexpected request '+target);
 };
 try{
  const data={number:'+40210000123',agent:{name:'Elena',company:'Atelier',goal:'Confirmă o programare',introduction:'Sunt asistentul AI.',language:'Romanian',voice:'cedar'}};
  const call=await premiumContactCall('+40712345678',data,{to:'+40722222222',contact:'Ana Popescu',consent:true,recordingConsent:true},new Date('2026-09-23T10:00:00Z'));
  assert.match(call.sid,/^CA/);assert.equal(created.get('To'),'+40722222222');assert.equal(created.get('From'),'+40210000123');assert.equal(created.get('Record'),'true');assert.equal(created.get('RecordingChannels'),'dual');assert.match(created.get('Twiml'),/<\/Connect><Say\b/);assert.match(created.get('Twiml'),/<Connect><Stream/);assert.equal(JSON.parse(Buffer.from([...created.get('Twiml').matchAll(/name="context\d+" value="([^"]+)"/g)].map(match=>match[1]).join(''),'base64url').toString()).recording,true);
 }finally{globalThis.fetch=originalFetch}
});
test('opted-out contacts cannot be called again',async()=>{
 env();globalThis.fetch=async(url,options={})=>{const command=JSON.parse(options.body);if(String(url).includes('redis.example.com')&&command[0]==='EXISTS')return Response.json({result:1});throw new Error('Unexpected provider call')};
 try{await assert.rejects(()=>premiumContactCall('+40712345678',{number:'+40210000123',agent:{goal:'Test'}},{to:'+40722222222',contact:'Ana',consent:true,recordingConsent:true},new Date('2026-09-23T10:00:00Z')),error=>error.status===403)}finally{globalThis.fetch=originalFetch}
});
test('billing portal belongs to the signed-in Stripe customer',async()=>{
 env();const cookie='masscall_studio='+'a'.repeat(43);let portalBody;
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.includes('redis.example.com')){const command=JSON.parse(options.body);if(String(command[1]).startsWith('studio:session:'))return Response.json({result:'+40712345678'});if(String(command[1]).startsWith('studio:account:'))return Response.json({result:JSON.stringify({agent:{},customer:'cus_owned',subscription:'sub_owned'})})}
  if(target.includes('billing_portal/sessions')){portalBody=new URLSearchParams(options.body);return Response.json({url:'https://billing.stripe.com/test'})}
  throw new Error('Unexpected request '+target);
 };
 try{const response=await request('billing-portal',{},cookie);assert.equal(response.status,200);assert.equal(portalBody.get('customer'),'cus_owned');assert.equal(portalBody.get('return_url'),'https://masscall.example.com/studio')}finally{globalThis.fetch=originalFetch}
});
test('recording deletion requires ownership of its call',async()=>{
 env();const cookie='masscall_studio='+'a'.repeat(43),recording='RE'+'6'.repeat(32);let deletes=0,owned=false;
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target.includes('redis.example.com')){const command=JSON.parse(options.body);if(command[0]==='GET'&&String(command[1]).startsWith('studio:session:'))return Response.json({result:'+40712345678'});if(command[0]==='GET'&&String(command[1]).startsWith('studio:account:'))return Response.json({result:JSON.stringify({agent:{},customer:'cus_owned',subscription:'sub_owned'})});if(command[0]==='LRANGE')return Response.json({result:owned?['CA'+'7'.repeat(32)]:[]})}
  if(target.includes('subscriptions/sub_owned'))return Response.json({status:'active'});
  if(target.includes('/Recordings/'+recording+'.json')){if(options.method==='DELETE'){deletes++;return new Response(null,{status:204})}return Response.json({status:'completed',call_sid:'CA'+'7'.repeat(32)})}
  throw new Error('Unexpected request '+target);
 };
 try{assert.equal((await request('delete-recording',{recording},cookie)).status,404);assert.equal(deletes,0);owned=true;assert.equal((await request('delete-recording',{recording},cookie)).status,200);assert.equal(deletes,1)}finally{globalThis.fetch=originalFetch}
});
