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
 assert.match(session.delegation.responses.instructions,/use the end_call function only when the stated objective is complete/);
 assert.match(session.instructions,/delegate immediately to the backend to call end_call/);
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
 assert.match(openingInstructions({language:'Italian',opening:'Bună ziua!'}),/meaning of this configured opening naturally in Italian/);
});

test('demo calls do not tell the assistant that recording was disclosed',()=>{
 const session=buildLiveSessionConfig({language:'Romanian'},'','',undefined,false);
 const opening=openingInstructions({language:'Romanian'},'','',false);
 assert.match(session.instructions,/clear AI identity disclosure/);
 assert.doesNotMatch(session.instructions,/recording disclosure/);
 assert.doesNotMatch(opening,/call is recorded/i);
});
