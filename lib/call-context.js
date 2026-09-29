import {createHmac} from 'node:crypto';
import {normalizeIdentity} from '../public/identity.js';
import {xml} from './telephony.js';

export function buildCallTwiml({bridge,secret,agent,contact='',objective,recording=false}){
 const identity=normalizeIdentity(agent);
 const context=Buffer.from(JSON.stringify({expires:Date.now()+120000,objective,contact,recording:Boolean(recording),agent:identity})).toString('base64url');
 if(context.length>40000)throw Object.assign(new Error('Agent identity is too large for a call.'),{status:400});
 const chunks=context.match(/.{1,400}/g)||[];
 const signature=createHmac('sha256',secret).update(context).digest('hex');
 const parameters=chunks.map((value,i)=>`<Parameter name="context${i}" value="${xml(value)}"/>`).join('');
 const romanian=identity.language==='Romanian';
 const disclosure=romanian
  ? recording?'Sunt unul dintre asistenții AI ai lui Vico, iar acest apel este înregistrat.':'Sunt unul dintre asistenții AI ai lui Vico.'
  : recording?'I’m one of Vico’s AI assistants, and this call is being recorded.':'I’m one of Vico’s AI assistants.';
 const say=romanian?`<Say language="ro-RO" voice="Polly.Carmen">${disclosure}</Say>`:`<Say>${disclosure}</Say>`;
 return `<Response>${say}<Connect><Stream url="${xml(bridge)}">${parameters}<Parameter name="count" value="${chunks.length}"/><Parameter name="signature" value="${signature}"/></Stream></Connect><Hangup/></Response>`;
}
