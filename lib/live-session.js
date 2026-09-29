import { buildIdentityPrompt, renderPhrase, normalizeIdentity } from '../public/identity.js';

export function buildLiveSessionConfig(value={}, contact='', objective='', fallbackModel='gpt-5.6-luna') {
  const agent=normalizeIdentity(value);
  const responses={model:agent.backendModel||fallbackModel,instructions:agent.backendPrompt};
  if(agent.reasoningEffort)responses.reasoning={effort:agent.reasoningEffort};
  if(agent.webSearch)responses.tools=[{type:'web_search'}];
  return {
    model:'gpt-live-1',
    instructions:buildIdentityPrompt(agent,contact,objective),
    audio:{format:{type:'audio/pcmu',rate:8000},output:{voice:agent.voice}},
    delegation:{type:'responses',responses}
  };
}

export function openingInstructions(value={}, contact='', objective='') {
  const agent=normalizeIdentity(value);
  const opening=agent.opening.trim();
  if(!opening)return `Speak in ${agent.language}. Start with a brief greeting, identify yourself as an AI assistant, and ask how you can help. Then pause and listen.`;
  return `Speak in ${agent.language}. Start now by introducing yourself as an AI assistant with this introduction: ${renderPhrase(agent.introduction,agent,contact,objective)} Then say this opening: ${renderPhrase(opening,agent,contact,objective)} After that, pause and listen.`;
}
