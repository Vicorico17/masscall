# Masscall

## Brand direction

The public test-call page and owner dashboard follow `Masscall-Brand-Book.pdf` (October 2026): Void `#0B0711`, Signal Violet `#8B36E8`, Lavender `#DCC8F1`, Acid `#D7FF3F`, and Chalk `#F5F0E8`. The headset worm in `public/brand/masscall-worm.webp` is cropped from the supplied brand-book illustration. Use it at hero size; the text wordmark remains legible at small sizes. DejaVu Sans is preferred with a system sans fallback. The book describes a proposed identity, so final vector marks and commercial rights review are still separate production work.

A Romanian-first AI calling product with a free example call, a paid agent Studio, and an operator pilot workspace.

## Run

```sh
npm install
npm run dev
```

Open http://localhost:3000 for the public Romanian test-call landing page. `/dashboard` is the single owner call center and always asks for `MASSCALL_ADMIN_TOKEN` before loading real Twilio numbers, calls, and the GPT-Live agent editor. `/studio` redirects to `/dashboard`; `/demo.html` redirects to `/`. The call center is a single-workspace owner pilot, not a multi-tenant customer dashboard.

## Public Romanian demo

The free experience accepts only Romanian mobile numbers (`+407xxxxxxxx`). The visitor confirms they want an AI call, completes Turnstile, receives an SMS code through Twilio Verify, and then gets one call of up to 90 seconds from `DEMO_FROM_NUMBER`. The example agent is fixed in server code. Demo calls are **not recorded**. A durable Redis reservation limits verification attempts, daily calls, and one free call per verified number. A short-lived token lets the page show call status without exposing provider credentials.

To enable it, configure a Twilio Verify Service, a voice-capable Romanian Twilio number, the persistent GPT-Live bridge described below, Upstash Redis REST credentials, Cloudflare Turnstile site and secret keys, and a random `DEMO_HASH_SECRET`. Set `ENABLE_PUBLIC_DEMO=true` only after those are working. The endpoint fails closed when any of these settings is missing. Twilio Verify and the AI call cost Masscall even though the visitor pays nothing.

## Customer Studio status

The former standalone `/studio` customer signup and billing page is no longer part of the active site; its URL redirects to the owner call center. The older billing API implementation remains in the repository but is not linked from either active page.

## Real calling and recording

The `/dashboard` route opens the **live workspace console** directly. It uses authenticated server endpoints. The owner access token is held only in page memory, so it must be entered again after a reload. This is a single-workspace pilot, not a multi-tenant SaaS authentication system.

1. Create a dedicated Twilio account/subaccount and fund it. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and a random `MASSCALL_ADMIN_TOKEN` of at least 24 characters in Vercel. The server token should be generated outside the browser and shared only with the workspace owner.
2. Buy a voice-capable number through Twilio Console, or enable `ENABLE_NUMBER_PURCHASES=true` to purchase through the live console. Confirm current rental pricing in Twilio first. Countries with regulatory requirements need approved bundles/addresses; the API accepts BundleSid and AddressSid, while the first UI directs those purchases to Twilio Console.
3. Deploy `bridge/server.js` on a persistent Node host supporting WebSocket upgrades and HTTPS/WSS. Run `npm run bridge`. Ordinary Vercel functions do not host this long-running audio bridge.
4. Set `VOICE_BRIDGE_URL` to the exact public `wss://.../media` URL and `VOICE_BRIDGE_SECRET` to the same high-entropy secret on both hosts. Set Twilio account SID/auth token and `OPENAI_API_KEY` on the bridge. Optional `OPENAI_BACKEND_MODEL` defaults to `gpt-6-luna`. Confirm model availability in the OpenAI project. The Vercel settings indicator can only detect environment configuration; it does not verify provider access.
5. Set `ENABLE_LIVE_CALLS=true`. The owner console accepts valid international destinations that your Twilio account is permitted to call. Calls are capped at five minutes and require an owned caller ID, contact permission, and recording consent.
6. Open `/dashboard` and enter the owner token. The first menu item, **CALL**, guides the first call with a template, a goal, a caller number, and a destination. **MAX SETTINGS** contains the detailed call plan, ending condition, voice, model, and per-call agent instructions. The **Agent** menu saves defaults for a Twilio number.
7. Place the test call, inspect audio and conversation quality, end it, and refresh the live call list. Open **View recording** once Twilio finishes processing. The player and MP3 download are authenticated; provider credentials are never sent to the browser.

Live calls request Twilio dual-channel recording of both tracks. An opening announcement identifies the AI and recording. Recording begins on answer, so the UI requires recording consent before dialing. Recording is stored at Twilio and fetched through the authenticated proxy. No recording is automatically downloaded to the application server's disk. Automatic retention is not implemented; set and enforce a retention period before a customer launch. This version retrieves recording status on demand instead of relying on asynchronous callbacks.

The bridge verifies Twilio upgrade signatures and a short-lived HMAC-signed call context, negotiates raw G.711 μ-law with GPT-Live, paces output in 20 ms frames, and limits provider playback backlog with mark acknowledgments. Responses delegation includes a built-in `end_call` control: when the objective is complete or the caller asks to stop, the assistant gives a short goodbye and Masscall ends the Twilio call after its audio finishes. Web search is optional; business bookings and CRM writes are not connected. Real transcripts are not persisted, so audio recordings are the durable conversation artifact.

For pacing checks, Render logs `bridge.caller_interruption` when recent caller speech clears unplayed audio and `bridge.call_timing` when the stream closes. The timing record includes first input, first generated audio, first Twilio playback acknowledgment, local audio queue size, and approximate response gaps derived from transcript timestamps. It contains no transcript text. Compare these timings with the Twilio recording; transcript events can arrive late, so their gaps are estimates rather than exact audible latency.

The live call center includes **People** and **Call templates**. Save a person with a target group, company, role, and background; choose them before dialing to populate the contact details. Five Romanian call plans cover a quick conversation test, prospect introductions, appointment confirmations, customer follow-ups, and service feedback. Choose one to prefill the call, edit it, and save it as a reusable template. Saved templates can be associated with a target group. Selecting a person preserves the chosen call objective. The completion condition is passed into the live agent instructions and governs when it calls `end_call`; callers can still ask to stop at any time. People, groups, and templates are stored in this browser's local storage, so they are not shared across browsers or devices.

### Optional LiveKit comparison

The call form can send a test call through LiveKit Cloud's Twilio Connector while keeping the existing Twilio number and GPT-Live model. This is a comparison path, not a lower-cost guarantee: OpenAI, Twilio, and LiveKit usage can all be billed. LiveKit's connector is a LiveKit Cloud feature. The same Render bridge service can also run the LiveKit agent worker, so no second Render service is needed.

1. Create a LiveKit Cloud project and an API key/secret. Copy the project's WebSocket URL (`wss://…`).
2. Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_AGENT_NAME=masscall-call-agent` to the existing Render service. Also set `ENABLE_LIVEKIT_AGENT=true`. Keep its existing `OPENAI_API_KEY`, `OPENAI_BACKEND_MODEL` (defaults to `gpt-6-luna`), and Twilio credentials. The worker listens internally on port `8081` by default; set `LIVEKIT_WORKER_PORT` only if that conflicts with the host.
3. Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_AGENT_NAME=masscall-call-agent` to Vercel Production. Set `ENABLE_LIVEKIT_TEST_CALLS=true` there and redeploy. For a Preview URL, add the same values to Preview and redeploy its preview.
4. Wait for Render to restart and show `bridge.livekit_agent_registered`. In `/dashboard`, choose **LiveKit comparison** and place a short test to a number you can answer. It uses the same saved person, call plan, and caller ID as the current bridge route. The API waits for the agent dispatch to report running before it asks Twilio to dial; a non-ready worker fails before calling.
5. Compare the conversation, ending behavior, recordings, and provider usage with the current bridge call. Render logs include `livekit.twilio_participant_joined`, `livekit.gpt_live_session_started`, `livekit.agent_metrics`, and `livekit.call_end_room_delete`.

The agent uses GPT-Live through LiveKit's OpenAI plugin and delegates its Responses work to the configured backend model. GPT-Live access is required for the OpenAI project. See the [LiveKit Twilio Connector guide](https://docs.livekit.io/telephony/connectors/twilio/) and the [GPT-Live plugin guide](https://docs.livekit.io/agents/models/realtime/plugins/gpt-live/).

Templates also support up to six optional **conversation branches**. Add a condition such as “They ask about price” and the response/action the agent should take. Branch instructions go into rehearsals, individual live calls, and scheduled campaigns using that template. These are natural-language instructions for the live model; they do not execute bookings, CRM changes, or other external actions.

Before a real call, choose **Rehearse this setup** to role-play a text conversation using the selected agent identity, person context, language, and call plan. The rehearsal does not dial or record a phone call, but sends the selected context and transcript to the configured OpenAI project, where model usage is billed. Rehearsal history is sent with each turn and not persisted by the app or OpenAI Responses request.

After a real call ends, use **Review outcome** in the call log to record the result, agreed next step, optional follow-up date, and notes. Call context and reviews are stored in browser local storage only. The log links to the Twilio recording but does not transcribe or automatically analyze it.

## Scheduled campaigns

The live call center can schedule a one-time campaign for a saved target group. Choose a caller ID and saved call template, select up to 20 eligible contacts, and choose a start time within seven days. Each selected person must have **calling consent** and **recording consent** checked on their People record, and the campaign form asks the operator to reconfirm permission before scheduling. Campaigns snapshot the selected people and call plan in Redis so later browser edits do not change a queued run. Contacts are dialed one at a time; the next call waits for the previous Twilio call to finish. The worker pauses outside Monday–Friday, 09:00–18:00 Europe/Bucharest and starts no new call after 17:55 to leave room for its five-minute call limit. It stops at a 20 campaign calls per day limit. If Twilio returns an ambiguous error after a dial request, the campaign moves to **needs review** instead of retrying a possible duplicate call.

Scheduling needs the existing `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `DEMO_HASH_SECRET`, plus these private Vercel environment variables in Production (and Preview if testing preview deployments):

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `MASSCALL_PUBLIC_URL` set to `https://masscall.vercel.app`
- `QSTASH_URL` only if the QStash dashboard gives you a region-specific API URL; otherwise the app uses `https://qstash.upstash.io`.

Create an Upstash QStash account, open its dashboard, and copy the token and both signing keys from the QStash page into Vercel. Use the exact app origin for `MASSCALL_PUBLIC_URL`, with no path. Redeploy Vercel after saving variables. QStash sends authenticated callbacks to `/api/campaigns?action=run`; the app validates the signature against the configured current and next signing keys. It uses QStash delayed messages for individual campaign steps rather than a periodic cron job. See [QStash message publishing](https://upstash.com/docs/qstash/api-reference/messages/publish-a-message) and [signature verification](https://upstash.com/docs/qstash/howto/signature).

People, groups, and templates are still stored in browser local storage. Scheduling uploads only the selected contact and call-plan snapshot to Redis. The campaign queue is workspace-wide, matching the current single-owner call center.

## Customer number provisioning

Twilio subaccounts can separate each customer's numbers and usage under a parent account. Studio currently uses one Twilio account with operator-assigned numbers and a basic Stripe subscription gate. Per-customer Twilio subaccounts, metered usage billing, automated number provisioning, number-price quotes, operational dashboards, and recording retention policies still need work before reselling at scale. The app does not imply blanket permission to resell numbers in every country.

## Verification

```sh
npm test
# With a local app server running and Chromium installed:
node tests/ui.mjs
```

Backend tests mock provider calls and verify authentication, purchase gating, destination restrictions, recording consent, dual-channel recording, signed context, campaign scheduling, signed QStash callbacks, and provider error handling. The UI smoke test confirms the landing page, consistent dashboard token prompt, invalid-token rejection, and redirects from legacy URLs. Real phone calls and provider interoperability need funded credentials and a deployed bridge.

## Deployment

`vercel deploy -y` creates a preview. `vercel.json` serves the dashboard and Node API functions. Never put provider secrets in frontend files or public environment variables.

## References

- https://developers.openai.com/api/docs/guides/voice-websockets?api=live
- https://developers.openai.com/api/docs/guides/live-delegation
- https://www.twilio.com/docs/voice/api/call-resource
- https://www.twilio.com/docs/voice/media-streams/websocket-messages
- https://www.twilio.com/docs/iam/api/subaccounts

## Romania pilot

The app code retains a Romania number marketplace preview with fictional examples. It is not an active site destination; the dashboard now opens the authenticated Twilio call center directly.

Interfața, șabloanele, simulările și apelurile sunt în română. Agentul se prezintă ca agent AI al lui Vico, inclusiv pentru profilurile salvate anterior. Textele personalizate deja salvate de utilizator nu sunt traduse automat. Orele apelurilor folosesc Europe/Bucharest.

Meniul începe cu **CALL**: alege șablonul, completează obiectivul, introdu numărul și pornește apelul de test. Șablonul **Test rapid de conversație** permite verificarea introducerii și a dialogului. **MAX SETTINGS** oferă configurarea conversației, condiția de încheiere, vocea, modelul și instrucțiunile doar pentru acest apel. Poți reveni la CALL fără să pierzi setările. Obiectivul editat are prioritate față de șablon. Apelul afișează starea actualizată, poate fi închis din interfață și blochează pornirile repetate cât timp este activ.

Puntea audio închide conexiunea dacă sesiunea vocală nu pornește sau nu produce primul răspuns audio în intervalul așteptat; detaliile apar în jurnalele serviciului. Pentru verificarea sunetului real, publică atât aplicația, cât și serviciul `bridge`, apoi efectuează un apel de test. Verificările automate ale interfeței folosesc răspunsuri simulate și nu efectuează apeluri reale.

For a real Romanian test, the owner supplies:

- A funded Twilio account/subaccount: Account SID and Auth Token, stored in the hosting environment.
- An OpenAI API key with access to GPT-Live-1 and the configured backend model, stored on the voice bridge host.
- A purchased Romanian voice number. Local business numbers require company registration details, proof of business address within the number's area, and authorized representative documents. Follow Twilio's current requirements and inventory availability.
- A destination mobile that Twilio is permitted to call, with calling and recording consent.
- A persistent HTTPS/WSS host for the included bridge. Workspace and bridge secrets are generated during deployment, not purchased from a provider.

The local number rental shown is **USD 3/month**, based on Twilio's Romania price page checked September 11, 2026. It is not a RON conversion or an all-inclusive calling price. Calls, recording, storage, AI usage, taxes, and platform billing are separate.

References:
- https://www.twilio.com/en-us/voice/pricing/ro
- https://www.twilio.com/en-us/guidelines/ro/regulatory
- https://www.twilio.com/docs/voice/twiml/say/text-speech


## Per-number agent identities

In the call center, select a Twilio number and choose **Edit this number’s agent**. Each normalized phone number has its own identity: label, agent name, company, role, language, introduction, opening phrase, recipient-address style/details, closing phrase, and additional instructions. The default agent is a template for newly added numbers; changing it does not overwrite existing identities. Switching numbers in the editor saves the current valid form. Existing preview numbers receive a copy of their current agent configuration during migration.

Supported phrase variables: `{agent_name}`, `{company_name}`, `{first_name}`, `{full_name}`, and `{objective}`. The editor renders a text-only example with Andrei Popescu. Number selection in the call form displays the assigned identity. Simulated calls save an identity snapshot so later edits do not rewrite historical example dialogue.

The selected live number’s identity appears beside the call form. Live call requests include the selected number's identity, person background, and call plan in the signed bridge context. The shared prompt builder applies the introduction, opening, addressing, discussion points, closing, and completion condition while retaining AI disclosure and the existing recording announcement. The built-in `end_call` function hangs up after the configured completion condition or when the caller asks to stop.

Identity configuration is currently stored in this browser, including mappings for real numbers. For multi-user production use, move it to authenticated, tenant-scoped server storage before sharing across devices. Real call behavior still requires the credentials and voice bridge described above and has not been tested with a real phone here.
