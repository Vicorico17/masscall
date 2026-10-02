import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import handler from '../api/campaigns.js';
import {createCampaign,normalizeCampaign,withinCampaignCallingHours,nextCampaignCallingTime,runCampaignJob,verifyCampaignSignature} from '../lib/campaigns.js';
import {hash} from '../lib/demo.js';

const token='workspace-campaign-test-token-123456';
const originalFetch=globalThis.fetch;
function env(){Object.assign(process.env,{MASSCALL_ADMIN_TOKEN:token,TWILIO_ACCOUNT_SID:'AC'+'1'.repeat(32),TWILIO_AUTH_TOKEN:'twilio-test',ENABLE_LIVE_CALLS:'true',VOICE_BRIDGE_URL:'wss://bridge.example.com/media',VOICE_BRIDGE_SECRET:'bridge-test-secret',QSTASH_TOKEN:'qstash-test',QSTASH_CURRENT_SIGNING_KEY:'current-signing-key-test',QSTASH_NEXT_SIGNING_KEY:'next-signing-key-test',QSTASH_URL:'https://qstash.example.com',UPSTASH_REDIS_REST_URL:'https://redis.example.com',UPSTASH_REDIS_REST_TOKEN:'redis-test',DEMO_HASH_SECRET:'h'.repeat(32),MASSCALL_PUBLIC_URL:'https://masscall.vercel.app'})}
function request(action,{auth=true,method='GET',body={}}={}){const req={url:'/api/campaigns?action='+action,method,headers:{authorization:auth?'Bearer '+token:''},body};let status,payload;const res={writeHead(value){status=value},end(value){payload=value}};return handler(req,res).then(()=>({status,data:JSON.parse(payload)}))}
const person=(overrides={})=>({id:'p1',name:'Ana Popescu',phone:'+40712345678',category:'Prospects',company:'Atelier',role:'Owner',notes:'Interested in automation.',callConsent:true,recordingConsent:true,...overrides});
const campaign=(overrides={})=>({name:'Prospect follow-up',group:'Prospects',from:'+40700000001',runAt:new Date(Date.now()+60*60*1000).toISOString(),recipients:[person()],agent:{name:'Andreea',company:'Masscall',language:'Romanian',goal:'Book a demo',introduction:'Hello'},objective:'Ask whether they want a demo.',callPlan:{category:'Prospects',templateName:'Intro',opening:'Say hello',talkingPoints:'Ask about needs',closing:'Thank them',completionTrigger:'They agree or decline'},...overrides});
test('scheduled campaign validates future time, unique contacts and both contact consents',()=>{
 const now=new Date('2026-09-30T10:00:00.000Z');assert.equal(normalizeCampaign(campaign(),now).recipients.length,1);
 assert.throws(()=>normalizeCampaign(campaign({recipients:[person({callConsent:false})]}),now),/consent/);
 assert.throws(()=>normalizeCampaign(campaign({recipients:[person(),person({id:'p2',name:'Different name'})]}),now),/more than once/);
 assert.throws(()=>normalizeCampaign(campaign({runAt:'2026-09-30T10:00:30.000Z'}),now),/one minute/);
 assert.throws(()=>normalizeCampaign(campaign({recipients:Array.from({length:21},(_,i)=>person({id:'p'+i,phone:'+40712345'+String(i).padStart(3,'0')}))}),now),/between 1 and 20/);
});
test('campaign worker only starts weekday calls from 09:00 to 17:55 Romania time',()=>{
 assert.equal(withinCampaignCallingHours(new Date('2026-09-30T07:00:00.000Z')),true); // Wednesday 10:00 EEST
 assert.equal(withinCampaignCallingHours(new Date('2026-09-30T14:54:00.000Z')),true); // 17:54 EEST
 assert.equal(withinCampaignCallingHours(new Date('2026-09-30T14:55:00.000Z')),false); // 17:55 EEST
 assert.equal(withinCampaignCallingHours(new Date('2026-10-03T08:00:00.000Z')),false);
 const next=nextCampaignCallingTime(new Date('2026-10-03T08:00:00.000Z'));
 assert.equal(withinCampaignCallingHours(next),true);
});
test('QStash callback JWT checks current and next signing keys, body, URL and expiry',()=>{
 env();const url='https://masscall.vercel.app/api/campaigns?action=run',body='{"campaignId":"abc","dispatchToken":"123"}';
 const make=(key,claims={})=>{const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'Upstash',sub:url,exp:2000,nbf:1000,body:createHash('sha256').update(body).digest('base64'),...claims})).toString('base64url'),sig=createHmac('sha256',key).update(h+'.'+p).digest('base64url');return `${h}.${p}.${sig}`};
 assert.equal(verifyCampaignSignature(make('next-signing-key-test',{}),body,url,1500),true);
 assert.equal(verifyCampaignSignature(make('invalid-key'),body,url,1500),false);
 assert.equal(verifyCampaignSignature(make('next-signing-key-test'),body+' ',url,1500),false);
 assert.equal(verifyCampaignSignature(make('next-signing-key-test'),body,url+'/',1500),false);
 assert.equal(verifyCampaignSignature(make('next-signing-key-test',{exp:1200}),body,url,1500),false);
});
test('campaign scheduler route requires owner auth and publishes a consented contact snapshot',async()=>{
 env();let scheduledBody,scheduledAt;const store=new Map(),sets=new Map();
 globalThis.fetch=async(url,options)=>{
  const target=String(url);
  if(target.includes('IncomingPhoneNumbers'))return Response.json({incoming_phone_numbers:[{phone_number:'+40700000001'}]});
  if(target.startsWith('https://qstash.example.com/')){scheduledBody=JSON.parse(options.body);scheduledAt=options.headers['Upstash-Not-Before'];return Response.json({messageId:'msg_123'})}
  if(target.startsWith('https://redis.example.com/')){const command=JSON.parse(options.body),op=String(command[0]).toUpperCase(),key=command[1];if(op==='SET'){store.set(key,String(command[2]));return Response.json({result:'OK'})}if(op==='SADD'){sets.set(key,[...(sets.get(key)||[]),String(command[2])]);return Response.json({result:1})}return Response.json({error:'unexpected redis command'},{status:400})}
  throw new Error('Unexpected URL '+target);
 };
 try{
  let response=await request('create',{method:'POST',body:campaign()});assert.equal(response.status,201);assert.equal(scheduledBody.campaignId,response.data.campaign.id);assert.equal(scheduledBody.dispatchToken,response.data.campaign.dispatchToken);assert.ok(Number(scheduledAt)>0);assert.equal(response.data.campaign.messageId,'msg_123');
  const published=await request('create',{method:'POST',body:campaign({recipients:[person({recordingConsent:false})]})});assert.equal(published.status,400);assert.match(published.data.error,/consent/);
  assert.equal(store.size,1);assert.equal(sets.get('campaign:index').length,1);
  response=await request('create',{auth:false,method:'POST',body:campaign()});assert.equal(response.status,401);
 }finally{globalThis.fetch=originalFetch}
});
test('QStash worker route verifies its callback signature without owner-token auth',async()=>{
 env();const url='https://masscall.vercel.app/api/campaigns?action=run',body=JSON.stringify({campaignId:'missing-campaign',dispatchToken:'dispatch'}),header=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url'),claims=Buffer.from(JSON.stringify({iss:'Upstash',sub:url,exp:2000000000,nbf:1,body:createHash('sha256').update(body).digest('base64')})).toString('base64url'),signature=createHmac('sha256',process.env.QSTASH_CURRENT_SIGNING_KEY).update(header+'.'+claims).digest('base64url');let status,payload;
 globalThis.fetch=async()=>Response.json({result:null});
 try{
  const req={url:'/api/campaigns?action=run',method:'POST',headers:{'upstash-signature':`${header}.${claims}.${signature}`},body};const res={writeHead(code){status=code},end(value){payload=value}};await handler(req,res);assert.equal(status,200);assert.equal(JSON.parse(payload).status,'missing');
  req.headers['upstash-signature']='invalid';await handler(req,res);assert.equal(status,401);
 }finally{globalThis.fetch=originalFetch}
});
test('a campaign waits for any active campaign call from the same Twilio number',async()=>{
 env();const store=new Map(),base=new Date('2026-09-30T07:00:00.000Z');let twilioPosts=0;
 globalThis.fetch=async(url,options)=>{
  const target=String(url);
  if(target.startsWith('https://qstash.example.com/'))return Response.json({messageId:'msg_'+Math.random()});
  if(target.startsWith('https://redis.example.com/')){const c=JSON.parse(options.body),op=String(c[0]).toUpperCase(),key=String(c[1]);if(op==='GET')return Response.json({result:store.get(key)||null});if(op==='SET'){if(c.includes('NX')&&store.has(key))return Response.json({result:null});store.set(key,String(c[2]));return Response.json({result:'OK'})}if(op==='SADD')return Response.json({result:1});if(op==='EVAL')return Response.json({result:1});if(op==='DEL'){store.delete(key);return Response.json({result:1})}throw new Error('Unexpected Redis op '+op)}
  if(target.includes('/Calls/CA'+'9'.repeat(32)+'.json'))return Response.json({sid:'CA'+'9'.repeat(32),status:'in-progress'});
  if(target.includes('/Calls.json')){twilioPosts++;return Response.json({sid:'CA'+'8'.repeat(32),status:'queued'})}
  throw new Error('Unexpected URL '+target);
 };
 try{
  const item=await createCampaign(campaign({runAt:new Date(base.getTime()+60_000).toISOString()}),base);
  store.set('campaign:active:'+hash(item.from),'CA'+'9'.repeat(32));
  const result=await runCampaignJob(item.id,item.dispatchToken,new Date(base.getTime()+2*60_000));
  assert.equal(result.status,'scheduled');assert.equal(twilioPosts,0);
 }finally{globalThis.fetch=originalFetch}
});
