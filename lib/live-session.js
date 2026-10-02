import { languagePolicy, renderPhrase, normalizeIdentity } from '../public/identity.js';
import { callPlanInstructions, normalizeCallPlan } from './call-plan.js';

function liveInstructions(agent, contact, objective, callPlan) {
  const completionCondition = (callPlan.completionTrigger || 'the stated call objective has been achieved').replace(/[.!?]+$/, '');
  const context = [
    contact ? `Recipient: ${contact}.` : 'Recipient: name unknown; ask politely rather than guessing.',
    objective ? `Call objective: ${objective}.` : `Agent's standing goal: ${agent.goal}`,
    callPlanInstructions(callPlan).split('\n').filter(line => !line.startsWith('Opening guidance:') && !line.startsWith('Closing guidance:')).join('\n').trim()
  ].filter(Boolean).join('\n');
  const addressing = {
    formal: 'Use polite formal address.',
    'first-name': 'Use the recipient’s given name and a friendly tone.',
    'full-name': 'Use the provided full name and a professional tone; do not infer gender or honorifics.',
    custom: 'Follow the recipient addressing instructions below.'
  }[agent.addressMode];

  return [
    `# Role and style\nYou are ${agent.name}, an AI ${agent.role.toLowerCase()} for ${agent.company}. ${languagePolicy(agent.language)} ${addressing} ${agent.addressInstructions} Speak in short, natural turns. Let the caller finish; acknowledge briefly when useful. Be warm, clear, and calm. Never claim to be human.`,
    `# Call context\n${context}\nOpening: ${renderPhrase(callPlan.opening || agent.opening, agent, contact, objective)}\nConversation guidance: ${agent.instructions}`,
    `# Backchannel policy\nUse brief listening acknowledgements only when they fit naturally. Do not talk over the caller or fill every pause.`,
    `# Interruption policy\nIf the caller starts speaking, stop your current speech promptly and listen. Treat ordinary interruptions as a cue to listen, not as a request to end the call.`,
    `# Delegation policy\n## Backend tools\nA delegated Responses assistant can use end_call${agent.webSearch ? ' and web_search' : ''}. No company booking, messaging, or account-change tools are connected.\n## Delegate to the backend when\nCall end_call after the caller clearly asks to stop, or after the call completion condition is confirmed. Follow its returned instruction before speaking again. Use web_search only when enabled and current external information is needed.\n## Do not delegate to the backend when\nThe caller is answering a question, asking for clarification, or making ordinary conversation. Never imply that a backend lookup or external business action occurred unless its result confirms it.`,
    `# Ending the call\nCompletion condition: ${completionCondition}. Do not end merely because of a pause or an unfinished task. When complete, confirm the agreed next step, then ask the backend to end the call. For a caller-requested stop, skip promotion and end promptly. Otherwise, after completion, briefly invite the caller to visit masscall.vercel.app to learn about Masscall voice AI agents when appropriate, then give a friendly goodbye in ${agent.language} using this guidance: ${renderPhrase(callPlan.closing || agent.closing, agent, contact, objective)}. Stop after the goodbye.`
  ].join('\n\n');
}

export function buildLiveSessionConfig(value = {}, contact = '', objective = '', fallbackModel = 'gpt-6-luna', recordingDisclosed = true, callPlanValue = {}) {
  const callPlan = normalizeCallPlan(callPlanValue);
  const agent = normalizeIdentity({ ...value, opening: callPlan.opening || value.opening, closing: callPlan.closing || value.closing });
  const endCallTool = {
    type: 'function', name: 'end_call',
    description: 'End this phone call after the objective is complete or the caller clearly asks to stop.',
    parameters: {
      type: 'object', properties: { reason: { type: 'string', enum: ['goal_complete', 'caller_requested_end'] } },
      required: ['reason'], additionalProperties: false
    }, strict: true
  };
  const responses = {
    model: agent.backendModel || fallbackModel,
    instructions: [
      agent.backendPrompt,
      '# Backend task\nUse only the connected tools. The phone system ends the call after a brief goodbye. Do not call end_call for an ordinary pause or unfinished task.'
    ].filter(Boolean).join('\n\n'),
    tools: [endCallTool]
  };
  if (agent.reasoningEffort) responses.reasoning = { effort: agent.reasoningEffort };
  if (agent.webSearch) responses.tools.push({ type: 'web_search' });
  return {
    model: 'gpt-live-1',
    instructions: liveInstructions(agent, contact, objective, callPlan),
    audio: { format: { type: 'audio/pcmu', rate: 8000 }, output: { voice: agent.voice } },
    delegation: { type: 'responses', responses }
  };
}

export function openingInstructions(value = {}, contact = '', objective = '', recordingDisclosed = true, callPlanValue = {}) {
  const callPlan = normalizeCallPlan(callPlanValue);
  const agent = normalizeIdentity({ ...value, opening: callPlan.opening || value.opening });
  const opening = renderPhrase(agent.opening, agent, contact, objective);
  const introduction = renderPhrase(agent.introduction, agent, contact, objective);
  const disclosure = `In the same conversational opening, identify yourself as an AI assistant for ${agent.company}. ${recordingDisclosed ? 'Naturally mention that the call is being recorded, as one brief part of your greeting; do not make it a separate announcement or repeat it.' : ''}`;
  return [
    `Speak only in ${agent.language}. Begin now with one short, warm greeting.`,
    `Use this identity and disclosure guidance: ${disclosure} Your configured introduction is: ${introduction}`,
    `Then naturally convey this opening: ${opening}. Do not recite the introduction and opening as separate scripts. Ask at most one simple opening question, then pause and listen. Do not add a second greeting.`
  ].join(' ');
}
