# Voice call setup: findings and implementation priorities

Research reviewed on 2 October 2026: the [Saperly overview](https://monid.ai/blog/saperly), [OpenAI GPT-Live prompting guide](https://developers.openai.com/api/docs/guides/live-prompting), [OpenAI live session guide](https://developers.openai.com/api/docs/guides/live-conversations), and [LiveKit](https://livekit.com/) product and documentation pages.

## Ranked findings

| Rank | Finding | Masscall action |
|---|---|---|
| 1 | A call setup should lead with the person, the call goal, what to say, and how success is recognized. | Keep the setup task focused on a person/category and a call plan. Make the next action obvious and avoid exposing model controls in the main flow. |
| 2 | A voice prompt works better when its role, style, turn-taking, interruptions, and backend delegation rules are distinct and short. Detailed procedures should not be repeated across prompt layers. | Implemented in `lib/live-session.js`: concise named sections for role/style, call context, backchannels, interruptions, delegation, and call ending. Removed overlapping identity/call-plan instructions. |
| 3 | The first words need an explicit, single opening instruction after the live session starts. Its acknowledgement only confirms that the instruction was accepted; call audio still needs to be observed. | Implemented one conversational opening that combines the chosen intro and opener instead of asking the agent to read them as two scripts. Fixed the opening acknowledgement correlation field in `bridge/server.js`. |
| 4 | The agent needs a clear completion condition and a reliable hangup sequence. | Existing `end_call` flow is retained: confirm the goal, give the goodbye, drain audio, then hang up. Prompt now distinguishes caller interruptions from a request to stop. |
| 5 | Users should see the call result and cost clearly, and reusable configurations reduce repeated setup. | Product direction: reusable templates by audience and purpose; show outcome, duration, and estimated/actual cost after each test call. |
| 6 | Testing and diagnosis should show whether the call connected, heard caller audio, received an agent response, and ended. | Bridge already logs first caller input, first agent audio, accepted opening, end request, and end result. Use these events as the minimum call health trace. |
| 7 | LiveKit offers managed agent sessions, observability, deployment, and a Twilio Media Streams connector for existing Twilio workflows. | Keep as a migration option if the custom bridge remains unreliable. A connector proof of concept could preserve Twilio while moving media/session infrastructure to LiveKit Cloud. |
| 8 | Realtime voice is a meaningful cost choice. LiveKit's current pricing page estimates agent session and telephony separately from selected model inference, and lists GPT Realtime above text-model options per minute. | Do not assume LiveKit is cheaper. Compare the same call duration, Twilio charges, model, and any platform usage before migrating. |

## What LiveKit adds

LiveKit's [Twilio Connector](https://docs.livekit.io/telephony/connectors/twilio/) connects Twilio Media Streams to LiveKit rooms over WebSockets and supports inbound and outbound calls. The docs position it as the lower-change path when an app already uses Twilio; it requires LiveKit Cloud. Their broader [voice AI quickstart](https://docs.livekit.io/agents/start/voice-ai/) includes agent testing and deployment workflows. This could remove some custom media-bridge maintenance, but requires a new provider integration, credentials, deployment, and call-flow validation.

LiveKit's [pricing page](https://livekit.com/pricing) currently shows a $0 Build plan and a $50/month Ship plan, with included allowances and separate per-minute estimate components. Its calculator currently lists GPT Realtime at $0.0676/min and GPT Realtime mini at $0.0216/min for inference, alongside agent-session and telephony components. Those figures describe LiveKit's listed model options and estimator; they are not an apples-to-apples estimate for Masscall's existing GPT-Live plus delegated Responses and Twilio setup. Check the calculator before any platform decision.

## Recommendation

Keep the current Twilio + Render bridge + GPT-Live setup for this test cycle. The phone number and Twilio account already work, and the direct GPT-Live prompting cleanup is the smallest step toward diagnosing the silence and interruption issues. After the next test, inspect the bridge events in order: `bridge.live_session_started`, `bridge.opening_instructions_accepted`, `bridge.first_twilio_audio_received`, `bridge.first_input_audio_sent`, `bridge.first_output_audio_received`, and `bridge.call_ended`. If input reaches OpenAI but no output returns, capture the session error/event trace before changing providers. If the custom bridge itself is the repeated failure point, prototype the LiveKit Twilio Connector and compare cost and call quality on the same short test.

## Sources and evidence limits

The Saperly page is a product overview, so its claims describe the product's presented approach rather than independent performance evidence. OpenAI and LiveKit documentation are primary sources for their APIs and platform behavior. Pricing changes over time and should be rechecked before purchase or migration.
