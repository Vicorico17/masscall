import {json,readBody,twilio,authorize} from '../lib/telephony.js';
import {studioConfigured,saveAccount,createSession,sessionPhone,clearSession,activeAccount,createCheckout,createBillingPortal,completeCheckout,premiumTestCall,premiumContactCall,addOptOut,assignNumber,ownCallIds,verifyRequest,reserveVerification,challengeTurnstile,normalizeIdentity} from '../lib/studio.js';
import {romanianMobile} from '../lib/demo.js';

export default async function handler(req,res){
 try{
  const action=new URL(req.url,'http://localhost').searchParams.get('action');
  if(req.method==='GET'&&action==='config')return json(res,200,{enabled:studioConfigured(),turnstileSiteKey:studioConfigured()?process.env.TURNSTILE_SITE_KEY:null});
  if(!studioConfigured())return json(res,503,{error:'Conturile premium nu sunt disponibile momentan.'});
  if(req.method==='POST'&&action==='assign-number'){
   if(!authorize(req))return json(res,401,{error:'Owner authentication required.'});
   const body=await readBody(req);if(!romanianMobile(body.phone)||!/^\+40\d{9}$/.test(String(body.number||'')))return json(res,400,{error:'Invalid Romanian account phone or business number.'});
   const data=await assignNumber(body.phone,body.number);return json(res,200,{number:data.number});
  }
  if(req.method==='POST'&&action==='login-start'){
   const body=await readBody(req),phone=String(body.phone||'').trim();if(!romanianMobile(phone))return json(res,400,{error:'Introdu un număr mobil românesc valid.'});
   if(!await challengeTurnstile(body.challenge,req))return json(res,403,{error:'Verificarea de securitate nu a reușit.'});
   if(!await reserveVerification(req,phone,'studio'))return json(res,429,{error:'Limita de verificări a fost atinsă.'});
   await verifyRequest('Verifications',{To:phone,Channel:'sms'});return json(res,200,{status:'code-sent'});
  }
  if(req.method==='POST'&&action==='login-check'){
   const body=await readBody(req),phone=String(body.phone||'').trim();if(!romanianMobile(phone)||!/^\d{4,10}$/.test(String(body.code||'')))return json(res,400,{error:'Număr sau cod invalid.'});
   const check=await verifyRequest('VerificationCheck',{To:phone,Code:String(body.code)});if(check.status!=='approved')return json(res,400,{error:'Codul nu este corect.'});
   await createSession(res,phone);return json(res,200,{status:'signed-in'});
  }
  const phone=await sessionPhone(req);if(!phone)return json(res,401,{error:'Autentifică-te pentru a continua.'});
  if(req.method==='GET'&&action==='me'){const {data,active}=await activeAccount(phone);return json(res,200,{phone,active,agent:data.agent,number:data.number||null})}
  if(req.method==='GET'&&action==='history'){
   const ids=await ownCallIds(phone);const calls=await Promise.all(ids.map(async sid=>{const call=await twilio(`Calls/${sid}.json`);return {sid,status:call.status,duration:Number(call.duration||0),date:call.date_created,to:call.to}}));
   return json(res,200,{calls});
  }
  if(req.method==='GET'&&action==='recordings'){
   const sid=new URL(req.url,'http://localhost').searchParams.get('call');if(!/^CA[0-9a-f]{32}$/i.test(sid||'')||!(await ownCallIds(phone)).includes(sid))return json(res,404,{error:'Apelul nu a fost găsit.'});
   const data=await twilio(`Calls/${sid}/Recordings.json`);return json(res,200,{recordings:data.recordings.map(r=>({sid:r.sid,status:r.status,duration:r.duration}))});
  }
  if(req.method==='GET'&&action==='audio'){
   const sid=new URL(req.url,'http://localhost').searchParams.get('recording');if(!/^RE[0-9a-f]{32}$/i.test(sid||''))return json(res,400,{error:'Invalid recording ID.'});
   const recording=await twilio(`Recordings/${sid}.json`);if(recording.status!=='completed'||!(await ownCallIds(phone)).includes(recording.call_sid))return json(res,404,{error:'Înregistrarea nu este disponibilă.'});
   const accountSid=process.env.TWILIO_ACCOUNT_SID;
   const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`,{headers:{Authorization:'Basic '+Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')},signal:AbortSignal.timeout(15000)});
   if(!response.ok)return json(res,502,{error:'Înregistrarea nu s-a încărcat.'});
   res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(await response.arrayBuffer()));return;
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  const origin=req.headers.origin;if(origin&&origin!==process.env.SITE_URL.replace(/\/$/,''))return json(res,403,{error:'Invalid request origin.'});
  if(action==='logout'){await clearSession(req,res);return json(res,200,{status:'signed-out'})}
  if(action==='checkout'){const url=await createCheckout(phone);return json(res,200,{url})}
  if(action==='billing-portal'){const url=await createBillingPortal(phone);return json(res,200,{url})}
  if(action==='checkout-complete'){const body=await readBody(req);await completeCheckout(phone,String(body.sessionId||''));return json(res,200,{active:true})}
  if(action==='delete-recording'){
   const body=await readBody(req),sid=String(body.recording||'');if(!/^RE[0-9a-f]{32}$/i.test(sid))return json(res,400,{error:'Invalid recording ID.'});
   const recording=await twilio(`Recordings/${sid}.json`);
   if(recording.status!=='completed'||!(await ownCallIds(phone)).includes(recording.call_sid))return json(res,404,{error:'Înregistrarea nu a fost găsită.'});
   await twilio(`Recordings/${sid}.json`,'DELETE');return json(res,200,{deleted:true});
  }
  const {data,active}=await activeAccount(phone);if(!active)return json(res,402,{error:'Este necesar un abonament premium activ.'});
  if(action==='agent'){
   const body=await readBody(req),identity=body.agent||{};
   if(!['name','company','goal','introduction'].every(key=>String(identity[key]||'').trim()))return json(res,400,{error:'Completează numele, compania, obiectivul și prezentarea.'});
   data.agent=normalizeIdentity(identity);await saveAccount(phone,data);return json(res,200,{agent:data.agent});
  }
  if(action==='test-call'){
   const body=await readBody(req);if(body.consent!==true||body.recordingConsent!==true)return json(res,400,{error:'Confirmă apelul și înregistrarea.'});
   const call=await premiumTestCall(phone,data.agent,data.number);return json(res,201,{sid:call.sid,status:call.status});
  }
  if(action==='contact-call'){
   const body=await readBody(req);const call=await premiumContactCall(phone,data,body);return json(res,201,{sid:call.sid,status:call.status});
  }
  if(action==='opt-out'){
   const body=await readBody(req);await addOptOut(phone,String(body.to||''));return json(res,200,{blocked:true});
  }
  return json(res,404,{error:'Unknown action.'});
 }catch(error){return json(res,error.status>=400&&error.status<600?error.status:502,{error:error.code==='VOICE_BRIDGE_UNAVAILABLE'?'Asistentul vocal nu este disponibil momentan. Nu am inițiat apelul; încearcă din nou într-un minut.':error.status>=500?'Serviciul nu este disponibil momentan.':error.message||'Cererea nu a reușit.'})}
}
