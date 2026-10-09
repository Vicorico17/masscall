import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {redis,hash} from './demo.js';
import {twilio,equal,requireReadyBridge} from './telephony.js';
import {buildCallTwiml} from './call-context.js';
import {normalizeCallPlan} from './call-plan.js';
import {normalizeIdentity} from '../public/identity.js';

const campaignKey=id=>`campaign:${hash(id)}`;
const MAX_RECIPIENTS=20;
const NEXT_CONTACT_DELAY=45;
const CALLBACK_PATH='/api/campaigns?action=run';
const schedulerReady=()=>Boolean(process.env.QSTASH_TOKEN&&process.env.QSTASH_CURRENT_SIGNING_KEY&&process.env.QSTASH_NEXT_SIGNING_KEY&&process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN&&String(process.env.DEMO_HASH_SECRET||'').length>=32&&publicOrigin());
function publicOrigin(){
 const value=process.env.MASSCALL_PUBLIC_URL||process.env.SITE_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL&&`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
 if(!value)return '';
 try{const url=new URL(value);return url.protocol==='https:'&&url.pathname==='/'&&!url.username&&!url.password&&!url.search&&!url.hash?url.origin:''}catch{return ''}
}
const callbackUrl=()=>publicOrigin()+CALLBACK_PATH;
function validateDestination(value){
 if(typeof value!=='string'||!/^\+[1-9]\d{7,14}$/.test(value))throw Object.assign(new Error('Campaign contacts need valid international phone numbers.'),{status:400});
 return value;
}
function callingHourParts(date){return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date)}
export function withinCampaignCallingHours(date=new Date()){
 const parts=callingHourParts(date),weekday=parts.find(x=>x.type==='weekday')?.value,hour=Number(parts.find(x=>x.type==='hour')?.value),minute=Number(parts.find(x=>x.type==='minute')?.value);
 return !['Sat','Sun'].includes(weekday)&&hour>=9&&(hour<17||(hour===17&&minute<55));
}
export function nextCampaignCallingTime(date=new Date()){
 const candidate=new Date(date);
 candidate.setUTCSeconds(0,0);
 for(let i=0;i<=8*24*60;i++){
  if(withinCampaignCallingHours(candidate))return candidate;
  candidate.setUTCMinutes(candidate.getUTCMinutes()+1);
 }
 throw new Error('Could not find the next Romania calling window.');
}
function bounded(value,max){return String(value||'').trim().slice(0,max)}
function sanitizeRecipient(person){
 if(!person||typeof person!=='object')throw Object.assign(new Error('Invalid campaign contact.'),{status:400});
 if(person.callConsent!==true||person.recordingConsent!==true)throw Object.assign(new Error('Every selected campaign contact needs saved calling and recording consent.'),{status:400});
 return {id:bounded(person.id,80)||randomUUID(),name:bounded(person.name,80),phone:validateDestination(person.phone),category:bounded(person.category,80),company:bounded(person.company,100),role:bounded(person.role,100),notes:bounded(person.notes,1000),callConsent:true,recordingConsent:true,status:'queued',sid:''};
}
export function normalizeCampaign(input={},now=new Date()){
 const name=bounded(input.name,100),group=bounded(input.group,80),from=validateDestination(input.from),runAt=String(input.runAt||''),date=new Date(runAt);
 if(!name||!group)throw Object.assign(new Error('Enter a campaign name and target group.'),{status:400});
 if(!/^\d{4}-\d\d-\d\dT/.test(runAt)||Number.isNaN(date.getTime())||date.getTime()<now.getTime()+60_000)throw Object.assign(new Error('Choose a campaign time at least one minute in the future.'),{status:400});
 if(date.getTime()>now.getTime()+7*24*60*60_000)throw Object.assign(new Error('Choose a date within the next seven days.'),{status:400});
 if(!Array.isArray(input.recipients)||!input.recipients.length||input.recipients.length>MAX_RECIPIENTS)throw Object.assign(new Error(`Select between 1 and ${MAX_RECIPIENTS} contacts.`),{status:400});
 const recipients=input.recipients.map(sanitizeRecipient),phones=new Set();
 for(const item of recipients){if(phones.has(item.phone))throw Object.assign(new Error('A phone number appears more than once in this campaign.'),{status:400});phones.add(item.phone)}
 const agent=normalizeIdentity(input.agent||{}),objective=bounded(input.objective,2000);
 if(!objective)throw Object.assign(new Error('A call objective is required.'),{status:400});
 const callPlan=normalizeCallPlan(input.callPlan||{});
 return {id:randomUUID(),name,group,from,runAt:date.toISOString(),createdAt:now.toISOString(),status:'scheduled',agent,objective,callPlan,recipients,cursor:0,messageId:'',lastError:''};
}

function signatureMatches(signature,body,url,key,nowSeconds){
 if(!signature||!key)return false;
 const pieces=String(signature).split('.');if(pieces.length!==3)return false;
 let header,claims;try{header=JSON.parse(Buffer.from(pieces[0],'base64url').toString());claims=JSON.parse(Buffer.from(pieces[1],'base64url').toString())}catch{return false}
 if(header.alg!=='HS256'||claims.iss!=='Upstash'||claims.sub!==url||!Number.isFinite(claims.exp)||!Number.isFinite(claims.nbf)||claims.exp<nowSeconds||claims.nbf>nowSeconds||typeof claims.body!=='string')return false;
 const digest=createHash('sha256').update(body).digest('base64');if(!equal(claims.body,digest))return false;
 const expected=createHmac('sha256',key).update(`${pieces[0]}.${pieces[1]}`).digest();let supplied;try{supplied=Buffer.from(pieces[2],'base64url')}catch{return false}
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
export function verifyCampaignSignature(signature,body,url,nowSeconds=Math.floor(Date.now()/1000)){
 return signatureMatches(signature,body,url,process.env.QSTASH_CURRENT_SIGNING_KEY,nowSeconds)||signatureMatches(signature,body,url,process.env.QSTASH_NEXT_SIGNING_KEY,nowSeconds);
}
async function qstash(method,path,body,headers={}){
 if(!schedulerReady())throw Object.assign(new Error('Campaign scheduling is not configured. Add QStash credentials, Redis, and the public app URL to Vercel, then redeploy.'),{status:503});
 const base=(process.env.QSTASH_URL||'https://qstash.upstash.io').replace(/\/$/,'');
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${process.env.QSTASH_TOKEN}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||data.message||'The campaign scheduler rejected this request.'),{status:502});return data;
}
async function enqueue(campaign,runAt){
 const when=nextCampaignCallingTime(runAt),url=callbackUrl(),dispatchToken=randomUUID();
 const result=await qstash('POST',`/v2/publish/${encodeURIComponent(url)}`,{campaignId:campaign.id,dispatchToken},{'Upstash-Not-Before':String(Math.ceil(when.getTime()/1000)),'Upstash-Retries':'3','Upstash-Label':'masscall-campaign'});
 return {...result,dispatchToken};
}
export async function createCampaign(input,now=new Date()){
 if(!schedulerReady())throw Object.assign(new Error('Campaign scheduling is not configured. Add QStash credentials, Redis, and the public app URL to Vercel, then redeploy.'),{status:503});
 const campaign=normalizeCampaign(input,now),firstRun=nextCampaignCallingTime(new Date(campaign.runAt));campaign.runAt=firstRun.toISOString();
 if(firstRun.getTime()>now.getTime()+7*24*60*60_000)throw Object.assign(new Error('The next Romania calling window is beyond the scheduler’s seven-day limit. Choose an earlier date.'),{status:400});
 const scheduled=await enqueue(campaign,firstRun);campaign.messageId=String(scheduled.messageId||'');campaign.dispatchToken=scheduled.dispatchToken;
 await redis('SET',campaignKey(campaign.id),JSON.stringify(campaign),'EX',30*24*60*60);await redis('SADD','campaign:index',campaign.id);
 return campaign;
}
export async function getCampaigns(){
 const ids=await redis('SMEMBERS','campaign:index')||[],all=await Promise.all(ids.map(async id=>{const value=await redis('GET',campaignKey(id));return value?JSON.parse(value):null}));
 return all.filter(Boolean).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function cancelCampaign(id){
 if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))throw Object.assign(new Error('Invalid campaign ID.'),{status:400});
 const key=campaignKey(id),raw=await redis('GET',key);if(!raw)throw Object.assign(new Error('Campaign not found.'),{status:404});
 const campaign=JSON.parse(raw);if(['completed','cancelled'].includes(campaign.status))return campaign;
 campaign.status='cancelled';campaign.updatedAt=new Date().toISOString();await redis('SET',key,JSON.stringify(campaign),'EX',30*24*60*60);return campaign;
}
async function saveCampaign(campaign){campaign.updatedAt=new Date().toISOString();await redis('SET',campaignKey(campaign.id),JSON.stringify(campaign),'EX',30*24*60*60)}
const unlockScript=`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0`;
const dailyCallScript=`local n=tonumber(redis.call('GET',KEYS[1]) or '0');if n>=tonumber(ARGV[1]) then return 0 end;redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],172800);return 1`;
function bucharestDay(date){return date.toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'})}
export async function runCampaignJob(campaignId,dispatchToken,now=new Date()){
 const key=campaignKey(campaignId),raw=await redis('GET',key);if(!raw)return {status:'missing'};
 let campaign=JSON.parse(raw);if(!dispatchToken||campaign.dispatchToken!==dispatchToken)return {status:'stale-job'};if(['completed','cancelled','failed','needs_review'].includes(campaign.status))return {status:campaign.status};
 const lockKey=`campaign:lock:${hash(campaignId)}`,lock=cryptoRandomId();if(await redis('SET',lockKey,lock,'NX','EX',120)!=='OK')return {status:'already-running'};
 let dialLockKey='',dialLock='';
 try{
  const current=await redis('GET',key);campaign=current?JSON.parse(current):campaign;
  if(campaign.dispatchToken!==dispatchToken)return {status:'stale-job'};
  if(new Date(campaign.runAt).getTime()>now.getTime())return {status:'too-early'};
  if(campaign.status==='cancelled')return {status:'cancelled'};
  if(!withinCampaignCallingHours(now)){const next=nextCampaignCallingTime(new Date(now.getTime()+60_000)),scheduled=await enqueue(campaign,next);campaign.status='scheduled';campaign.runAt=next.toISOString();campaign.messageId=String(scheduled.messageId||'');campaign.dispatchToken=scheduled.dispatchToken;await saveCampaign(campaign);return {status:'rescheduled',runAt:campaign.runAt}}
  const activeKey=`campaign:active:${hash(campaign.from)}`,active=await redis('GET',activeKey);
  if(active){
   if(String(active).startsWith('review:'))return continueCampaign(campaign,now);
   if(/^CA[0-9a-f]{32}$/i.test(active)){
    const currentCall=await twilio(`Calls/${active}.json`);
    if(['queued','ringing','in-progress'].includes(currentCall.status))return continueCampaign(campaign,now);
    await redis('DEL',activeKey);
   }else await redis('DEL',activeKey);
  }
  if(campaign.cursor>=campaign.recipients.length){campaign.status='completed';await saveCampaign(campaign);return {status:'completed'}}
  if(now.toLocaleTimeString('en-GB',{timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})>='17:55'){
   const next=nextCampaignCallingTime(new Date(now.getTime()+10*60_000)),scheduled=await enqueue(campaign,next);campaign.status='scheduled';campaign.runAt=next.toISOString();campaign.messageId=String(scheduled.messageId||'');campaign.dispatchToken=scheduled.dispatchToken;await saveCampaign(campaign);return {status:'rescheduled',runAt:campaign.runAt}
  }
  const person=campaign.recipients[campaign.cursor];
  if(person.status==='dialing'){campaign.status='needs_review';campaign.lastError='A previous Twilio request ended without a confirmed result. Review this contact before retrying.';await saveCampaign(campaign);return {status:campaign.status}}
  if(!person.callConsent||!person.recordingConsent){person.status='skipped';campaign.cursor++;await saveCampaign(campaign);return continueCampaign(campaign,now)}
  dialLockKey=`campaign:dial-lock:${hash(campaign.from)}`;dialLock=cryptoRandomId();
  if(await redis('SET',dialLockKey,dialLock,'NX','EX',60)!=='OK'){dialLockKey='';dialLock='';return continueCampaign(campaign,now)}
  const activeAgain=await redis('GET',activeKey);
  if(activeAgain){await redis('EVAL',unlockScript,1,dialLockKey,dialLock);dialLockKey='';dialLock='';return continueCampaign(campaign,now)}
  try{await requireReadyBridge()}catch{
   const next=nextCampaignCallingTime(new Date(now.getTime()+60_000)),scheduled=await enqueue(campaign,next);
   campaign.status='scheduled';campaign.runAt=next.toISOString();campaign.messageId=String(scheduled.messageId||'');campaign.dispatchToken=scheduled.dispatchToken;
   campaign.lastError='Voice service unavailable. No call was placed; retrying automatically.';await saveCampaign(campaign);
   return {status:'rescheduled',runAt:campaign.runAt};
  }
  const daily=`campaign:daily:${hash(campaign.from)}:${bucharestDay(now)}`;
  if(Number(await redis('EVAL',dailyCallScript,1,daily,20))!==1){campaign.status='daily_limit';campaign.lastError='The daily limit of 20 campaign calls was reached.';await saveCampaign(campaign);return {status:campaign.status}}
  person.status='dialing';await saveCampaign(campaign);
  try{
   const twiml=buildCallTwiml({bridge:process.env.VOICE_BRIDGE_URL,secret:process.env.VOICE_BRIDGE_SECRET,agent:campaign.agent,contact:person.name,objective:campaign.objective,callPlan:campaign.callPlan,recording:true});
   const call=await twilio('Calls.json','POST',{To:person.phone,From:campaign.from,Twiml:twiml,Record:'true',RecordingChannels:'dual',RecordingTrack:'both',TimeLimit:'300',Timeout:'25'});
   if(!/^CA[0-9a-f]{32}$/i.test(call.sid||''))throw new Error('Twilio did not return a valid call ID.');
   await redis('SET',activeKey,call.sid,'EX',420);
   person.sid=call.sid;person.status='queued';person.queuedAt=new Date().toISOString();campaign.cursor++;
   const latestRaw=await redis('GET',key),latest=latestRaw?JSON.parse(latestRaw):campaign;
   campaign.status=latest.status==='cancelled'?'cancelled':'running';await saveCampaign(campaign);
  }catch(error){
   if(error.status&&error.status<500){person.status='failed';person.error=bounded(error.message,200);campaign.cursor++;campaign.lastError=person.error;await saveCampaign(campaign);return continueCampaign(campaign,now)}
   await redis('SET',activeKey,'review:'+campaign.id,'EX',3600);
   campaign.status='needs_review';campaign.lastError='Twilio did not confirm whether the call started. Review this contact to prevent a duplicate call.';await saveCampaign(campaign);return {status:campaign.status}
  }
  return continueCampaign(campaign,now);
 }finally{if(dialLockKey)await redis('EVAL',unlockScript,1,dialLockKey,dialLock);await redis('EVAL',unlockScript,1,lockKey,lock)}
}
function cryptoRandomId(){return randomUUID()}
async function continueCampaign(campaign,now){
 if(campaign.status==='cancelled')return {status:'cancelled'};
 const next=new Date(Math.max(now.getTime()+NEXT_CONTACT_DELAY*1000,nextCampaignCallingTime(now).getTime()));
 const scheduled=await enqueue(campaign,next);campaign.status='scheduled';campaign.runAt=next.toISOString();campaign.messageId=String(scheduled.messageId||'');campaign.dispatchToken=scheduled.dispatchToken;await saveCampaign(campaign);return {status:'scheduled',runAt:campaign.runAt}
}
export const campaignConstants={MAX_RECIPIENTS,NEXT_CONTACT_DELAY,CALLBACK_PATH};
