import test from 'node:test';
import assert from 'node:assert/strict';
import {callPlanInstructions,normalizeCallPlan} from '../lib/call-plan.js';

test('call plans sanitize person context and describe concrete end-of-call criteria',()=>{
 const plan=normalizeCallPlan({category:'Dental clinics',company:'Smile Studio',role:'Office manager',personNotes:'Asked about weekday appointments.',templateName:'New patient inquiry',opening:'Ask for Ana by name.',talkingPoints:'Check which days work.',closing:'Thank her and confirm next steps.',completionTrigger:'She selects a date or says she does not want an appointment.',personNotes:'x'.repeat(1200)});
 assert.equal(plan.personNotes.length,1000);
 const prompt=callPlanInstructions(plan);
 for(const phrase of ['Target category: Dental clinics','Person\'s company: Smile Studio','Call template: New patient inquiry','Opening guidance: Ask for Ana by name.','Conversation focus: Check which days work.','Closing guidance: Thank her and confirm next steps.','only when this condition is met: She selects a date'])assert.ok(prompt.includes(phrase),phrase);
});
test('call plans bound conditional conversation branches and include them in agent instructions',()=>{
 const plan=normalizeCallPlan({branches:[{when:'They ask how pricing works.',then:'Explain the published plan and ask which features matter.'},{when:'They decline any more calls.',then:'Acknowledge the request and end politely.'},{when:'Incomplete branch',then:''},...Array.from({length:8},(_,i)=>({when:'Condition '+i,then:'Action '+i}))]});
 assert.equal(plan.branches.length,6);assert.equal(plan.branches[0].when,'They ask how pricing works.');assert.ok(plan.branches[0].then.length<=500);
 const prompt=callPlanInstructions(plan);assert.match(prompt,/If They ask how pricing works\.: Explain the published plan/);assert.match(prompt,/return to the main call objective/);assert.doesNotMatch(prompt,/Incomplete branch/);
});
