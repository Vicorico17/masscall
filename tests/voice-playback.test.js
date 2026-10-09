import test from 'node:test';
import assert from 'node:assert/strict';
import {VoicePlayback,shouldClearForTranscript} from '../lib/voice-playback.js';

test('Twilio playback is paced, acknowledged, and stale speech is cleared on interruption',()=>{
 const sent=[],playback=new VoicePlayback(event=>sent.push(event),'MZtest');
 assert.equal(playback.append(Buffer.alloc(480,0xff).toString('base64')),true);
 assert.equal(playback.pendingMs,60);
 assert.equal(playback.tick(1000),true);
 assert.equal(playback.tick(1020),true);
 assert.equal(playback.pendingMs,20);
 assert.equal(playback.queuedMs,40);
 assert.deepEqual(sent.map(event=>event.event),['media','mark','media','mark']);
 assert.equal(playback.acknowledge('1',1040),true);
 const removed=playback.clear();
 assert.deepEqual(removed,{pendingMs:20,twilioQueuedMs:20});
 assert.equal(sent.at(-1).event,'clear');
 assert.equal(sent.at(-1).streamSid,'MZtest');
 assert.equal(playback.acknowledge('2',1060),false);
 assert.equal(playback.pendingMs,0);
 assert.equal(playback.queuedMs,0);
 assert.deepEqual(playback.summary(),{maxPendingMs:60,sentFrames:2,playedFrames:1,clearedFrames:1,clearedPendingMs:20,averageMarkMs:40});
});

test('transcript interruption requires recent caller speech during playback',()=>{
 const active={delta:' Da',endMs:31000,elapsedMs:31500,pendingMs:1200,queuedMs:100,sinceLastClearMs:1200};
 assert.equal(shouldClearForTranscript(active),true);
 assert.equal(shouldClearForTranscript({...active,endMs:27000}),false);
 assert.equal(shouldClearForTranscript({...active,pendingMs:0,queuedMs:0}),false);
 assert.equal(shouldClearForTranscript({...active,sinceLastClearMs:300}),false);
 assert.equal(shouldClearForTranscript({...active,ending:true}),false);
 assert.equal(shouldClearForTranscript({...active,delta:' '}),false);
});
