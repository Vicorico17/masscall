import {createHmac,randomBytes} from 'node:crypto';
import {twilio,requireReadyBridge} from './telephony.js';
import {buildCallTwiml} from './call-context.js';

export const demoAgent={
 label:'Demo Masscall',name:'Andreea',company:'Masscall',language:'Romanian',voice:'marin',role:'Asistent demonstrativ',
 goal:'Arată cum sună o conversație cu un asistent telefonic AI.',
 addressMode:'formal',addressInstructions:'Folosește un ton cald și politicos.',
 introduction:'Bună! Sunt {agent_name}, agentul AI al lui Vico.',
 opening:'Acesta este apelul tău demonstrativ. Ai un minut să discutăm?',
 closing:'Mulțumesc că ai încercat Masscall. O zi frumoasă!',
 instructions:'Acesta este un apel demonstrativ scurt. Răspunde natural la întrebări despre cum poate ajuta un asistent telefonic AI. Nu promite funcții sau prețuri neverificate. Nu solicita date personale. Dacă persoana dorește să încheie, încheie politicos.'
};
export const demoObjective='Demonstrează o conversație telefonică naturală în limba română și explică pe scurt ce poate face un asistent AI pentru apeluri.';
export const romanianMobile=value=>/^\+407\d{8}$/.test(String(value||''));
export const demoConfigured=()=>process.env.ENABLE_PUBLIC_DEMO==='true'&&/^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')&&/^wss:\/\/[^?#]+$/.test(process.env.VOICE_BRIDGE_URL||'')&&/^https:\/\//.test(process.env.UPSTASH_REDIS_REST_URL||'')&&String(process.env.DEMO_HASH_SECRET||'').length>=32&&!!(process.env.TWILIO_AUTH_TOKEN&&process.env.VOICE_BRIDGE_SECRET&&process.env.UPSTASH_REDIS_REST_TOKEN);
export const hash=value=>createHmac('sha256',process.env.DEMO_HASH_SECRET).update(value).digest('hex');
const day=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'});
const ip=req=>String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();

export async function redis(...command){
 const r=await fetch(process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/,'')+'/',{method:'POST',headers:{Authorization:'Bearer '+process.env.UPSTASH_REDIS_REST_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(8000)});
 const data=await r.json();if(!r.ok||data.error)throw new Error('Demo limit service unavailable.');return data.result;
}
const startScript=`local a=tonumber(redis.call('GET',KEYS[1]) or '0')
local b=tonumber(redis.call('GET',KEYS[2]) or '0')
local c=tonumber(redis.call('GET',KEYS[3]) or '0')
if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) or c>=tonumber(ARGV[3]) then return 0 end
if redis.call('SET',KEYS[4],'1','NX','EX',90)==false then return 0 end
redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],172800)
redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],172800)
redis.call('INCR',KEYS[3]);redis.call('EXPIRE',KEYS[3],172800)
return 1`;
const callScript=`if redis.call('EXISTS',KEYS[1])==1 then return 0 end
local a=tonumber(redis.call('GET',KEYS[2]) or '0')
local b=tonumber(redis.call('GET',KEYS[3]) or '0')
if a>=tonumber(ARGV[1]) or b>=tonumber(ARGV[2]) then return 0 end
redis.call('SET',KEYS[1],ARGV[3])
redis.call('INCR',KEYS[2]);redis.call('EXPIRE',KEYS[2],172800)
redis.call('INCR',KEYS[3]);redis.call('EXPIRE',KEYS[3],172800)
return 1`;
export async function reserveVerification(req,phone,prefix='demo'){
 const d=day(),p=hash(phone),i=hash(ip(req));
 return Number(await redis('EVAL',startScript,4,`${prefix}:verify:all:${d}`,`${prefix}:verify:ip:${i}:${d}`,`${prefix}:verify:phone:${p}:${d}`,`${prefix}:verify:cooldown:${p}`,100,4,2))===1;
}
export async function reserveCall(req,phone){
 const d=day(),p=hash(phone),i=hash(ip(req)),reservation=randomBytes(16).toString('hex');
 const allowed=Number(await redis('EVAL',callScript,3,`demo:used:${p}`,`demo:calls:all:${d}`,`demo:calls:ip:${i}:${d}`,20,2,reservation))===1;
 return allowed?{reservation,phoneKey:`demo:used:${p}`,globalKey:`demo:calls:all:${d}`,ipKey:`demo:calls:ip:${i}:${d}`}:null;
}
export async function releaseCall(reservation){
 const script=`if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
redis.call('DEL',KEYS[1]);redis.call('DECR',KEYS[2]);redis.call('DECR',KEYS[3]);return 1`;
 await redis('EVAL',script,3,reservation.phoneKey,reservation.globalKey,reservation.ipKey,reservation.reservation);
}
async function verifyApi(path,values){
 const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;
 const r=await fetch(`https://verify.twilio.com/v2/Services${path}`,{method:values?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(`${sid}:${token}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},...(values?{body:new URLSearchParams(values)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await r.json();if(!r.ok){const error=new Error(data.message||'Phone verification failed.');error.status=r.status;throw error}return data;
}
// Set up the dedicated SMS service using the already connected Twilio account.
// Account-scoped Redis cache and lock prevent concurrent service creation.
export async function demoVerifyService(){
 const configured=process.env.TWILIO_VERIFY_SERVICE_SID;
 if(configured){if(!/^VA[0-9a-f]{32}$/i.test(configured))throw new Error('Serviciul SMS nu este configurat corect.');return configured}
 const key=`demo:verify-service:${process.env.TWILIO_ACCOUNT_SID}`;
 const cached=await redis('GET',key);if(cached)return cached;
 const lock=randomBytes(16).toString('hex');
 if(!await redis('SET',key+':lock',lock,'NX','EX',60))throw Object.assign(new Error('Pregătim verificarea SMS. Încearcă din nou într-un minut.'),{status:503});
 try{
  const existing=await verifyApi('?PageSize=100');
  let service=existing.services?.find(item=>item.friendly_name==='Masscall Demo');
  if(!service){
   if(existing.meta?.next_page_url)throw new Error('Configurează serviciul SMS pentru apelurile de test.');
   service=await verifyApi('',{FriendlyName:'Masscall Demo',CodeLength:'6'});
  }
  if(!/^VA[0-9a-f]{32}$/i.test(service.sid))throw new Error('Serviciul SMS nu este disponibil.');
  await redis('SET',key,service.sid);return service.sid;
 }finally{await redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,key+':lock',lock)}
}
export async function verifyRequest(path,values){
 return verifyApi(`/${await demoVerifyService()}/${path}`,values);
}
export async function demoFromNumber(){
 const configured=process.env.DEMO_FROM_NUMBER;
 if(configured){if(!/^\+\d{8,15}$/.test(configured))throw new Error('Numărul de test nu este configurat corect.');return configured}
 const data=await twilio('IncomingPhoneNumbers.json?PageSize=100');
 const owned=data.incoming_phone_numbers?.filter(item=>item.capabilities?.voice===true).sort((a,b)=>a.phone_number.localeCompare(b.phone_number));
 if(!owned?.length)throw new Error('Nu există un număr vocal conectat pentru apelul de test.');
 return owned.find(item=>item.phone_number.startsWith('+40'))?.phone_number||owned[0].phone_number;
}
export async function createDemoCall(phone){
 if(!romanianMobile(phone))throw new Error('Introdu un număr mobil din România.');
 const from=await demoFromNumber();
 await requireReadyBridge();
 const twiml=buildCallTwiml({bridge:process.env.VOICE_BRIDGE_URL,secret:process.env.VOICE_BRIDGE_SECRET,agent:demoAgent,objective:demoObjective,recording:false});
 return twilio('Calls.json','POST',{To:phone,From:from,Twiml:twiml,Record:'false',TimeLimit:'90',Timeout:'20'});
}
export async function challengeTurnstile(token,req){
 if(!process.env.TURNSTILE_SECRET_KEY&&!process.env.TURNSTILE_SITE_KEY)return true;
 if(!process.env.TURNSTILE_SECRET_KEY||!process.env.TURNSTILE_SITE_KEY)return false;
 if(typeof token!=='string'||token.length<20||token.length>2048)return false;
 const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:token,remoteip:ip(req)}),signal:AbortSignal.timeout(8000)});
 if(!r.ok)return false;const data=await r.json();return data.success===true;
}
export async function statusToken(callSid){const token=randomBytes(24).toString('base64url');await redis('SET',`demo:status:${hash(token)}`,callSid,'EX',7200);return token}
export async function callForToken(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(token))return null;return redis('GET',`demo:status:${hash(token)}`)}
