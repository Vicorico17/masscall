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
 assert.deepEqual(session.delegation.responses.tools,[{type:'web_search'}]);
 assert.equal(session.delegation.responses.instructions,'Research current opening hours.');
});

test('GPT-Live omits optional reasoning and tools unless selected',()=>{
 const session=buildLiveSessionConfig({voice:'marin',webSearch:false});
 assert.equal(session.model,'gpt-live-1');
 assert.equal(session.audio.output.voice,'marin');
 assert.equal('reasoning' in session.delegation.responses,false);
 assert.equal('tools' in session.delegation.responses,false);
});

test('opening instruction resolves agent and contact placeholders for the initial greeting',()=>{
 const prompt=openingInstructions({name:'Mihai',company:'Firma B',language:'Romanian',introduction:'Sunt {agent_name}, asistent AI la {company_name}.',opening:'Bună ziua, {first_name}!',closing:'La revedere!'},'Ioana Ionescu','Confirmă programarea');
 assert.ok(prompt.includes('Sunt Mihai, asistent AI la Firma B.'));
 assert.ok(prompt.includes('Bună ziua, Ioana!'));
 assert.ok(!prompt.includes('{first_name}'));
});
