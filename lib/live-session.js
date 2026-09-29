import { buildIdentityPrompt, renderPhrase, normalizeIdentity } from '../public/identity.js';

export function buildLiveSessionConfig(value={}, contact='', objective='', fallbackModel='gpt-5.6-luna',recordingDisclosed=true) {
  const agent=normalizeIdentity(value);
  const responses={
    model:agent.backendModel||fallbackModel,
    instructions:[agent.backendPrompt,'Call control: use the end_call function only when the stated objective is complete or the caller clearly asks to stop. This function tells the phone system to end after a brief spoken goodbye; do not use it for an ordinary pause or unfinished task.'].filter(Boolean).join('\n\n'),
    tools:[{type:'function',name:'end_call',description:'End this phone call after the objective has been completed or the caller clearly asks to stop.',parameters:{type:'object',properties:{reason:{type:'string',enum:['goal_complete','caller_requested_end']}},required:['reason'],additionalProperties:false},strict:true}]
  };
  if(agent.reasoningEffort)responses.reasoning={effort:agent.reasoningEffort};
  if(agent.webSearch)responses.tools.push({type:'web_search'});
  return {
    model:'gpt-live-1',
    instructions:buildIdentityPrompt(agent,contact,objective,{disclosureAlreadySpoken:true,recordingDisclosed})+'\n\nWhen the objective is complete, or the caller clearly asks to end the conversation, delegate immediately to the backend to call end_call. Wait for its confirmation, say the configured closing in a friendly, brief way, then stop speaking. Do not continue with another question.',
    audio:{format:{type:'audio/pcmu',rate:8000},output:{voice:agent.voice}},
    delegation:{type:'responses',responses}
  };
}

export function openingInstructions(value={}, contact='', objective='',recordingDisclosed=true) {
  const agent=normalizeIdentity(value);
  const opening=agent.opening.trim();
  const disclosures=`The caller already heard that you are one of Vico's AI assistants${recordingDisclosed?' and that the call is recorded':''}. Do not repeat ${recordingDisclosed?'those disclosures':'that introduction'} or give another full self-introduction.`;
  if(!opening)return `Speak in ${agent.language}. ${disclosures} Give a friendly greeting and ask how you can help, then pause and listen.`;
  return `Speak in ${agent.language}. ${disclosures} Begin with a warm greeting, then say this opening naturally: ${renderPhrase(opening,agent,contact,objective)} After that, pause and listen.`;
}
