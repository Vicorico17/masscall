import {authorize,json,readBody,twilio} from '../lib/telephony.js';
import {createCampaign,getCampaigns,cancelCampaign,runCampaignJob,verifyCampaignSignature,campaignConstants} from '../lib/campaigns.js';

export const config={api:{bodyParser:false}};

async function rawBody(req){
 if(typeof req.rawBody==='string')return req.rawBody;
 if(Buffer.isBuffer(req.rawBody))return req.rawBody.toString('utf8');
 if(typeof req.body==='string')return req.body;
 if(Buffer.isBuffer(req.body))return req.body.toString('utf8');
 if(req.body&&typeof req.body==='object')return JSON.stringify(req.body);
 let value='';for await(const chunk of req){value+=chunk;if(value.length>8192)throw new Error('Request too large.')}return value||'{}';
}
export default async function handler(req,res){
 const url=new URL(req.url,'http://localhost'),action=url.searchParams.get('action');
 try{
  if(req.method==='POST'&&action==='run'){
   const bodyText=await rawBody(req),signature=req.headers['upstash-signature'];
   const origin=process.env.MASSCALL_PUBLIC_URL||process.env.SITE_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL&&`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
   let callback='';try{callback=new URL(origin).origin+campaignConstants.CALLBACK_PATH}catch{}
   if(!callback||!verifyCampaignSignature(signature,bodyText,callback))return json(res,401,{error:'Invalid scheduler signature.'});
   let body;try{body=JSON.parse(bodyText)}catch{return json(res,400,{error:'Invalid job payload.'})}
   if(typeof body.campaignId!=='string'||typeof body.dispatchToken!=='string')return json(res,400,{error:'Invalid campaign job.'});
   return json(res,200,await runCampaignJob(body.campaignId,body.dispatchToken));
  }
  if(!authorize(req))return json(res,401,{error:'Workspace authentication required.'});
  if(req.method==='GET'&&action==='list')return json(res,200,{campaigns:await getCampaigns()});
  if(req.method==='POST'&&action==='create'){
   if(process.env.ENABLE_LIVE_CALLS!=='true')return json(res,403,{error:'Live calls are disabled for this workspace.'});
   if(!/^wss:\/\/[^/?#\s]+\/media$/.test(String(process.env.VOICE_BRIDGE_URL||''))||!process.env.VOICE_BRIDGE_SECRET)return json(res,503,{error:'Configure the secure voice bridge before scheduling calls.'});
   const body=await readBody(req),number=String(body.from||'');
   const owned=await twilio('IncomingPhoneNumbers.json?PhoneNumber='+encodeURIComponent(number));
   if(!owned.incoming_phone_numbers?.some(item=>item.phone_number===number))return json(res,400,{error:'Caller ID must belong to this workspace.'});
   const campaign=await createCampaign(body);return json(res,201,{campaign});
  }
  if(req.method==='POST'&&action==='cancel'){
   const body=await readBody(req);return json(res,200,{campaign:await cancelCampaign(body.id)});
  }
  return json(res,405,{error:'Method not allowed.'});
 }catch(error){return json(res,error.status>=400&&error.status<500?error.status:502,{error:error.message||'Campaign request failed.'})}
}
