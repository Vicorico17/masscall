import test from 'node:test';
import assert from 'node:assert/strict';
import { JobStatus } from '@livekit/protocol';
import { createLiveKitTwilioCall, liveKitCallConfigured, liveKitTwiml, parseLiveKitCallContext } from '../lib/livekit-telephony.js';

const env = {
  LIVEKIT_URL: 'wss://masscall-test.livekit.cloud',
  LIVEKIT_API_KEY: 'test-key',
  LIVEKIT_API_SECRET: 'test-secret',
  LIVEKIT_AGENT_NAME: 'masscall-call-agent',
  TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
  TWILIO_AUTH_TOKEN: 'test-token'
};

function fakeApi({ status = JobStatus.JS_RUNNING } = {}) {
  const events = [];
  let metadata;
  const api = {
    room: {
      createRoom: async (options) => { events.push('room:create'); return options; },
      deleteRoom: async () => { events.push('room:delete'); }
    },
    agentDispatch: {
      createDispatch: async (roomName, agentName, options) => {
        events.push('agent:dispatch'); metadata = JSON.parse(options.metadata);
        assert.equal(agentName, env.LIVEKIT_AGENT_NAME);
        assert.match(roomName, /^masscall-/);
        return { id: 'dispatch-123' };
      },
      getDispatch: async () => ({ state: { jobs: [{ state: { status } }] } }),
      deleteDispatch: async () => { events.push('agent:delete'); }
    },
    connector: {
      connectTwilioCall: async (options) => {
        events.push('connector:connect');
        assert.equal(options.twilioCallDirection, 1);
        assert.equal(options.participantIdentity, metadata.participantIdentity);
        return { connectUrl: 'wss://connector.example.test/twilio?token=abc' };
      }
    }
  };
  return { api, events, get metadata() { return metadata; } };
}

test('LiveKit call configuration requires secure project URL, API credentials, and Twilio credentials', () => {
  assert.equal(liveKitCallConfigured(env), true);
  assert.equal(liveKitCallConfigured({ ...env, LIVEKIT_API_SECRET: '' }), false);
  assert.equal(liveKitCallConfigured({ ...env, LIVEKIT_URL: 'http://localhost' }), false);
});

test('LiveKit TwiML accepts only secure stream URLs and escapes connector query parameters', () => {
  assert.match(liveKitTwiml('wss://connector.example.test/twilio?token=a&room=b'), /url="wss:\/\/connector\.example\.test\/twilio\?token=a&amp;room=b"/);
  assert.throws(() => liveKitTwiml('https://connector.example.test/twilio'), /invalid Twilio stream URL/i);
});

test('LiveKit call dispatches the named agent before connecting and creates a recorded Twilio call', async () => {
  const fake = fakeApi();
  let twilioValues;
  const result = await createLiveKitTwilioCall({
    to: '+40735577052', from: '+40700000000', contact: 'Ana Pop', objective: 'Confirm the appointment.',
    agent: { name: 'Andreea', company: 'Masscall', language: 'Romanian' },
    callPlan: { category: 'Customers', completionTrigger: 'The time is confirmed.' }
  }, {
    env,
    livekit: fake.api,
    createTwilioCall: async (values) => { fake.events.push('twilio:dial'); twilioValues = values; return { sid: 'CA' + 'b'.repeat(32), status: 'queued' }; }
  });

  assert.match(result.sid, /^CA[a-f0-9]{32}$/i);
  assert.equal(fake.metadata.contact, 'Ana Pop');
  assert.equal(fake.metadata.objective, 'Confirm the appointment.');
  assert.deepEqual(fake.events, ['room:create', 'agent:dispatch', 'connector:connect', 'twilio:dial']);
  assert.equal(twilioValues.To, '+40735577052');
  assert.equal(twilioValues.Record, 'true');
  assert.equal(twilioValues.RecordingTrack, 'both');
  assert.match(twilioValues.Twiml, /<Connect><Stream/);
  assert.match(twilioValues.Twiml, /<Hangup\/>/);
});

test('LiveKit does not dial when its dispatched agent is not running and cleans up the room', async () => {
  const fake = fakeApi({ status: JobStatus.JS_PENDING });
  await assert.rejects(() => createLiveKitTwilioCall({ to: '+40735577052', from: '+40700000000', objective: 'Test', agent: {} }, {
    env, livekit: fake.api, dispatchTimeoutMs: 10, wait: async () => {}, createTwilioCall: async () => assert.fail('must not dial')
  }), { status: 503, message: /agent did not become ready/i });
  assert.deepEqual(fake.events, ['room:create', 'agent:dispatch', 'agent:delete', 'room:delete']);
});

test('LiveKit cleans up its dispatch and room if Twilio rejects the call', async () => {
  const fake = fakeApi();
  await assert.rejects(() => createLiveKitTwilioCall({ to: '+40735577052', from: '+40700000000', objective: 'Test', agent: {} }, {
    env, livekit: fake.api, createTwilioCall: async () => { throw new Error('Twilio unavailable'); }
  }), /Twilio unavailable/);
  assert.deepEqual(fake.events, ['room:create', 'agent:dispatch', 'connector:connect', 'agent:delete', 'room:delete']);
});

test('invalid LiveKit dispatch metadata is rejected', () => {
  assert.throws(() => parseLiveKitCallContext('{'), /invalid LiveKit call metadata/i);
  assert.throws(() => parseLiveKitCallContext(JSON.stringify({ agent: {} })), /call objective/i);
});
