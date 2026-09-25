import {readBody,json,twilio} from '../lib/telephony.js';
import {demoConfigured,romanianMobile,reserveVerification,reserveCall,releaseCall,verifyRequest,createDemoCall,challengeTurnstile,statusToken,callForToken} from '../lib/demo.js';

export default async function handler(req,res){
 try{
  const url=new URL(req.url,'http://localhost');const action=url.searchParams.get('action');
  if(req.method==='GET'&&action==='config')return json(res,200,{enabled:demoConfigured(),country:'RO',from:demoConfigured()?process.env.DEMO_FROM_NUMBER:null,turnstileSiteKey:demoConfigured()?process.env.TURNSTILE_SITE_KEY:null,recorded:false});
  if(!demoConfigured())return json(res,503,{error:'Apelurile demonstrative nu sunt disponibile momentan.'});
  if(req.method==='GET'&&action==='status'){
   const sid=await callForToken(url.searchParams.get('token'));
   if(!sid)return json(res,404,{error:'Apelul nu a fost găsit.'});
   const call=await twilio(`Calls/${sid}.json`);
   return json(res,200,{status:call.status,duration:Number(call.duration||0)});
  }
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
  const body=await readBody(req),phone=String(body.phone||'').trim();
  if(!romanianMobile(phone))return json(res,400,{error:'Introdu un număr mobil românesc în format +407xxxxxxxx.'});
  if(action==='start'){
   if(body.consent!==true)return json(res,400,{error:'Confirmă că dorești să primești apelul demonstrativ.'});
   if(!await challengeTurnstile(body.challenge,req))return json(res,403,{error:'Verificarea de securitate nu a reușit.'});
   if(!await reserveVerification(req,phone))return json(res,429,{error:'Limita de încercări a fost atinsă. Revino mai târziu.'});
   await verifyRequest('Verifications',{To:phone,Channel:'sms'});
   return json(res,200,{status:'code-sent'});
  }
  if(action==='call'){
   if(body.consent!==true)return json(res,400,{error:'Confirmă că dorești să primești apelul demonstrativ.'});
   if(!/^\d{4,10}$/.test(String(body.code||'')))return json(res,400,{error:'Introdu codul primit prin SMS.'});
   const check=await verifyRequest('VerificationCheck',{To:phone,Code:String(body.code)});
   if(check.status!=='approved')return json(res,400,{error:'Codul nu este corect sau a expirat.'});
   const reservation=await reserveCall(req,phone);
   if(!reservation)return json(res,429,{error:'Acest număr a folosit deja apelul gratuit sau limita zilnică a fost atinsă.'});
   let call;
   try{call=await createDemoCall(phone)}catch(error){await releaseCall(reservation);throw error}
   const token=await statusToken(call.sid);
   return json(res,201,{status:call.status,token});
  }
  return json(res,404,{error:'Unknown action.'});
 }catch(error){return json(res,error.status>=400&&error.status<500?error.status:502,{error:error.status>=500?'Serviciul de apeluri nu este disponibil momentan.':error.message||'Cererea nu a reușit.'})}
}
