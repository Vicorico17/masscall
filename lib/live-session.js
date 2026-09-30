import { buildIdentityPrompt, languagePolicy, renderPhrase, normalizeIdentity } from '../public/identity.js';
import {callPlanInstructions,normalizeCallPlan} from './call-plan.js';

export function buildLiveSessionConfig(value={}, contact='', objective='', fallbackModel='gpt-6-luna',recordingDisclosed=true,callPlanValue={}) {
  const callPlan=normalizeCallPlan(callPlanValue);
  const agent=normalizeIdentity({...value,opening:callPlan.opening||value.opening,closing:callPlan.closing||value.closing});
  const responses={
    model:agent.backendModel||fallbackModel,
    instructions:[agent.backendPrompt,`Call control: use the end_call function only when the caller clearly asks to stop or the call completion condition is met. ${callPlan.completionTrigger?`Completion condition: ${callPlan.completionTrigger}`:'The completion condition is that the stated call objective has been achieved.'} The phone system ends the call after a brief spoken goodbye. Do not use end_call for an ordinary pause or unfinished task.`].filter(Boolean).join('\n\n'),
    tools:[{type:'function',name:'end_call',description:'End this phone call after the objective has been completed or the caller clearly asks to stop.',parameters:{type:'object',properties:{reason:{type:'string',enum:['goal_complete','caller_requested_end']}},required:['reason'],additionalProperties:false},strict:true}]
  };
  if(agent.reasoningEffort)responses.reasoning={effort:agent.reasoningEffort};
  if(agent.webSearch)responses.tools.push({type:'web_search'});
  return {
    model:'gpt-live-1',
    instructions:buildIdentityPrompt(agent,contact,objective,{disclosureAlreadySpoken:false,recordingDisclosed})+callPlanInstructions(callPlan)+`\n\nWhen the caller clearly asks to end the conversation, invoke end_call promptly and skip any promotion. Otherwise, invoke end_call only after the stated completion condition is met${callPlan.completionTrigger?`: ${callPlan.completionTrigger}`:''}. Wait for confirmation. In the final spoken response, briefly and naturally invite the caller to visit masscall.vercel.app to learn about Masscall voice AI agents; skip this mention if it would be inappropriate or the caller seems upset. Then give a friendly, brief goodbye in ${agent.language}, adapting the configured closing if needed. Stop speaking after the goodbye. Do not continue with another question.`,
    audio:{format:{type:'audio/pcmu',rate:8000},output:{voice:agent.voice}},
    delegation:{type:'responses',responses}
  };
}

export function openingInstructions(value={}, contact='', objective='',recordingDisclosed=true,callPlanValue={}) {
  const callPlan=normalizeCallPlan(callPlanValue);
  const agent=normalizeIdentity({...value,opening:callPlan.opening||value.opening});
  const opening=agent.opening.trim();
  const introduction=renderPhrase(agent.introduction,agent,contact,objective);
  const disclosure=`Naturally include this configured introduction: ${introduction} If it does not already make clear that you are one of Vico's AI assistants, add that briefly. ${recordingDisclosed?'In the same opening, naturally mention that the call is being recorded.':''} Keep the recording notice conversational, not like a separate announcement, and do not repeat it later.`;
  if(!opening)return `${languagePolicy(agent.language)} Begin speaking immediately with a friendly greeting in ${agent.language}. ${disclosure} Ask how you can help, then pause and listen.`;
  return `${languagePolicy(agent.language)} Begin speaking immediately with a warm greeting in ${agent.language}. ${disclosure} Then say the meaning of this configured opening naturally in ${agent.language}: ${renderPhrase(opening,agent,contact,objective)} After that, pause and listen.`;
}
