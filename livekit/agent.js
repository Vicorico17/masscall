import { ServerOptions, cli, defineAgent, tool, voice } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { LiveKitAPI } from 'livekit-server-sdk';
import { fileURLToPath } from 'node:url';
import { parseLiveKitCallContext } from '../lib/livekit-telephony.js';
import { buildLiveSessionConfig, openingInstructions } from '../lib/live-session.js';

const log = (event, details = {}) => console.log(JSON.stringify({ event, ...details }));

export default defineAgent({
  entry: async (ctx) => {
    const call = parseLiveKitCallContext(ctx.job.metadata);
    const sessionConfig = buildLiveSessionConfig(call.agent, call.contact, call.objective, 'gpt-6-luna', call.recording, call.callPlan);
    const modelOptions = {
      model: sessionConfig.model,
      voice: sessionConfig.audio.output.voice,
      apiKey: process.env.OPENAI_API_KEY,
      responsesOptions: {
        model: sessionConfig.delegation.responses.model,
        instructions: sessionConfig.delegation.responses.instructions,
        ...(sessionConfig.delegation.responses.reasoning ? { reasoning: sessionConfig.delegation.responses.reasoning } : {})
      }
    };
    const api = new LiveKitAPI();
    let endRequested = false;
    let endSpeechStarted = false;
    let ending = false;
    let endFallback;

    const disconnectAfterGoodbye = async (reason) => {
      if (ending) return;
      ending = true;
      clearTimeout(endFallback);
      log('livekit.call_end_room_delete', { room: ctx.room.name, reason });
      try { await api.room.deleteRoom(ctx.room.name); }
      catch (error) { log('livekit.call_end_room_delete_failed', { message: String(error?.message || 'unknown').slice(0, 180) }); }
    };

    const endCall = tool({
      name: 'end_call',
      description: 'End this phone call only after its objective is complete or the caller clearly asks to stop.',
      parameters: {
        type: 'object',
        properties: { reason: { type: 'string', enum: ['goal_complete', 'caller_requested_end'] } },
        required: ['reason'],
        additionalProperties: false
      },
      execute: async ({ reason }) => {
        if (!['goal_complete', 'caller_requested_end'].includes(reason)) return 'Invalid end reason. Continue the conversation.';
        endRequested = true;
        endFallback = setTimeout(() => disconnectAfterGoodbye('goodbye_timeout'), 10000);
        log('livekit.end_call_requested', { room: ctx.room.name, reason });
        return 'The call will end after your next brief, friendly goodbye. Say the goodbye now in the selected language, then stop speaking.';
      }
    });
    const tools = [endCall];
    if (call.agent.webSearch) tools.push(new openai.WebSearch());
    const agent = new voice.Agent({
      instructions: sessionConfig.instructions,
      llm: new openai.realtime.GPTLiveModel(modelOptions),
      tools,
      allowInterruptions: true
    });
    const session = new voice.AgentSession();
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (event) => {
      if (endRequested && event.newState === 'speaking') endSpeechStarted = true;
      if (endRequested && endSpeechStarted && event.oldState === 'speaking' && event.newState !== 'speaking') {
        setTimeout(() => disconnectAfterGoodbye('goodbye_finished'), 900);
      }
    });
    session.on(voice.AgentSessionEventTypes.MetricsCollected, (event) => {
      log('livekit.agent_metrics', { room: ctx.room.name, metrics: event.metrics });
    });
    session.on(voice.AgentSessionEventTypes.Error, (event) => {
      log('livekit.agent_session_error', { room: ctx.room.name, message: String(event.error?.message || 'unknown').slice(0, 200) });
    });

    await ctx.connect();
    const caller = await ctx.waitForParticipant(call.participantIdentity);
    log('livekit.twilio_participant_joined', { room: ctx.room.name, participant: caller.identity });
    await session.start({ agent, room: ctx.room, record: false });
    log('livekit.gpt_live_session_started', { room: ctx.room.name, model: sessionConfig.model, voice: sessionConfig.audio.output.voice });

    await session.generateReply({
      instructions: openingInstructions(call.agent, call.contact, call.objective, call.recording, call.callPlan)
    });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const agentName = process.env.LIVEKIT_AGENT_NAME || 'masscall-call-agent';
  cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url), agentName, port: Number(process.env.PORT || 8081) }));
}
