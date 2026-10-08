import {callStarters} from './call-starters.js';
import {normalizeIdentity} from './identity.js';
export const callStatusLabels={queued:'Apel în așteptare',initiated:'Se inițiază apelul',ringing:'Telefonul sună', 'in-progress':'Apel conectat',completed:'Apel încheiat',busy:'Linia este ocupată','no-answer':'Nu s-a răspuns',canceled:'Apel anulat',failed:'Apel eșuat'};
export const terminalCallStatuses=new Set(['completed','busy','no-answer','canceled','failed']);
export function resolveCallTemplate(key,saved=[]){
 if(key?.startsWith('starter:'))return callStarters.find(t=>t.id===key.slice(8));
 if(key?.startsWith('saved:'))return saved.find(t=>t.id===key.slice(6));
}
export function prepareTestCall(data,{saved=[],agent={},simple=true}={}){
 const template=resolveCallTemplate(data.callTemplate,saved);
 if(simple&&!template)throw new Error('Alege un șablon pentru apel.');
 const objective=String(data.objective||'').trim();
 if(!objective)throw new Error('Scrie obiectivul apelului.');
 if(![true,'on'].includes(data.consent)||![true,'on'].includes(data.recordingConsent))throw new Error('Confirmă acordul pentru apel și înregistrare.');
 const to=String(data.to||'').replace(/[\s()-]/g,'');
 if(!/^\+[1-9]\d{7,14}$/.test(to))throw new Error('Introdu numărul cu prefix internațional, de exemplu +407xxxxxxxx.');
 const callAgent=normalizeIdentity({...agent,name:data.callAgentName||agent.name,role:data.callAgentRole||agent.role,voice:data.callVoice||agent.voice,backendModel:data.callBackendModel||agent.backendModel,reasoningEffort:data.callReasoningEffort??agent.reasoningEffort,webSearch:data.callWebSearch===undefined?agent.webSearch:data.callWebSearch==='true',addressMode:data.callAddressMode||agent.addressMode,addressInstructions:data.callAddressInstructions??agent.addressInstructions,introduction:data.callIntroduction??agent.introduction,instructions:data.callInstructions??agent.instructions,backendPrompt:data.callBackendPrompt??agent.backendPrompt,company:'Vico',language:'Romanian'});
 return {...data,to,objective,engine:simple?'bridge':data.engine,agent:callAgent,consent:true,recordingConsent:true,
 callPlan:{category:data.personCategory||template?.category||'',company:data.personCompany,role:data.personRole,personNotes:data.personNotes,templateName:template?.name||data.starterName||'',opening:data.opening,talkingPoints:data.talkingPoints,closing:data.closing,completionTrigger:data.completionTrigger||'Obiectivul a fost îndeplinit sau persoana cere încheierea apelului.',branches:template?.branches||[]}};
}
