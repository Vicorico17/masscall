export function experienceMode(){
 try{const mode=localStorage.getItem('masscall-experience');return ['personal','business'].includes(mode)?mode:null}catch{return null}
}
export function setExperienceMode(mode){try{localStorage.setItem('masscall-experience',mode)}catch{}}
export function experienceChoice(){return `<div class="experience-intro"><span class="experience-kicker">BUN VENIT ÎN MASSCALL</span><h1>Mai puțin timp la telefon.<br>Mai mult timp pentru tine.</h1><p>Cu ce vrei să te ajutăm? Poți schimba experiența oricând.</p></div><div class="experience-choices"><button class="experience-choice" data-mode="personal"><span class="experience-symbol" aria-hidden="true">↗</span><span class="experience-kicker">PENTRU MINE</span><strong>O treabă de rezolvat.<br>Un apel mai puțin.</strong><span>Întreabă despre un produs, verifică o programare sau află detalii de la un furnizor.</span><b>Ajută-mă cu un apel →</b></button><button class="experience-choice business" data-mode="business"><span class="experience-symbol" aria-hidden="true">◎</span><span class="experience-kicker">PENTRU AFACERE</span><strong>Conversații bune.<br>Clienți mai aproape.</strong><span>Confirmă programări, revino către clienți și organizează apelurile recurente.</span><b>Organizează apelurile →</b></button></div><p class="experience-footnote">Aceeași conexiune pentru apeluri și același istoric. Alegerea personalizează meniul și sugestiile.</p>`}
function readProgress(mode){try{return JSON.parse(localStorage.getItem('masscall-onboarding-'+mode)||'{}')||{}}catch{return {}}}
function writeProgress(mode,value){try{localStorage.setItem('masscall-onboarding-'+mode,JSON.stringify(value))}catch{}}
const labels={completed:'Apel încheiat',failed:'Apel eșuat',busy:'Linie ocupată','no-answer':'Fără răspuns',canceled:'Anulat',queued:'În așteptare',ringing:'Telefonul sună','in-progress':'Conectat'};
export function mountExperience({calls,metadata,reviews,people,campaigns,escape:esc,start,open}){
 let mode=experienceMode();
 const host=document.createElement('section');host.id='experience-home';host.className='experience-home';
 document.querySelector('.live-workspace-content').prepend(host);
 const menu=document.querySelector('.live-workspace-menu');
 const home=document.createElement('button');home.type='button';home.dataset.panel='home';home.setAttribute('aria-controls',host.id);home.innerHTML='<span aria-hidden="true">⌂</span><span>Acasă</span>';menu.prepend(home);home.onclick=()=>{draw();open('home')};
 const switcher=document.createElement('button');switcher.type='button';switcher.className='experience-switch';menu.before(switcher);
 switcher.onclick=()=>{mode=null;draw();open('home')};
 const taskSets={personal:[['availability','Disponibilitate și preț','Află dacă un serviciu sau produs este disponibil.','01'],['personal-appointment','Detalii despre o programare','Verifică orele disponibile și pașii necesari.','02'],['listing','Întrebări despre un anunț','Cere detaliile care lipsesc înainte să decizi.','03']],business:[['appointment-confirmation','Confirmă programări','Verifică participarea și cererile de modificare.','01'],['customer-follow-up','Revino către clienți','Află ce mai au nevoie și ce urmează.','02'],['service-feedback','Colectează feedback','Ascultă experiența clienților tăi.','03']]};
 function choose(value){mode=value;setExperienceMode(mode);draw();open('home')}
 function begin(id){writeProgress(mode,{...readProgress(mode),task:id});start(id)}
 function draw(){
  document.body.dataset.experience=mode||'choose';switcher.textContent=mode==='business'?'Pentru afacere ⇄':mode==='personal'?'Pentru mine ⇄':'Alege experiența ⇄';
  for(const button of menu.querySelectorAll('[data-panel]'))button.hidden=mode==='personal'&&['campaigns','templates','agent','numbers'].includes(button.dataset.panel);
  const personalIds=['availability','personal-appointment','listing'];
  document.querySelectorAll('[data-template-card]').forEach(card=>{const id=card.dataset.templateCard.slice(8);card.hidden=mode==='personal'?!personalIds.includes(id)&&id!=='test-conversation':mode==='business'&&personalIds.includes(id)});
  if(!mode){host.innerHTML=experienceChoice();host.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>choose(b.dataset.mode));return}
  const personal=mode==='personal',recent=calls.slice(0,5),needsReview=calls.filter(c=>c.status==='completed'&&!reviews[c.sid]?.result).length;
  host.innerHTML=`<div class="experience-intro"><span class="experience-kicker">${personal?'ASISTENTUL TĂU PENTRU APELURI':'SPAȚIUL TĂU DE LUCRU'}</span><h1>${personal?'Ce rezolvăm astăzi?':'Fiecare conversație are un pas următor.'}</h1><p>${personal?'Tu spui ce ai nevoie. Asistentul întreabă, iar tu decizi ce urmează.':'Pregătește un apel, testează conversația și urmărește rezultatele.'}</p><button class="btn primary" id="experience-new">${personal?'Pregătește un apel':'Pregătește primul apel'} <span aria-hidden="true">↗</span></button></div>${!personal?`<div class="experience-metrics"><button data-open="logs"><strong>${needsReview}</strong><span>Apeluri de verificat</span></button><button data-open="people"><strong>${people.length}</strong><span>Contacte salvate</span></button><button data-open="campaigns"><strong>${campaigns.filter(c=>['scheduled','running'].includes(c.status)).length}</strong><span>Campanii active</span></button></div>`:''}<div class="experience-section-title"><h2>${personal?'Începe cu o idee':'Alege un flux de lucru'}</h2><span>Pregătit pentru detaliile tale</span></div><div class="experience-tasks">${taskSets[mode].map(([id,title,description,num])=>`<button class="experience-task" data-task="${id}"><span class="experience-task-number">${num} <span>↗</span></span><strong>${title}</strong><span>${description}</span></button>`).join('')}</div>${!personal?`<div class="experience-next"><div><h2>De la un apel la o rutină.</h2><p>Testează întâi pe numărul tău. Apoi salvează contactele și programează apelurile.</p></div><div class="actions"><button class="btn" data-task="test-conversation">Testează agentul</button><button class="btn" data-open="people">Adaugă contacte</button></div></div>`:''}<section class="experience-recent"><div class="experience-section-title"><h2>${personal?'Apelurile tale recente':'Ultimele apeluri'}</h2><button class="btn ghost" data-open="logs">Vezi toate →</button></div>${recent.length?recent.map(c=>`<button class="experience-call" data-call="${esc(c.sid)}"><span><strong>${esc(metadata[c.sid]?.contact||c.to)}</strong><small>${esc(metadata[c.sid]?.objective||'Detaliile apelului sunt disponibile în istoric.')}</small></span><span class="tag">${esc(labels[c.status]||c.status)}</span></button>`).join(''):'<div class="experience-empty"><strong>Primul rezultat începe cu un apel.</strong><p>Aici vei găsi apelurile reale și înregistrările lor.</p></div>'}<p class="experience-footnote">„Apel încheiat” descrie conexiunea telefonică. Verifică înregistrarea și notează rezultatul; nu generăm automat un rezumat al conversației.</p></section>`;
  const progress=readProgress(mode);
  const ownCalls=calls.filter(call=>metadata[call.sid]?.experience===mode);
  const connected=ownCalls.some(call=>call.status==='completed'&&Number(call.duration)>0);
  const reviewed=ownCalls.some(call=>call.status==='completed'&&Number(call.duration)>0&&reviews[call.sid]?.result);
  const done=[Boolean(progress.task),connected,reviewed];
  const guide=document.createElement('section');guide.className='onboarding-guide';guide.setAttribute('aria-label','Ghid de început');
  guide.innerHTML=progress.dismissed?'<button class="btn ghost" data-guide-show>Reia ghidul de început →</button>':`<div class="experience-section-title"><div><span class="experience-kicker">PRIMII PAȘI · ${done.filter(Boolean).length} DIN 3</span><h2>${personal?'Primul apel, pas cu pas.':'Testează înainte să apelezi clienții.'}</h2></div><button class="btn ghost" data-guide-dismiss>Mai târziu</button></div><ol class="onboarding-steps">${[
   ['Alege ce vrei să afli',personal?'Pornește de la o idee de mai jos și adaugă întrebările tale.':'Alege un flux de lucru. Pentru primul test, folosește numărul tău.','Alege un obiectiv','task'],
   ['Testează un apel','Completează numărul și verifică identitatea AI, mesajul și acordurile înainte de confirmare.',progress.task?'Continuă pregătirea':'Pregătește testul','call'],
   ['Ascultă și notează rezultatul','După apel, deschide înregistrarea din istoric și salvează rezultatul observat.','Deschide istoricul','logs']
  ].map(([title,description,action,target],i)=>`<li class="${done[i]?'is-done':''}"><span class="onboarding-step-number" aria-label="${done[i]?'Finalizat':'Pasul '+(i+1)}">${done[i]?'✓':i+1}</span><div><h3>${title}</h3><p>${description}</p><button class="btn ghost" data-guide-target="${target}">${action} →</button></div></li>`).join('')}</ol><p class="experience-footnote">Progresul și preferințele se păstrează în acest browser. Codul de acces trebuie introdus din nou după închiderea paginii. Un apel fără răspuns sau eșuat nu finalizează testul.</p>`;
  host.querySelector('.experience-intro').after(guide);
  guide.querySelector('[data-guide-dismiss]')?.addEventListener('click',()=>{writeProgress(mode,{...progress,dismissed:true});draw()});
  guide.querySelector('[data-guide-show]')?.addEventListener('click',()=>{writeProgress(mode,{...progress,dismissed:false});draw()});
  guide.querySelectorAll('[data-guide-target]').forEach(button=>button.onclick=()=>{
   const target=button.dataset.guideTarget;
   if(target==='task'){const first=host.querySelector('[data-task]');first.scrollIntoView({block:'center'});first.focus()}
   else if(target==='logs')open('logs');
   else if(progress.task){if(!document.querySelector('#call-template').value)start(progress.task);else open('call');document.querySelector('#real-to').focus()}
   else begin('test-conversation');
  });
  host.querySelector('#experience-new').onclick=()=>begin(personal?'availability':'appointment-confirmation');
  host.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>begin(b.dataset.task));host.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>open(b.dataset.open));host.querySelectorAll('[data-call]').forEach(b=>b.onclick=()=>open('logs'));
 }
 draw();return {refresh:draw};
}
