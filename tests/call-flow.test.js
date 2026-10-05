import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareTestCall,resolveCallTemplate,terminalCallStatuses} from '../public/call-flow.js';
const data={callTemplate:'starter:test-conversation',objective:'  Întreabă dacă vocea se aude clar.  ',to:'+40 (735) 555-123',from:'+40210000104',consent:'on',recordingConsent:'on',engine:'livekit'};
test('simple call preserves the edited goal and normalizes the dialed number and Romanian identity',()=>{
 const result=prepareTestCall(data,{agent:{company:'Studio',language:'Italian',name:'Elena'}});
 assert.equal(result.objective,'Întreabă dacă vocea se aude clar.');assert.equal(result.to,'+40735555123');assert.equal(result.engine,'bridge');assert.equal(result.agent.language,'Romanian');assert.equal(result.agent.company,'Vico');assert.equal(result.agent.name,'Elena');assert.equal(result.callPlan.templateName,'Test rapid de conversație');
});
test('saved template IDs keep branches intact even when names collide',()=>{
 const saved=[{id:'one',name:'Test',branches:[{when:'Da',then:'Confirmă'}]},{id:'two',name:'Test',branches:[]}];
 const result=prepareTestCall({...data,callTemplate:'saved:one'},{saved});assert.deepEqual(result.callPlan.branches,saved[0].branches);assert.equal(resolveCallTemplate('saved:two',saved),saved[1]);
});
test('missing template, empty goal, invalid number and unconfirmed consent cannot dial',()=>{
 for(const change of [{callTemplate:''},{objective:' '},{to:'0735555123'},{consent:false},{consent:'false'},{recordingConsent:undefined}])assert.throws(()=>prepareTestCall({...data,...change}));
 const result=prepareTestCall({...data,callTemplate:'custom'},{simple:false});assert.equal(result.engine,'livekit');
});
test('only terminal provider states release the call lock',()=>{
 for(const status of ['queued','ringing','in-progress'])assert.equal(terminalCallStatuses.has(status),false);
 for(const status of ['completed','failed','no-answer','busy','canceled'])assert.equal(terminalCallStatuses.has(status),true);
});
