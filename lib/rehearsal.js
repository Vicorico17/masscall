import {normalizeIdentity,buildIdentityPrompt,languagePolicy,vicoIntroduction} from '../public/identity.js';
import {normalizeCallPlan,callPlanInstructions} from './call-plan.js';

const clean=(value,max)=>String(value??'').trim().slice(0,max);

export function normalizeRehearsalRequest(value={}){
 const baseAgent=normalizeIdentity(value.agent||{}),agent=normalizeIdentity({...baseAgent,company:'Vico',language:'Romanian',introduction:vicoIntroduction({...baseAgent,language:'Romanian'})}),contact=clean(value.contact,80),objective=clean(value.objective,2000),callPlan=normalizeCallPlan(value.callPlan);
 const start=value.start===true;
 if(!objective)throw new Error('Add a call objective before starting a rehearsal.');
 if(!Array.isArray(value.messages)||value.messages.length>20)throw new Error('Rehearsal history is invalid or too long. Start a new rehearsal.');
 const messages=value.messages.map(item=>({role:item?.role==='assistant'?'assistant':'user',content:clean(item?.content,1200)}));
 if(messages.some((item,index)=>!item.content||index>0&&item.role===messages[index-1].role))throw new Error('Rehearsal history is invalid. Start a new rehearsal.');
 if(start&&messages.length)throw new Error('Start a new rehearsal before sending messages.');
 if(!start&&(!messages.length||messages[0].role!=='assistant'||messages.at(-1).role!=='user'))throw new Error('The rehearsal needs an agent greeting and your latest reply.');
 if(messages.reduce((total,item)=>total+item.content.length,0)>10000)throw new Error('This rehearsal is too long. Start a new rehearsal.');
 return {agent,contact,objective,callPlan,start,messages};
}

export function rehearsalInstructions(value={}){
 const {agent,contact,objective,callPlan}=normalizeRehearsalRequest({...value,start:true,messages:[]});
 return [
  'You are rehearsing the configured Vico outbound phone agent. The human chatting with you is role-playing the person receiving the call. Speak as the phone agent, never as the recipient.',
  buildIdentityPrompt(agent,contact,objective,{disclosureAlreadySpoken:true,recordingDisclosed:true}),
  callPlanInstructions(callPlan),
  `Completion condition: ${callPlan.completionTrigger||'the stated call objective has been achieved'}. When it is met, give the configured closing naturally and set callComplete to true. If the caller asks to stop, acknowledge briefly, skip any promotion, and set callComplete to true. Otherwise set callComplete to false.`,
  languagePolicy(agent.language),
  'Return JSON with exactly two fields: reply (the short spoken response for the phone agent) and callComplete (a boolean). Keep reply natural and concise. Never claim a booking, CRM update, or other action was completed because no such tools are connected. Do not mention rehearsal, JSON, or that you are simulating a call.'
 ].filter(Boolean).join('\n\n');
}

export function rehearsalInput(value){
 const request=normalizeRehearsalRequest(value);
 return request.start
  ?[{role:'user',content:'The outbound call has connected. Give the agent’s first spoken response now.'}]
  :request.messages;
}
