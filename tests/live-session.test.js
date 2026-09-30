import test from 'node:test';
import assert from 'node:assert/strict';
import {buildLiveSessionConfig,openingInstructions} from '../lib/live-session.js';

test('GPT-Live session applies the selected voice, Responses model, reasoning and web search',()=>{
 const session=buildLiveSessionConfig({name:'Andreea',company:'Masscall',voice:'gleam',backendModel:'gpt-6-luna',reasoningEffort:'medium',webSearch:true,backendPrompt:'Research current opening hours.'},'Ioana','Confirm appointment');
 assert.equal(session.model,'gpt-live-1');
 assert.equal(session.audio.output.voice,'gleam');
 assert.equal(session.delegation.type,'responses');
 assert.equal(session.delegation.responses.model,'gpt-6-luna');
 assert.deepEqual(session.delegation.responses.reasoning,{effort:'medium'});
 assert.deepEqual(session.delegation.responses.tools,[{type:'function',name:'end_call',description:'End this phone call after the objective has been completed or the caller clearly asks to stop.',parameters:{type:'object',properties:{reason:{type:'string',enum:['goal_complete','caller_requested_end']}},required:['reason'],additionalProperties:false},strict:true},{type:'web_search'}]);
 assert.match(session.delegation.responses.instructions,/Research current opening hours\./);
 assert.match(session.delegation.responses.instructions,/use the end_call function only when the caller clearly asks to stop or the call completion condition is met/);
 assert.match(session.instructions,/invoke end_call promptly/);
});

test('GPT-Live omits optional reasoning and web search unless selected but always provides call control',()=>{
 const session=buildLiveSessionConfig({voice:'marin',webSearch:false});
 assert.equal(session.model,'gpt-live-1');
 assert.equal(session.audio.output.voice,'marin');
 assert.equal('reasoning' in session.delegation.responses,false);
 assert.deepEqual(session.delegation.responses.tools.map(tool=>tool.name),['end_call']);
});

test('opening instruction resolves agent and contact placeholders without repeating the disclosure',()=>{
 const prompt=openingInstructions({name:'Mihai',company:'Firma B',language:'Romanian',introduction:'Sunt {agent_name}, asistent AI la {company_name}.',opening:'Bună ziua, {first_name}!',closing:'La revedere!'},'Ioana Ionescu','Confirmă programarea');
 assert.ok(!prompt.includes('Sunt Mihai, asistent AI la Firma B.'));
 assert.ok(prompt.includes('Bună ziua, Ioana!'));
 assert.ok(!prompt.includes('{first_name}'));
 assert.ok(prompt.includes('Do not repeat those disclosures'));
});

test('live call language instruction covers the configured goodbye too',()=>{
 const session=buildLiveSessionConfig({language:'Italian',closing:'Goodbye for now!'});
 assert.match(session.instructions,/Speak only in Italian throughout the call/);
 assert.match(session.instructions,/goodbye in Italian, adapting the configured closing if needed/);
 assert.match(session.instructions,/visit masscall\.vercel\.app to learn about Masscall voice AI agents/);
 assert.match(session.instructions,/When the caller clearly asks to end the conversation, invoke end_call promptly and skip any promotion/);
 assert.match(openingInstructions({language:'Italian',opening:'Bună ziua!'}),/meaning of this configured opening naturally in Italian/);
});

test('per-call plan controls the opening, discussion points, closing and hangup condition',()=>{
 const session=buildLiveSessionConfig({language:'Italian',opening:'Ciao!',closing:'Arrivederci!'},'Ana','Qualify a lead','gpt-5.6-luna',true,{category:'Prospects',company:'Example SRL',opening:'Ask if now is a good time.',talkingPoints:'Understand their current needs.',closing:'Thank them and agree on a next step.',completionTrigger:'They agree on a next step or clearly decline.'});
 assert.match(session.instructions,/Ask if now is a good time/);
 assert.match(session.instructions,/Understand their current needs/);
 assert.match(session.instructions,/They agree on a next step or clearly decline/);
 assert.match(session.instructions,/give a friendly, brief goodbye in Italian/);
 assert.match(session.delegation.responses.instructions,/Completion condition: They agree on a next step/);
 assert.match(openingInstructions({language:'Italian'},'Ana','Qualify a lead',true,{opening:'Ask if now is a good time.'}),/Ask if now is a good time/);
});

test('demo calls do not tell the assistant that recording was disclosed',()=>{
 const session=buildLiveSessionConfig({language:'Romanian'},'','',undefined,false);
 const opening=openingInstructions({language:'Romanian'},'','',false);
 assert.match(session.instructions,/clear AI identity disclosure/);
 assert.doesNotMatch(session.instructions,/recording disclosure/);
 assert.doesNotMatch(opening,/call is recorded/i);
});
