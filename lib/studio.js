import {randomBytes} from 'node:crypto';
import {redis,hash,romanianMobile,verifyRequest,reserveVerification,challengeTurnstile} from './demo.js';
import {normalizeIdentity} from '../public/identity.js';
import {buildCallTwiml} from './call-context.js';
import {twilio} from './telephony.js';

export const studioConfigured=()=>process.env.STUDIO_ENABLED==='true'&&/^AC[0-9a-f]{32}$/i.test(process.env.TWILIO_ACCOUNT_SID||'')&&/^VA[0-9a-f]{32}$/i.test(process.env.TWILIO_VERIFY_SERVICE_SID||'')&&/^\+40\d{9}$/.test(process.env.DEMO_FROM_NUMBER||'')&&/^wss:\/\/[^?#]+$/.test(process.env.VOICE_BRIDGE_URL||'')&&/^https:\/\//.test(process.env.UPSTASH_REDIS_REST_URL||'')&&/^https:\/\//.test(process.env.SITE_URL||'')&&String(process.env.DEMO_HASH_SECRET||'').length>=32&&!!(process.env.TWILIO_AUTH_TOKEN&&process.env.VOICE_BRIDGE_SECRET&&process.env.UPSTASH_REDIS_REST_TOKEN&&process.env.TURNSTILE_SECRET_KEY&&process.env.TURNSTILE_SITE_KEY&&process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_PRICE_ID);
const accountKey=phone=>`studio:account:${hash(phone)}`;
export const accountDefault=()=>({agent:normalizeIdentity({name:'Andreea',company:'Compania ta',language:'Romanian',goal:'Confirmă o programare și află dacă ora este potrivită.',introduction:'Bună ziua, sunt {agent_name}, asistentul AI al companiei {company_name}.'}),subscription:null,customer:null});
export async function account(phone){const data=await redis('GET',accountKey(phone));return data?JSON.parse(data):accountDefault()}
export async function saveAccount(phone,data){await redis('SET',accountKey(phone),JSON.stringify(data))}
export async function createSession(res,phone){const token=randomBytes(32).toString('base64url');await redis('SET',`studio:session:${hash(token)}`,phone,'EX',2592000);const secure=process.env.SITE_URL?.startsWith('https://')?'; Secure':'';res.setHeader('Set-Cookie',`masscall_studio=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`)}
export async function sessionPhone(req){const cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('masscall_studio='));const token=cookie?.slice('masscall_studio='.length);if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;return redis('GET',`studio:session:${hash(token)}`)}
export async function clearSession(req,res){const cookie=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('masscall_studio='));const token=cookie?.slice('masscall_studio='.length);if(token)await redis('DEL',`studio:session:${hash(token)}`);res.setHeader('Set-Cookie','masscall_studio=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0')}
export async function stripe(path,body){const r=await fetch('https://api.stripe.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.STRIPE_SECRET_KEY,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:body?new URLSearchParams(body):undefined,signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error?.message||'Payment service unavailable.'),{status:502});return data}
export async function activeAccount(phone){const data=await account(phone);if(!data.subscription)return {data,active:false};const subscription=await stripe('subscriptions/'+encodeURIComponent(data.subscription));return {data,active:['active','trialing'].includes(subscription.status)};}
export async function createCheckout(phone){const base=process.env.SITE_URL.replace(/\/$/,'');const data=await account(phone);const params={mode:'subscription','line_items[0][price]':process.env.STRIPE_PRICE_ID,'line_items[0][quantity]':'1',client_reference_id:hash(phone),success_url:base+'/studio?session_id={CHECKOUT_SESSION_ID}',cancel_url:base+'/studio?checkout=canceled'};if(data.customer)params.customer=data.customer;const session=await stripe('checkout/sessions',params);return session.url}
export async function createBillingPortal(phone){const data=await account(phone);if(!data.customer)throw Object.assign(new Error('Nu există încă un abonament pentru acest cont.'),{status:404});const session=await stripe('billing_portal/sessions',{customer:data.customer,return_url:process.env.SITE_URL.replace(/\/$/,'')+'/studio'});return session.url}
export async function completeCheckout(phone,id){if(!/^cs_(test_)?[A-Za-z0-9_]+$/.test(id))throw Object.assign(new Error('Invalid checkout session.'),{status:400});const session=await stripe('checkout/sessions/'+encodeURIComponent(id));if(session.client_reference_id!==hash(phone)||!session.subscription||session.status!=='complete')throw Object.assign(new Error('Checkout is not complete.'),{status:403});const subscription=await stripe('subscriptions/'+encodeURIComponent(session.subscription));if(!['active','trialing'].includes(subscription.status))throw Object.assign(new Error('Subscription is not active.'),{status:403});const data=await account(phone);data.subscription=session.subscription;data.customer=session.customer;await saveAccount(phone,data);return data}
const callScript=`local n=tonumber(redis.call('GET',KEYS[1]) or '0');if n>=tonumber(ARGV[1]) then return 0 end;redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],172800);return 1`;
export async function premiumTestCall(phone,agent,assignedNumber){
 if(!romanianMobile(phone))throw new Error('A verified Romanian mobile is required.');
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'});
 const allowed=Number(await redis('EVAL',callScript,1,`studio:test:${hash(phone)}:${date}`,3))===1;
 if(!allowed)throw Object.assign(new Error('Limita de trei apeluri de test pe zi a fost atinsă.'),{status:429});
 const from=assignedNumber||process.env.DEMO_FROM_NUMBER;
 const twiml=buildCallTwiml({bridge:process.env.VOICE_BRIDGE_URL,secret:process.env.VOICE_BRIDGE_SECRET,agent,objective:agent.goal,recording:true});
 const call=await twilio('Calls.json','POST',{To:phone,From:from,Twiml:twiml,Record:'true',RecordingChannels:'dual',RecordingTrack:'both',TimeLimit:'180',Timeout:'25'});
 await redis('LPUSH',`studio:calls:${hash(phone)}`,call.sid);await redis('LTRIM',`studio:calls:${hash(phone)}`,0,19);
 return call;
}
export async function ownCallIds(phone){return await redis('LRANGE',`studio:calls:${hash(phone)}`,0,19)||[]}
export async function assignNumber(phone,number){
 const owned=await twilio('IncomingPhoneNumbers.json?PhoneNumber='+encodeURIComponent(number));
 if(!owned.incoming_phone_numbers?.some(n=>n.phone_number===number))throw Object.assign(new Error('Number is not owned by this Twilio account.'),{status:400});
 const key=`studio:number:${hash(number)}`,existing=await redis('GET',key),owner=hash(phone);
 if(existing&&existing!==owner)throw Object.assign(new Error('Number is already assigned.'),{status:409});
 if(!existing&&await redis('SET',key,owner,'NX')!=='OK')throw Object.assign(new Error('Number assignment conflicted.'),{status:409});
 const data=await account(phone);data.number=number;await saveAccount(phone,data);return data;
}
export function withinCallingHours(now=new Date()){
 const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Bucharest',weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const weekday=local.find(x=>x.type==='weekday')?.value,hour=Number(local.find(x=>x.type==='hour')?.value);
 return !['Sat','Sun'].includes(weekday)&&hour>=9&&hour<18;
}
export async function addOptOut(phone,to){if(!romanianMobile(to))throw Object.assign(new Error('Invalid Romanian mobile.'),{status:400});await redis('SET',`studio:optout:${hash(phone)}:${hash(to)}`,'1')}
export async function premiumContactCall(phone,data,{to,contact,consent,recordingConsent},now=new Date()){
 if(!data.number)throw Object.assign(new Error('A dedicated business number has not been assigned yet.'),{status:403});
 if(!romanianMobile(to)||typeof contact!=='string'||!contact.trim()||contact.length>80)throw Object.assign(new Error('Enter a Romanian mobile and contact name.'),{status:400});
 if(consent!==true||recordingConsent!==true)throw Object.assign(new Error('Calling and recording permission are required.'),{status:400});
 if(Number(await redis('EXISTS',`studio:optout:${hash(phone)}:${hash(to)}`))===1)throw Object.assign(new Error('This contact is on the do-not-call list.'),{status:403});
 if(!withinCallingHours(now))throw Object.assign(new Error('Customer calls are available Monday to Friday, 09:00–18:00 Romania time.'),{status:403});
 const date=now.toLocaleDateString('en-CA',{timeZone:'Europe/Bucharest'});
 const allowed=Number(await redis('EVAL',callScript,1,`studio:outbound:${hash(phone)}:${date}`,20))===1;
 if(!allowed)throw Object.assign(new Error('Daily call limit reached.'),{status:429});
 const twiml=buildCallTwiml({bridge:process.env.VOICE_BRIDGE_URL,secret:process.env.VOICE_BRIDGE_SECRET,agent:data.agent,contact:contact.trim(),objective:data.agent.goal,recording:true});
 const call=await twilio('Calls.json','POST',{To:to,From:data.number,Twiml:twiml,Record:'true',RecordingChannels:'dual',RecordingTrack:'both',TimeLimit:'300',Timeout:'25'});
 await redis('LPUSH',`studio:calls:${hash(phone)}`,call.sid);await redis('LTRIM',`studio:calls:${hash(phone)}`,0,19);
 await redis('SET',`studio:call:${call.sid}`,JSON.stringify({to,contact:contact.trim(),at:now.toISOString(),consent:true,recordingConsent:true}),'EX',2592000);
 return call;
}
export {verifyRequest,reserveVerification,challengeTurnstile,normalizeIdentity};
