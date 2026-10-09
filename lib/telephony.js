import { timingSafeEqual } from 'node:crypto';
export const config=()=>({twilio:!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN),openai:!!process.env.OPENAI_API_KEY,bridge:!!process.env.VOICE_BRIDGE_URL,mode:'preview'});
export const equal=(a,b)=>{const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length===bb.length&&timingSafeEqual(aa,bb)};
export function authorize(req){return process.env.MASSCALL_ADMIN_TOKEN?.length>=24&&equal(req.headers.authorization,`Bearer ${process.env.MASSCALL_ADMIN_TOKEN}`)}
export async function requireReadyBridge(bridge=process.env.VOICE_BRIDGE_URL){
 let health;
 try{
  const url=new URL(bridge);
  if(url.protocol!=='wss:'||url.pathname!=='/media'||url.search||url.hash)throw new Error('Invalid bridge URL');
  url.protocol='https:';url.pathname='/health';health=url;
 }catch{throw Object.assign(new Error('The voice service is not configured. No call was placed.'),{status:503,code:'VOICE_BRIDGE_UNAVAILABLE'})}
 try{
  const response=await fetch(health,{signal:AbortSignal.timeout(18000),cache:'no-store'});
  if(response.ok&&(await response.json()).status==='ok')return;
 }catch{}
 throw Object.assign(new Error('The voice service is unavailable or still starting. No call was placed. Please try again in a minute.'),{status:503,code:'VOICE_BRIDGE_UNAVAILABLE'});
}
export async function twilio(resource,method='GET',values){const sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN;if(!sid||!token)throw new Error('Twilio credentials are not configured.');const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${resource}`,{method,headers:{Authorization:'Basic '+Buffer.from(`${sid}:${token}`).toString('base64'),...(values?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:values?new URLSearchParams(values):undefined,signal:AbortSignal.timeout(15000)});const data=r.status===204?{}:await r.json();if(!r.ok){const e=new Error(data.message||'Twilio request failed');e.status=r.status;throw e}return data}
export const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function readBody(req){if(req.body&&typeof req.body==='object')return req.body;let text='';for await(const chunk of req){text+=chunk;if(text.length>24000)throw new Error('Request too large')}return JSON.parse(text||'{}')}
export function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
