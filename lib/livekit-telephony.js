import { randomUUID } from 'node:crypto';
import { LiveKitAPI } from 'livekit-server-sdk';
import { ConnectTwilioCallRequest_TwilioCallDirection, JobStatus } from '@livekit/protocol';
import { normalizeIdentity } from '../public/identity.js';
import { normalizeCallPlan } from './call-plan.js';
import { twilio, xml } from './telephony.js';

export const liveKitCallConfigured = (env = process.env) =>
  /^wss:\/\/[^/?#\s]+\/?$/i.test(String(env.LIVEKIT_URL || '').trim()) &&
  Boolean(env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim() && env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim());

export function normalizeLiveKitCallContext(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid LiveKit call context.');
  const objective = String(value.objective || '').trim().slice(0, 2000);
  if (!objective) throw new Error('A call objective is required.');
  return {
    agent: normalizeIdentity(value.agent || {}),
    contact: String(value.contact || '').trim().slice(0, 80),
    objective,
    callPlan: normalizeCallPlan(value.callPlan),
    recording: true,
    participantIdentity: String(value.participantIdentity || '').trim().slice(0, 100)
  };
}

export function parseLiveKitCallContext(metadata) {
  if (typeof metadata !== 'string' || metadata.length > 16000) throw new Error('Missing or oversized LiveKit call metadata.');
  let parsed;
  try { parsed = JSON.parse(metadata); } catch { throw new Error('Invalid LiveKit call metadata.'); }
  return normalizeLiveKitCallContext(parsed);
}

export function liveKitTwiml(connectUrl) {
  let url;
  try { url = new URL(connectUrl); } catch { throw new Error('LiveKit returned an invalid Twilio stream URL.'); }
  if (url.protocol !== 'wss:' || !url.hostname) throw new Error('LiveKit returned an invalid Twilio stream URL.');
  return `<Response><Connect><Stream url="${xml(url.href)}" /></Connect><Hangup/></Response>`;
}

export async function createLiveKitTwilioCall({ to, from, agent, contact = '', objective, callPlan = {} }, dependencies = {}) {
  const env = dependencies.env || process.env;
  if (!liveKitCallConfigured(env)) throw Object.assign(new Error('LiveKit is not configured for this workspace.'), { status: 503 });
  const client = dependencies.livekit || new LiveKitAPI({ host: env.LIVEKIT_URL.replace(/^wss:/i, 'https:'), apiKey: env.LIVEKIT_API_KEY, secret: env.LIVEKIT_API_SECRET });
  const makeTwilioCall = dependencies.createTwilioCall || ((values) => twilio('Calls.json', 'POST', values));
  const deleteRoom = dependencies.deleteRoom || ((name) => client.room.deleteRoom(name));
  const agentName = String(env.LIVEKIT_AGENT_NAME || 'masscall-call-agent').trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(agentName)) throw new Error('LIVEKIT_AGENT_NAME is invalid.');
  const id = randomUUID();
  const roomName = `masscall-${id}`;
  const participantIdentity = `phone-${id}`;
  const context = normalizeLiveKitCallContext({ agent, contact, objective, callPlan, participantIdentity });
  const metadata = JSON.stringify(context);
  if (metadata.length > 16000) throw Object.assign(new Error('Call context is too large for LiveKit.'), { status: 400 });

  let roomCreated = false;
  let dispatchId = '';
  try {
    await client.room.createRoom({ name: roomName, emptyTimeout: 60, departureTimeout: 30, maxParticipants: 2 });
    roomCreated = true;
    const dispatch = await client.agentDispatch.createDispatch(roomName, agentName, { metadata });
    dispatchId = dispatch.id;
    const wait = dependencies.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const deadline = Date.now() + (dependencies.dispatchTimeoutMs ?? 12000);
    let ready = false;
    while (Date.now() < deadline) {
      const current = await client.agentDispatch.getDispatch(dispatchId, roomName);
      const jobs = current?.state?.jobs || [];
      if (jobs.some(job => job.state?.status === JobStatus.JS_RUNNING)) { ready = true; break; }
      if (jobs.some(job => [JobStatus.JS_FAILED, JobStatus.JS_SUCCESS].includes(job.state?.status))) break;
      await wait(400);
    }
    if (!ready) throw Object.assign(new Error('The LiveKit agent did not become ready. Check that its deployment is running and its agent name matches.'), { status: 503 });
    const connector = await client.connector.connectTwilioCall({
      twilioCallDirection: ConnectTwilioCallRequest_TwilioCallDirection.OUTBOUND,
      roomName,
      participantIdentity,
      participantName: context.contact || context.agent.name
    });
    if (!connector.connectUrl) throw new Error('LiveKit did not return a Twilio stream URL.');
    const call = await makeTwilioCall({
      To: to,
      From: from,
      Twiml: liveKitTwiml(connector.connectUrl),
      Record: 'true',
      RecordingChannels: 'dual',
      RecordingTrack: 'both',
      TimeLimit: '300',
      Timeout: '25'
    });
    return call;
  } catch (error) {
    if (dispatchId) await client.agentDispatch.deleteDispatch(dispatchId, roomName).catch(() => {});
    if (roomCreated) await deleteRoom(roomName).catch(() => {});
    throw error;
  }
}
