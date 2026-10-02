import { buildLiveSessionConfig, openingInstructions } from '../lib/live-session.js';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import WebSocket,{WebSocketServer} from 'ws';
import {equal,twilio} from '../lib/telephony.js';
import {verifyStreamSignature} from '../lib/twilio-stream-signature.js';
import {normalizeRehearsalRequest,rehearsalInstructions,rehearsalInput} from '../lib/rehearsal.js';
const required=['OPENAI_API_KEY','VOICE_BRIDGE_SECRET','VOICE_BRIDGE_URL','TWILIO_AUTH_TOKEN','TWILIO_ACCOUNT_SID'];
const missing=required.filter(key=>!process.env[key]?.trim());
if(missing.length)throw new Error(`Missing bridge environment variables: ${missing.join(', ')}`);
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const log=(event,details={})=>console.log(JSON.stringify({event,...details}));
const server=http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method==='GET'&&pathname==='/health')return reply(res,200,{status:'ok'});
 if(req.method!=='POST'||!['/prompts','/rehearsal'].includes(pathname))return reply(res,404,{error:'Not found.'});
 if(!equal(req.headers.authorization,`Bearer ${process.env.VOICE_BRIDGE_SECRET}`))return reply(res,401,{error:'Authentication required.'});
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>24000)return reply(res,413,{error:'Request is too large.'})}
  const body=JSON.parse(raw||'{}');
  if(pathname==='/rehearsal'){
   let rehearsal;try{rehearsal=normalizeRehearsalRequest(body)}catch(error){return reply(res,400,{error:error.message||'Invalid rehearsal request.'})}
   const generated=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:rehearsal.agent.backendModel||process.env.OPENAI_BACKEND_MODEL||'gpt-6-luna',instructions:rehearsalInstructions(rehearsal),input:rehearsalInput(rehearsal),text:{format:{type:'json_object'}},max_output_tokens:350,store:false}),signal:AbortSignal.timeout(30000)});
   const result=await generated.json().catch(()=>({}));if(!generated.ok){log('bridge.rehearsal_provider_error',{status:generated.status});return reply(res,502,{error:'OpenAI could not run this rehearsal. Check the selected model and API access.'})}
   const output=(result.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('');let turn;try{turn=JSON.parse(output)}catch{return reply(res,502,{error:'OpenAI returned an incomplete rehearsal turn. Please try again.'})}
   const message=String(turn.reply||'').trim().slice(0,1500);if(!message||typeof turn.callComplete!=='boolean')return reply(res,502,{error:'OpenAI returned an incomplete rehearsal turn. Please try again.'});
   return reply(res,200,{reply:message,callComplete:turn.callComplete});
  }
  const prompt=String(body.prompt||'').trim();
  if(!prompt||prompt.length>4000)return reply(res,400,{error:'Enter a prompt of up to 4,000 characters.'});
  const agent=body.agent&&typeof body.agent==='object'?body.agent:{};
  const input=`Create two compatible prompts for a GPT-Live telephone assistant from the following request. Keep the live voice prompt concise and focused on role, speech style, conversation behavior, and when to delegate. Put task procedures, research guidance, and verification rules in the delegated Responses prompt. Do not invent integrations or claim the assistant can take actions unless explicitly described. Return a JSON object with string properties livePrompt and backendPrompt only.\n\nAgent: ${JSON.stringify({name:agent.name,company:agent.company,language:agent.language,goal:agent.goal})}\n\nUser request:\n${prompt}`;
  const generated=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:agent.backendModel||process.env.OPENAI_BACKEND_MODEL||'gpt-6-luna',instructions:'Generate safe, clear instructions for a phone AI. The voice prompt should fit GPT-Live. The backend prompt is for delegated Responses reasoning and tools. Output valid JSON only.',input,text:{format:{type:'json_object'}},max_output_tokens:1800}),signal:AbortSignal.timeout(55000)});
  const result=await generated.json().catch(()=>({}));
  if(!generated.ok)return reply(res,502,{error:result.error?.message||'OpenAI could not generate prompts.'});
  const text=(result.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('');
  const prompts=JSON.parse(text);
  const livePrompt=String(prompts.livePrompt||'').trim().slice(0,6000),backendPrompt=String(prompts.backendPrompt||'').trim().slice(0,6000);
  if(!livePrompt||!backendPrompt)return reply(res,502,{error:'OpenAI returned incomplete prompts. Try again.'});
  return reply(res,200,{livePrompt,backendPrompt});
 }catch(error){console.error('Prompt generation failed',error.name||'Error');return reply(res,502,{error:'Prompt generation failed. Check OpenAI project access and try again.'})}
});
const sockets=new WebSocketServer({noServer:true,maxPayload:65536});
// Validate the externally visible upgrade URL, not an untrusted Host header.
server.on('upgrade',(req,socket,head)=>{
 const canonical=new URL(process.env.VOICE_BRIDGE_URL);const validPath=req.url===canonical.pathname;
 const validSignature=verifyStreamSignature(canonical.href,process.env.TWILIO_AUTH_TOKEN,req.headers['x-twilio-signature']);
 if(!validPath||!validSignature){log('bridge.upgrade_rejected',{validPath,validSignature,path:req.url});socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return}
 sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws));
});
const used=new Map();
const voices=new Set(['marin','cedar','quartz','ripple','vesper','willow','stone','gleam']);
sockets.on('connection',phone=>{
 let live,started=false,streamSid,callSid,stopping=false,closeTimeout,paceTimer,pendingOutput=Buffer.alloc(0),inputQueue=[],markIndex=0,receivedMedia=false,sentInput=false,receivedOutput=false,endCallRequested=false,closingAudioStarted=false,endFallbackTimer,finishHangupTimer;const marks=new Set();
 log('bridge.twilio_connected');
 const sendPhone=e=>{if(phone.readyState===WebSocket.OPEN)phone.send(JSON.stringify(e))};
 const sendLive=e=>{if(live?.readyState===WebSocket.OPEN)live.send(JSON.stringify(e))};
 const startupTimeout=setTimeout(()=>phone.close(1008,'No valid start received'),10000);
 const stop=()=>{if(stopping)return;stopping=true;clearTimeout(startupTimeout);clearTimeout(endFallbackTimer);clearTimeout(finishHangupTimer);clearInterval(paceTimer);if(started){sendLive({type:'session.close'});closeTimeout=setTimeout(()=>live?.terminate(),15000)}else live?.terminate()};
 const endTwilioCall=async reason=>{if(stopping)return;stopping=true;clearTimeout(endFallbackTimer);clearTimeout(finishHangupTimer);clearInterval(paceTimer);try{if(!/^CA[\da-f]{32}$/i.test(callSid||''))throw new Error('Invalid Twilio call SID');await twilio(`Calls/${callSid}.json`,'POST',{Status:'completed'});log('bridge.call_ended',{reason,callSid})}catch(error){log('bridge.call_end_failed',{reason,callSid,status:error.status||0,message:String(error.message||'unknown').slice(0,200)});phone.close(1011,'Unable to end call');return}sendLive({type:'session.close'});closeTimeout=setTimeout(()=>live?.terminate(),5000);phone.close()};
 const finishWhenAudioDrains=()=>{if(!endCallRequested||!closingAudioStarted||pendingOutput.length||marks.size)return;clearTimeout(finishHangupTimer);finishHangupTimer=setTimeout(()=>{if(!pendingOutput.length&&!marks.size)endTwilioCall('assistant_goodbye_finished')},1200)};
 const requestCallEnd=(callId,reason)=>{if(endCallRequested||stopping)return;endCallRequested=true;log('bridge.end_call_requested',{reason,callSid});sendLive({type:'response.item.create',item:{type:'function_call_output',call_id:callId,output:JSON.stringify({status:'ending',instruction:'The phone system will end the call after your brief, friendly goodbye. Say it now and do not ask another question.'})}});sendLive({type:'response.create'});endFallbackTimer=setTimeout(()=>endTwilioCall('goodbye_timeout'),20000)};
 phone.on('error',error=>{log('bridge.twilio_socket_error',{message:String(error.message||'unknown').slice(0,240)});stop()});phone.on('close',(code,reason)=>{log('bridge.twilio_closed',{code,reason:reason.toString().slice(0,120),receivedMedia,sentInput,receivedOutput});stop()});
 phone.on('message',raw=>{try{
 const event=JSON.parse(raw.toString());
 if(event.event==='start'){
 if(live||streamSid)throw new Error('Duplicate start');
 if(event.start.accountSid!==process.env.TWILIO_ACCOUNT_SID)throw new Error('Wrong account');
 const p=event.start.customParameters||{},count=Number(p.count);if(!Number.isInteger(count)||count<1||count>100)throw new Error('Invalid context');
 const context=Array.from({length:count},(_,i)=>p['context'+i]||'').join('');const expected=createHmac('sha256',process.env.VOICE_BRIDGE_SECRET).update(context).digest('hex');
 if(!equal(p.signature,expected))throw new Error('Invalid context signature');
 const data=JSON.parse(Buffer.from(context,'base64url').toString());
 for(const [k,expiration] of used)if(expiration<Date.now())used.delete(k);
 if(data.expires<Date.now()||used.has(p.signature))throw new Error('Expired or reused call context');used.set(p.signature,data.expires);
 streamSid=event.start.streamSid;callSid=event.start.callSid;clearTimeout(startupTimeout);log('bridge.twilio_stream_started',{callSid});
 live=new WebSocket('wss://api.openai.com/v1/live/sessions',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},handshakeTimeout:10000});
 live.on('open',()=>{
 const session=buildLiveSessionConfig(data.agent,data.contact,data.objective,process.env.OPENAI_BACKEND_MODEL||'gpt-6-luna',data.recording!==false,data.callPlan);
 if(!voices.has(session.audio.output.voice))session.audio.output.voice='marin';
 log('bridge.openai_connected',{model:session.model,voice:session.audio.output.voice});
 sendLive({type:'session.start',session});
 });
 live.on('message',raw=>{try{const e=JSON.parse(raw.toString());
 if(e.type==='session.started'){
 started=true;
 log('bridge.live_session_started',{sessionId:e.session?.id});
 const greeting=openingInstructions(data.agent,data.contact,data.objective,data.recording!==false,data.callPlan);
 sendLive({type:'session.instructions.append',client_event_id:'masscall-opening',delegation_id:null,content:greeting});
 for(const audio of inputQueue){sendLive({type:'session.input_audio.append',audio});if(!sentInput){sentInput=true;log('bridge.first_input_audio_sent',{queued:true})}}inputQueue=[];
 }
 if(e.type==='session.instructions.appended'&&e.client_event_id==='masscall-opening')log('bridge.opening_instructions_accepted',{callSid});
 if(e.type==='response.event'&&e.event?.type==='response.output_item.done'&&e.event.item?.type==='function_call'&&e.event.item.name==='end_call'){
  let args;try{args=JSON.parse(e.event.item.arguments||'{}')}catch{args={}}
  if(['goal_complete','caller_requested_end'].includes(args.reason)&&typeof e.event.item.call_id==='string')requestCallEnd(e.event.item.call_id,args.reason);
  else log('bridge.invalid_end_call_arguments',{callSid});
 }
 if(e.type==='session.output_audio.delta'){if(!receivedOutput){receivedOutput=true;log('bridge.first_output_audio_received')}if(endCallRequested){closingAudioStarted=true;clearTimeout(finishHangupTimer)}pendingOutput=Buffer.concat([pendingOutput,Buffer.from(e.delta,'base64')]);if(pendingOutput.length>80000){log('bridge.output_backlog_limit');phone.close(1011,'Audio backlog');stop()}}
 if(e.type==='session.closed'){clearTimeout(closeTimeout);live.close();phone.close();stop();}
 if(e.type==='error'){log('bridge.openai_session_error',{code:e.error?.code||'unknown',message:String(e.error?.message||'unknown').slice(0,240),eventId:e.error?.client_event_id});phone.close(1011,'Voice session error');stop()}
 }catch(error){log('bridge.openai_event_parse_error',{message:String(error.message||'unknown').slice(0,160)});phone.close(1011,'Invalid voice event');stop()}});
 live.on('error',error=>{log('bridge.openai_socket_error',{message:String(error.message||'unknown').slice(0,240)});phone.close(1011,'Voice service unavailable');stop()});
 live.on('close',(code,reason)=>{log('bridge.openai_closed',{code,reason:reason.toString().slice(0,120),started});clearTimeout(closeTimeout);phone.close();stop()});
 // Pace G.711 into 20 ms frames; marks bound the Twilio playback queue to 200 ms.
 // GPT-Live is full duplex. Do not apply Realtime speech-start cancellation heuristics.
 paceTimer=setInterval(()=>{if(!started||stopping||!pendingOutput.length||marks.size>=10)return;const frame=pendingOutput.subarray(0,160);pendingOutput=pendingOutput.subarray(frame.length);const mark=String(++markIndex);marks.add(mark);sendPhone({event:'media',streamSid,media:{payload:frame.toString('base64')}});sendPhone({event:'mark',streamSid,mark:{name:mark}})},20);
 }else if(event.event==='media'&&event.media?.payload){if(!receivedMedia){receivedMedia=true;log('bridge.first_twilio_audio_received')}if(started&&!stopping){sendLive({type:'session.input_audio.append',audio:event.media.payload});if(!sentInput){sentInput=true;log('bridge.first_input_audio_sent',{queued:false})}}else if(inputQueue.length<100)inputQueue.push(event.media.payload)}
 else if(event.event==='mark'){marks.delete(event.mark?.name);finishWhenAudioDrains()}
 else if(event.event==='stop'){stop();phone.close()}
 }catch(error){log('bridge.twilio_message_rejected',{message:String(error.message||'unknown').slice(0,200)});phone.close(1008,'Invalid stream');stop()}});
});
server.listen(Number(process.env.PORT||process.env.BRIDGE_PORT||3001),'0.0.0.0',()=>console.log('Voice bridge is listening'));
