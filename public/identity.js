// Shared identity contract for the editor, call snapshots, and voice bridge.
export const identityDefaults = {
  label: 'Recepție', name: 'Andreea', company: 'Studio România', language: 'Romanian',
  voice: 'marin', role: 'Customer care', addressMode: 'formal',
  goal: 'Confirmă programarea și află dacă ora este potrivită.',
  addressInstructions: 'Folosește un ton politicos. Nu presupune genul sau titlul persoanei.',
  introduction: 'Sunt {agent_name}, asistentul AI al companiei {company_name}.',
  opening: 'Bună ziua! Vorbesc cu {full_name}? Aveți un moment pentru o scurtă discuție?',
  closing: 'Vă mulțumesc pentru timpul acordat. Vă doresc o zi frumoasă!',
  instructions: 'Vorbește natural și politicos. Explică scopul apelului și ascultă cu atenție. Confirmă următorul pas. Nu pretinde că ai făcut programări sau modificări fără un instrument conectat.',
  backendModel: 'gpt-5.6-luna', backendPrompt: 'Help the voice assistant with the stated call objective. Use web search only when enabled. No company functions are connected; do not claim that you completed external actions.',
  reasoningEffort: '', webSearch: false
};
export const numberKey = number => '+' + String(number || '').replace(/\D/g, '');
export function dedupePhoneNumbers(numbers = []) {
  const unique = new Map();
  for (const number of numbers) {
    const key = numberKey(number?.phone_number);
    if (key !== '+' && !unique.has(key)) unique.set(key, number);
  }
  return [...unique.values()];
}
export function normalizeIdentity(value = {}) {
  const limits = { label:80,name:40,company:80,language:30,voice:30,role:80,goal:1000,addressMode:20,addressInstructions:500,introduction:600,opening:600,closing:600,instructions:6000,backendModel:50,backendPrompt:6000,reasoningEffort:20 };
  const result = {};
  for (const [key,max] of Object.entries(limits)) result[key] = String(value[key] ?? identityDefaults[key]).trim().slice(0,max);
  if (!['formal','first-name','full-name','custom'].includes(result.addressMode)) result.addressMode='formal';
  if (!['marin','cedar','quartz','ripple','vesper','willow','stone','gleam'].includes(result.voice)) result.voice='marin';
  if (!['gpt-5.6-luna','gpt-5.6-sol','gpt-6-luna','gpt-6-sol'].includes(result.backendModel)) result.backendModel='gpt-5.6-luna';
  if (!['','low','medium','high'].includes(result.reasoningEffort)) result.reasoningEffort='';
  result.webSearch=value.webSearch===true||value.webSearch==='true';
  return result;
}
export function renderPhrase(phrase, identity, contact='', objective='') {
  const values={agent_name:identity.name,company_name:identity.company,first_name:contact.trim().split(/\s+/)[0]||'',full_name:contact.trim(),objective};
  return String(phrase).replace(/\{(agent_name|company_name|first_name|full_name|objective)\}/g,(_,key)=>values[key]);
}
export function buildIdentityPrompt(value, contact='', objective='', {disclosureAlreadySpoken=false,recordingDisclosed=true}={}) {
  const a=normalizeIdentity(value);
  const addressing={formal:'Use polite formal address (dumneavoastră in Romanian).','first-name':'Address the recipient by their given name, using a friendly tone.','full-name':'Use the provided full name and a professional tone. Do not infer gender or honorifics.',custom:'Follow the custom recipient-address instructions below.'};
  return [
    `Identity: ${a.name}, an AI assistant representing ${a.company}. Role: ${a.role}. Speak ${a.language}.`,
    `Recipient: ${contact || 'Name unknown; ask politely rather than inventing a name.'}`,
    `Agent's standing goal: ${a.goal}`,
    `Addressing: ${addressing[a.addressMode]} ${a.addressInstructions}`,
    disclosureAlreadySpoken
      ? `The call already began with a clear AI identity disclosure${recordingDisclosed?' and recording disclosure':''}. Do not repeat those disclosures or give another full self-introduction.`
      : `At the start, introduce yourself using: ${renderPhrase(a.introduction,a,contact,objective)}`,
    `Then open the conversation with: ${renderPhrase(a.opening,a,contact,objective)}`,
    `Call objective: ${objective}`,
    `At a natural end, confirm only verified next steps, then close with: ${renderPhrase(a.closing,a,contact,objective)}`,
    `Additional company guidance: ${a.instructions}`,
    `The structured identity, ${disclosureAlreadySpoken?'opening, addressing and closing':'introduction, opening, addressing and closing'} fields take precedence over conflicting identity details in additional company guidance. ${disclosureAlreadySpoken?'The opening identifies you as an AI assistant; do not claim to be human or repeat that introduction.':'Always identify yourself as an AI assistant; do not claim to be a human, and add an AI disclosure if an example lacks one.'} Do not speak unresolved template placeholders. Adapt missing-name phrases naturally. If asked to stop, acknowledge politely and stop pursuing the objective. No business-action tools are connected; never invent completed bookings or updates.`
  ].join('\n');
}
