import { normalizeIdentity } from '../public/identity.js';
import {authorize,twilio,readBody,json} from '../lib/telephony.js';
import {buildCallTwiml} from '../lib/call-context.js';
export default async function handler(req,res){
 if(!authorize(req))return json(res,401,{error:'Workspace authentication required.'});
 try{
 const url=new URL(req.url,'http://localhost'),action=url.searchParams.get('action');
 if(req.method==='GET'&&action==='numbers')return json(res,200,await twilio('IncomingPhoneNumbers.json?PageSize=100'));
 if(req.method==='GET'&&action==='search'){
 const country=url.searchParams.get('country')||'RO',digits=url.searchParams.get('digits')||'';
 if(!/^[A-Z]{2}$/.test(country)||!/^\d{0,6}$/.test(digits))return json(res,400,{error:'Invalid country or number filter.'});
 return json(res,200,await twilio(`AvailablePhoneNumbers/${country}/Local.json?VoiceEnabled=true&PageSize=12${digits?'&Contains='+digits:''}`));
 }
 if(req.method==='GET'&&action==='calls')return json(res,200,await twilio('Calls.json?PageSize=50'));
 if(req.method==='GET'&&action==='recordings'){
 const call=url.searchParams.get('call');if(!/^CA[0-9a-f]{32}$/i.test(call||''))return json(res,400,{error:'Invalid call ID.'});
 return json(res,200,await twilio(`Calls/${call}/Recordings.json`));
 }
 if(req.method==='GET'&&action==='audio'){
 const recording=url.searchParams.get('recording');if(!/^RE[0-9a-f]{32}$/i.test(recording||''))return json(res,400,{error:'Invalid recording ID.'});
 const metadata=await twilio(`Recordings/${recording}.json`);if(metadata.status!=='completed')return json(res,409,{error:'Recording is not ready yet.'});
 const sid=process.env.TWILIO_ACCOUNT_SID;
 const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recording}.mp3`,{headers:{Authorization:'Basic '+Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')},signal:AbortSignal.timeout(15000)});
 if(!r.ok)return json(res,502,{error:'Recording download failed.'});
 res.writeHead(200,{'Content-Type':'audio/mpeg','Cache-Control':'private, no-store','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(await r.arrayBuffer()));return;
 }
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 const body=await readBody(req);
 if(action==='rename-number'){
 const sid=String(body.sid||''),friendlyName=String(body.friendlyName||'').trim();
 if(!/^PN[0-9a-f]{32}$/i.test(sid))return json(res,400,{error:'Select a valid Twilio number.'});
 if(!friendlyName||friendlyName.length>64)return json(res,400,{error:'Enter a name between 1 and 64 characters.'});
 const resource=`IncomingPhoneNumbers/${sid}.json`;
 await twilio(resource);
 return json(res,200,await twilio(resource,'POST',{FriendlyName:friendlyName}));
 }
 if(action==='purchase'){
 if(process.env.ENABLE_NUMBER_PURCHASES!=='true')return json(res,403,{error:'Number purchases are disabled for this workspace.'});
 if(body.confirmPurchase!==true||!/^\+[1-9]\d{7,14}$/.test(body.number||''))return json(res,400,{error:'Confirm the purchase and provide a valid number.'});
 const values={PhoneNumber:body.number,FriendlyName:'Masscall business number'};
 // Countries requiring regulatory bundles must supply already-approved resource IDs.
 for(const key of ['BundleSid','AddressSid'])if(body[key]){if(!/^(BU|AD)[a-f0-9]{32}$/i.test(body[key]))return json(res,400,{error:'Invalid regulatory resource ID'});values[key]=body[key]}
 return json(res,201,await twilio('IncomingPhoneNumbers.json','POST',values));
 }
 if(action==='call'){
 if(process.env.ENABLE_LIVE_CALLS!=='true')return json(res,403,{error:'Live calls are disabled.'});
 const bridge=String(process.env.VOICE_BRIDGE_URL||'').trim(),bridgeSecret=String(process.env.VOICE_BRIDGE_SECRET||'').trim();
 if(!bridge)return json(res,503,{error:'This Vercel deployment is not receiving VOICE_BRIDGE_URL. Check its Production environment settings, then redeploy.'});
 if(!/^wss:\/\/[^/?#\s]+\/media$/.test(bridge))return json(res,503,{error:'VOICE_BRIDGE_URL is present but invalid. Set it to wss://<bridge-host>/media with no quotes, query, or trailing slash.'});
 if(!bridgeSecret)return json(res,503,{error:'This Vercel deployment is not receiving VOICE_BRIDGE_SECRET. Check its Production environment settings, then redeploy.'});
 if(!/^\+[1-9]\d{7,14}$/.test(body.to||'')||!/^\+[1-9]\d{7,14}$/.test(body.from||''))return json(res,400,{error:'Use international phone numbers such as +407xxxxxxxx.'});
 if(body.consent!==true||body.recordingConsent!==true)return json(res,400,{error:'Calling permission and recording consent are required.'});
 const owned=await twilio('IncomingPhoneNumbers.json?PhoneNumber='+encodeURIComponent(body.from));if(!owned.incoming_phone_numbers?.some(n=>n.phone_number===body.from))return json(res,400,{error:'Caller ID must belong to this workspace.'});
 const objective=String(body.objective||'').trim();if(!objective||objective.length>2000)return json(res,400,{error:'A call objective of up to 2,000 characters is required.'});
 const agent=normalizeIdentity(body.agent);
 const contact=String(body.contact||'').trim().slice(0,80);
 const twiml=buildCallTwiml({bridge,secret:bridgeSecret,agent,contact,objective,recording:true});
 const call=await twilio('Calls.json','POST',{To:body.to,From:body.from,Twiml:twiml,Record:'true',RecordingChannels:'dual',RecordingTrack:'both',TimeLimit:'300',Timeout:'25'});
 return json(res,201,call);
 }
 if(action==='hangup'){
 if(!/^CA[0-9a-f]{32}$/i.test(body.call||''))return json(res,400,{error:'Invalid call ID'});
 return json(res,200,await twilio(`Calls/${body.call}.json`,'POST',{Status:'completed'}));
 }
 return json(res,404,{error:'Unknown action.'});
 }catch(error){return json(res,error.status>=400&&error.status<500?error.status:502,{error:error.message||'Provider request failed.'})}
}
