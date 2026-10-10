import {normalizeIdentity,dedupePhoneNumbers} from './identity.js';
import {callStarters} from './call-starters.js';
import {callStatusLabels,terminalCallStatuses} from './call-flow.js';

export function enableWorkspaceTest(){
 const $=selector=>document.querySelector(selector),form=$('#workspace-test');
 $('#demo-form').hidden=true;form.hidden=false;
 $('#demo-badge').innerHTML='<i aria-hidden="true"></i> TEST PRIVAT';
 $('.card-intro').textContent='Primește un apel de la Andreea, agentul AI al lui Vico. Numărul de apelare și conversația sunt deja pregătite.';
 $('.card-foot span').textContent='Testează direct aici · setări complete în centrul de apeluri';
 let token='',sid='',timer,busy=false;
 const message=text=>{$('#demo-message').textContent=text};
 async function request(action,body){
  const response=await fetch('/api/telephony?action='+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json();
  if(!response.ok){const errors={401:'Codul de acces este invalid. Folosește codul centrului de apeluri.',403:'Apelurile nu sunt activate pentru acest spațiu de lucru.',503:'Serviciul vocal pornește sau este indisponibil. Încearcă din nou peste un minut.',502:'Furnizorul de telefonie nu a putut procesa cererea. Verifică setările contului în centrul de apeluri.'};throw new Error(errors[response.status]||'Cererea nu a reușit. Verifică numărul și setările din centrul de apeluri.')}
  return data;
 }
 function showStatus(status){
  $('#workspace-call-title').textContent=callStatusLabels[status]||'Verificăm apelul';
  if(terminalCallStatuses.has(status)){
   clearTimeout(timer);busy=false;
   $('#workspace-hangup').hidden=true;$('#workspace-retry').hidden=false;
   $('#workspace-call-detail').textContent=status==='completed'?'Cum ți s-a părut? Poți testa din nou sau deschide centrul de apeluri pentru setări.':'Apelul s-a încheiat. Verifică numărul și încearcă din nou.';
  }
 }
 async function poll(){
  try{const data=await request('call-status&call='+encodeURIComponent(sid));showStatus(data.status);message('')}
  catch{message('Nu am putut actualiza starea. Verificăm din nou…')}
  if(busy)timer=setTimeout(poll,3000);
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const raw=$('#test-phone').value.replace(/[\s()-]/g,''),to=/^07\d{8}$/.test(raw)?'+4'+raw:/^7\d{8}$/.test(raw)?'+40'+raw:raw;
  if(!/^\+[1-9]\d{7,14}$/.test(to)){message('Introdu numărul cu prefix internațional, de exemplu +407xxxxxxxx.');return}
  if(!$('#test-consent').checked){message('Confirmă acordul pentru apel și înregistrare.');return}
  busy=true;token=$('#test-token').value.trim();form.querySelector('button').disabled=true;message('Pregătim agentul și numărul de apelare…');
  try{
   const numbers=dedupePhoneNumbers((await request('numbers')).incoming_phone_numbers||[]);
   if(!numbers.length)throw new Error('Adaugă un număr în centrul de apeluri înainte de primul test.');
   const template=callStarters.find(item=>item.id==='test-conversation');
   const data=await request('call',{from:numbers[0].phone_number,to,objective:template.objective,agent:normalizeIdentity(),callPlan:{...template,templateName:template.name},consent:true,recordingConsent:true});
   sid=data.sid;form.hidden=true;$('#workspace-call').hidden=false;$('#workspace-hangup').hidden=false;$('#workspace-retry').hidden=true;
   $('#workspace-call-detail').textContent='Răspunde la apelul de la '+numbers[0].phone_number+'. Poți întrerupe agentul și vorbi natural.';
   message('');showStatus(data.status);if(busy)timer=setTimeout(poll,1000);
  }catch(error){busy=false;message(error.message)}
  finally{form.querySelector('button').disabled=false}
 });
 $('#workspace-hangup').onclick=async()=>{
  const button=$('#workspace-hangup');button.disabled=true;
  try{const result=await request('hangup',{call:sid});showStatus(result.status);message('')}
  catch(error){message(error.message)}finally{button.disabled=false}
 };
 $('#workspace-retry').onclick=()=>{$('#workspace-call').hidden=true;form.hidden=false;message('');$('#test-phone').focus()};
 window.addEventListener('pagehide',()=>clearTimeout(timer));
}
