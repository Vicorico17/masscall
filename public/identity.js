// Shared identity contract for the editor, call snapshots, and voice bridge.
export const identityDefaults = {
  label: 'Recepție', name: 'Andreea', company: 'Vico', language: 'Romanian',
  voice: 'marin', role: 'Customer care', addressMode: 'formal',
  goal: 'Confirmă programarea și află dacă ora este potrivită.',
  addressInstructions: 'Folosește un ton politicos. Nu presupune genul sau titlul persoanei.',
  introduction: 'Sunt {agent_name}, agentul AI al lui {company_name}.',
  opening: 'Bună ziua! Aveți un moment pentru o scurtă discuție?',
  closing: 'Vă mulțumesc pentru timpul acordat. Vă doresc o zi frumoasă!',
  instructions: 'Vorbește natural și concis. Pune câte o întrebare, apoi ascultă răspunsul. Confirmă următorul pas. Nu pretinde că ai făcut programări sau modificări fără un instrument conectat.',
  backendModel: 'gpt-6-luna', backendPrompt: 'Help the voice assistant with the stated call objective. Use web search only when enabled. No company functions are connected; do not claim that you completed external actions.',
  reasoningEffort: '', webSearch: false
};
export const supportedLanguages = [
  {name:'English',native:'English',region:'United States',flag:'🇺🇸',locale:'en-US',voice:'Polly.Joanna',recorded:'I’m one of Vico’s AI assistants, and this call is being recorded.',unrecorded:'I’m one of Vico’s AI assistants.'},
  {name:'Romanian',native:'Română',region:'Romania',flag:'🇷🇴',locale:'ro-RO',voice:'Polly.Carmen',recorded:'Sunt unul dintre asistenții AI ai lui Vico, iar acest apel este înregistrat.',unrecorded:'Sunt unul dintre asistenții AI ai lui Vico.'},
  {name:'Italian',native:'Italiano',region:'Italy',flag:'🇮🇹',locale:'it-IT',voice:'Polly.Bianca',recorded:'Sono uno degli assistenti AI di Vico e questa chiamata viene registrata.',unrecorded:'Sono uno degli assistenti AI di Vico.'},
  {name:'Spanish',native:'Español',region:'Spain',flag:'🇪🇸',locale:'es-ES',voice:'Polly.Conchita',recorded:'Soy uno de los asistentes de IA de Vico y esta llamada está siendo grabada.',unrecorded:'Soy uno de los asistentes de IA de Vico.'},
  {name:'French',native:'Français',region:'France',flag:'🇫🇷',locale:'fr-FR',voice:'Polly.Celine',recorded:'Je suis l’un des assistants IA de Vico et cet appel est enregistré.',unrecorded:'Je suis l’un des assistants IA de Vico.'},
  {name:'German',native:'Deutsch',region:'Germany',flag:'🇩🇪',locale:'de-DE',voice:'Polly.Vicki',recorded:'Ich bin einer der KI-Assistenten von Vico und dieses Gespräch wird aufgezeichnet.',unrecorded:'Ich bin einer der KI-Assistenten von Vico.'},
  {name:'Portuguese',native:'Português',region:'Portugal',flag:'🇵🇹',locale:'pt-PT',voice:'Polly.Ines',recorded:'Sou um dos assistentes de IA da Vico e esta chamada está a ser gravada.',unrecorded:'Sou um dos assistentes de IA da Vico.'},
  {name:'Dutch',native:'Nederlands',region:'Netherlands',flag:'🇳🇱',locale:'nl-NL',voice:'Polly.Lotte',recorded:'Ik ben een van Vico’s AI-assistenten en dit gesprek wordt opgenomen.',unrecorded:'Ik ben een van Vico’s AI-assistenten.'},
  {name:'Polish',native:'Polski',region:'Poland',flag:'🇵🇱',locale:'pl-PL',voice:'Polly.Ewa',recorded:'Jestem jednym z asystentów AI Vico, a ta rozmowa jest nagrywana.',unrecorded:'Jestem jednym z asystentów AI Vico.'},
  {name:'Turkish',native:'Türkçe',region:'Turkey',flag:'🇹🇷',locale:'tr-TR',voice:'Polly.Filiz',recorded:'Vico’nun yapay zekâ asistanlarından biriyim ve bu görüşme kaydediliyor.',unrecorded:'Vico’nun yapay zekâ asistanlarından biriyim.'}
];
export function languageDetails(value='Romanian') { return supportedLanguages.find(language=>language.name.toLowerCase()===String(value).trim().toLowerCase())||supportedLanguages[1]; }
export function languagePolicy(value='Romanian') { const language=languageDetails(value);return `Speak only in ${language.name} throughout the call. Keep every greeting, response, and closing in ${language.name}. If saved examples or instructions use another language, convey their meaning in ${language.name} instead of repeating their original wording. Do not switch languages, even if the caller does.`; }
export function languageOptions(value='Romanian',id='language') {return `<select id="${id}" name="language" class="language-select"><option value="Romanian">🇷🇴 Română</option></select><small class="language-promise" id="${id}-policy">Agentul vorbește în română pe tot parcursul apelului.</small>`;}

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
  result.language=languageDetails(result.language).name;
  if (!['formal','first-name','full-name','custom'].includes(result.addressMode)) result.addressMode='formal';
  if (!['marin','cedar','quartz','ripple','vesper','willow','stone','gleam'].includes(result.voice)) result.voice='marin';
  // Move existing workspaces off the previous default, including any legacy Terra setting.
  if (['gpt-5.6-luna','gpt-5.6-terra'].includes(result.backendModel)) result.backendModel='gpt-6-luna';
  if (!['gpt-6-luna','gpt-6-sol','gpt-5.6-sol'].includes(result.backendModel)) result.backendModel='gpt-6-luna';
  if (!['','low','medium','high'].includes(result.reasoningEffort)) result.reasoningEffort='';
  result.webSearch=value.webSearch===true||value.webSearch==='true';
  return result;
}
export function vicoIntroduction(value = {}) {
  const agent=normalizeIdentity(value);
  const intros={
    English:`I'm ${agent.name}, Vico's AI agent.`,
    Romanian:`Sunt ${agent.name}, agentul AI al lui Vico.`,
    Italian:`Sono ${agent.name}, l'agente IA di Vico.`,
    Spanish:`Soy ${agent.name}, el agente de IA de Vico.`,
    French:`Je suis ${agent.name}, l’agent IA de Vico.`,
    German:`Ich bin ${agent.name}, Vicos KI-Agent.`,
    Portuguese:`Sou ${agent.name}, agente de IA da Vico.`,
    Dutch:`Ik ben ${agent.name}, de AI-agent van Vico.`,
    Polish:`Jestem ${agent.name}, agentem AI Vico.`,
    Turkish:`Ben ${agent.name}, Vico'nun yapay zekâ asistanıyım.`
  };
  return intros[agent.language]||intros.English;
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
    `The structured identity, ${disclosureAlreadySpoken?'opening, addressing and closing':'introduction, opening, addressing and closing'} fields take precedence over conflicting identity details in additional company guidance. ${disclosureAlreadySpoken?'The opening identifies you as an AI assistant; do not claim to be human or repeat that introduction.':'Always identify yourself as an AI assistant; do not claim to be a human, and add an AI disclosure if an example lacks one.'} ${languagePolicy(a.language)} Do not speak unresolved template placeholders. Adapt missing-name phrases naturally. If asked to stop, acknowledge politely and stop pursuing the objective. No business-action tools are connected; never invent completed bookings or updates.`
  ].join('\n');
}
