import {authorize,json,readBody} from '../lib/telephony.js';

export default async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 if(!authorize(req))return json(res,401,{error:'Workspace authentication required.'});
 try{
  const body=await readBody(req),prompt=String(body.prompt||'').trim();
  if(!prompt||prompt.length>4000)return json(res,400,{error:'Enter a prompt of up to 4,000 characters.'});
  if(!process.env.VOICE_BRIDGE_URL||!process.env.VOICE_BRIDGE_SECRET)return json(res,503,{error:'The voice bridge is not configured.'});
  const bridge=new URL(process.env.VOICE_BRIDGE_URL);bridge.protocol='https:';bridge.pathname='/prompts';bridge.search='';bridge.hash='';
  const supplied=body.agent||{},agent={name:String(supplied.name||'').slice(0,40),company:String(supplied.company||'').slice(0,80),language:String(supplied.language||'Romanian').slice(0,30),goal:String(supplied.goal||'').slice(0,1000),backendModel:String(supplied.backendModel||'').slice(0,50)};
  const response=await fetch(bridge,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.VOICE_BRIDGE_SECRET}`},body:JSON.stringify({prompt,agent}),signal:AbortSignal.timeout(65000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)return json(res,response.status,{error:data.error||'Prompt generation failed.'});
  return json(res,200,data);
 }catch(error){return json(res,error.name==='TimeoutError'?504:502,{error:error.name==='TimeoutError'?'Prompt generation timed out. Try again.':error.message||'Prompt generation failed.'})}
}
