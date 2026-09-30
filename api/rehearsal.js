import {authorize,json,readBody} from '../lib/telephony.js';
import {normalizeRehearsalRequest} from '../lib/rehearsal.js';

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(!authorize(req))return json(res,401,{error:'Workspace authentication required.'});
 try{
  let rehearsal;try{rehearsal=normalizeRehearsalRequest(await readBody(req))}catch(error){return json(res,400,{error:error.message||'Invalid rehearsal request.'})}
  const configured=String(process.env.VOICE_BRIDGE_URL||'').trim();
  if(!/^wss:\/\/[^/?#\s]+\/media$/.test(configured)||!process.env.VOICE_BRIDGE_SECRET)return json(res,503,{error:'The secure voice bridge is not configured.'});
  const bridge=new URL(configured);bridge.protocol='https:';bridge.pathname='/rehearsal';bridge.search='';bridge.hash='';
  const response=await fetch(bridge,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.VOICE_BRIDGE_SECRET}`},body:JSON.stringify(rehearsal),signal:AbortSignal.timeout(35000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return json(res,response.status,{error:data.error||'Rehearsal could not run.'});
  return json(res,200,data);
 }catch(error){return json(res,error.name==='TimeoutError'?504:502,{error:error.name==='TimeoutError'?'Rehearsal timed out. Please try again.':'Rehearsal failed. Check bridge and OpenAI access, then try again.'})}
}
