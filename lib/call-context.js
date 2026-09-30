import {createHmac} from 'node:crypto';
import {normalizeIdentity} from '../public/identity.js';
import {normalizeCallPlan} from './call-plan.js';
import {xml} from './telephony.js';

export function buildCallTwiml({bridge,secret,agent,contact='',objective,callPlan={},recording=false}){
 const identity=normalizeIdentity(agent);
 const context=Buffer.from(JSON.stringify({expires:Date.now()+120000,objective,contact,callPlan:normalizeCallPlan(callPlan),recording:Boolean(recording),agent:identity})).toString('base64url');
 if(context.length>40000)throw Object.assign(new Error('Agent identity is too large for a call.'),{status:400});
 const chunks=context.match(/.{1,400}/g)||[];
 const signature=createHmac('sha256',secret).update(context).digest('hex');
 const parameters=chunks.map((value,i)=>`<Parameter name="context${i}" value="${xml(value)}"/>`).join('');
 return `<Response><Connect><Stream url="${xml(bridge)}">${parameters}<Parameter name="count" value="${chunks.length}"/><Parameter name="signature" value="${signature}"/></Stream></Connect><Hangup/></Response>`;
}
