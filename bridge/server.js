import { buildIdentityPrompt } from '../public/identity.js';
import http from 'node:http';
import {createHmac} from 'node:crypto';
import WebSocket,{WebSocketServer} from 'ws';
import {equal} from '../lib/telephony.js';
const required=['OPENAI_API_KEY','VOICE_BRIDGE_SECRET','VOICE_BRIDGE_URL','TWILIO_AUTH_TOKEN','TWILIO_ACCOUNT_SID'];
const missing=required.filter(key=>!process.env[key]?.trim());
if(missing.length)throw new Error(`Missing bridge environment variables: ${missing.join(', ')}`);
const server=http.createServer((req,res)=>{res.writeHead(req.url==='/health'?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify({status:req.url==='/health'?'ok':'not-found'}))});
const sockets=new WebSocketServer({noServer:true,maxPayload:65536});
// Validate the externally visible upgrade URL, not an untrusted Host header.
server.on('upgrade',(req,socket,head)=>{
 const canonical=new URL(process.env.VOICE_BRIDGE_URL);const validPath=req.url===canonical.pathname;
 const signedURL=canonical.href.replace(/^wss:/,'https:');
 const expected=createHmac('sha1',process.env.TWILIO_AUTH_TOKEN).update(signedURL).digest('base64');
 if(!validPath||!equal(req.headers['x-twilio-signature'],expected)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return}
 sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws));
});
const used=new Map();
const voices=new Set(['marin','cedar','quartz','ripple','vesper','willow','stone','gleam']);
sockets.on('connection',phone=>{
 let live,started=false,streamSid,stopping=false,closeTimeout,paceTimer,pendingOutput=Buffer.alloc(0),inputQueue=[],markIndex=0;const marks=new Set();
 const sendPhone=e=>{if(phone.readyState===WebSocket.OPEN)phone.send(JSON.stringify(e))};
 const sendLive=e=>{if(live?.readyState===WebSocket.OPEN)live.send(JSON.stringify(e))};
 const startupTimeout=setTimeout(()=>phone.close(1008,'No valid start received'),10000);
 const stop=()=>{if(stopping)return;stopping=true;clearTimeout(startupTimeout);clearInterval(paceTimer);if(started){sendLive({type:'session.close'});closeTimeout=setTimeout(()=>live?.terminate(),15000)}else live?.terminate()};
 phone.on('error',()=>stop());phone.on('close',stop);
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
 streamSid=event.start.streamSid;clearTimeout(startupTimeout);
 live=new WebSocket('wss://api.openai.com/v1/live/sessions',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},handshakeTimeout:10000});
 live.on('open',()=>sendLive({type:'session.start',session:{model:'gpt-live-1',instructions:buildIdentityPrompt(data.agent,data.contact,data.objective),audio:{format:{type:'audio/pcmu',rate:8000},output:{voice:voices.has(data.agent?.voice)?data.agent.voice:'marin'}},delegation:{type:'responses',responses:{model:process.env.OPENAI_BACKEND_MODEL||'gpt-5.6-luna',instructions:'Help the voice assistant with the stated call objective. No company tools are available. Do not invent completed actions.'}}}}));
 live.on('message',raw=>{try{const e=JSON.parse(raw.toString());
 if(e.type==='session.started'){started=true;for(const audio of inputQueue)sendLive({type:'session.input_audio.append',audio});inputQueue=[];}
 if(e.type==='session.output_audio.delta'){pendingOutput=Buffer.concat([pendingOutput,Buffer.from(e.delta,'base64')]);if(pendingOutput.length>80000){phone.close(1011,'Audio backlog');stop()}}
 if(e.type==='session.closed'){clearTimeout(closeTimeout);live.close();phone.close();stop();}
 if(e.type==='error'){console.error('Live session error',e.error?.code||'unknown');phone.close(1011,'Voice session error');stop()}
 }catch{phone.close(1011,'Invalid voice event');stop()}});
 live.on('error',()=>{phone.close(1011,'Voice service unavailable');stop()});
 live.on('close',()=>{clearTimeout(closeTimeout);phone.close();stop()});
 // Pace G.711 into 20 ms frames; marks bound the Twilio playback queue to 200 ms.
 // GPT-Live is full duplex. Do not apply Realtime speech-start cancellation heuristics.
 paceTimer=setInterval(()=>{if(!started||stopping||!pendingOutput.length||marks.size>=10)return;const frame=pendingOutput.subarray(0,160);pendingOutput=pendingOutput.subarray(frame.length);const mark=String(++markIndex);marks.add(mark);sendPhone({event:'media',streamSid,media:{payload:frame.toString('base64')}});sendPhone({event:'mark',streamSid,mark:{name:mark}})},20);
 }else if(event.event==='media'&&event.media?.payload){if(started&&!stopping)sendLive({type:'session.input_audio.append',audio:event.media.payload});else if(inputQueue.length<100)inputQueue.push(event.media.payload)}
 else if(event.event==='mark')marks.delete(event.mark?.name);
 else if(event.event==='stop'){stop();phone.close()}
 }catch{phone.close(1008,'Invalid stream');stop()}});
});
server.listen(Number(process.env.PORT||process.env.BRIDGE_PORT||3001),'0.0.0.0',()=>console.log('Voice bridge is listening'));
