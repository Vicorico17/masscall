# Masscall

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
4. Set `VOICE_BRIDGE_URL` to the exact public `wss://.../media` URL and `VOICE_BRIDGE_SECRET` to the same high-entropy secret on both hosts. Set Twilio account SID/auth token and `OPENAI_API_KEY` on the bridge. Optional `OPENAI_BACKEND_MODEL` defaults to `gpt-5.6-luna`. Confirm model availability in the OpenAI project. The Vercel settings indicator can only detect environment configuration; it does not verify provider access.
5. Set `ENABLE_LIVE_CALLS=true`. The owner console accepts valid international destinations that your Twilio account is permitted to call. Calls are capped at five minutes and require an owned caller ID, contact permission, and recording consent.
6. Open `/dashboard` and enter the owner token. Select your real number and enter the test destination. Agent instructions are configured in the Studio panel beside the call form.
7. Place the test call, inspect audio and conversation quality, end it, and refresh the live call list. Open **View recording** once Twilio finishes processing. The player and MP3 download are authenticated; provider credentials are never sent to the browser.

Live calls request Twilio dual-channel recording of both tracks. An opening announcement identifies the AI and recording. Recording begins on answer, so the UI requires recording consent before dialing. Recording is stored at Twilio and fetched through the authenticated proxy. No recording is automatically downloaded to the application server's disk. Automatic retention is not implemented; set and enforce a retention period before a customer launch. This version retrieves recording status on demand instead of relying on asynchronous callbacks.

The bridge verifies Twilio upgrade signatures and a short-lived HMAC-signed call context, negotiates raw G.711 μ-law with GPT-Live, paces output in 20 ms frames, and limits provider playback backlog with mark acknowledgments. Responses delegation includes a built-in `end_call` control: when the objective is complete or the caller asks to stop, the assistant gives a short goodbye and Masscall ends the Twilio call after its audio finishes. Web search is optional; business bookings and CRM writes are not connected. Real transcripts are not persisted, so audio recordings are the durable conversation artifact.

The live call center includes **People** and **Call templates**. Save a person with a target group, company, role, and background; choose them before dialing to populate the contact details. Four ready-made call plans cover prospect introductions, appointment confirmations, customer follow-ups, and service feedback. Choose one to prefill the call, edit it, and save it as a reusable template. Saved templates can be associated with a target group, and selecting a matching person can load that group's template. The completion condition is passed into the live agent instructions and governs when it calls `end_call`; callers can still ask to stop at any time. People, groups, and templates are stored in this browser's local storage, so they are not shared across browsers or devices.

Before a real call, choose **Rehearse this setup** to role-play a text conversation using the selected agent identity, person context, language, and call plan. The rehearsal does not dial or record a phone call, but sends the selected context and transcript to the configured OpenAI project, where model usage is billed. Rehearsal history is sent with each turn and not persisted by the app or OpenAI Responses request.

After a real call ends, use **Review outcome** in the call log to record the result, agreed next step, optional follow-up date, and notes. Call context and reviews are stored in browser local storage only. The log links to the Twilio recording but does not transcribe or automatically analyze it.

## Scheduled campaigns

The live call center can schedule a one-time campaign for a saved target group. Choose a caller ID and saved call template, select up to 20 eligible contacts, and choose a start time within seven days. Each selected person must have **calling consent** and **recording consent** checked on their People record, and the campaign form asks the operator to reconfirm permission before scheduling. Campaigns snapshot the selected people and call plan in Redis so later browser edits do not change a queued run. Contacts are dialed one at a time; the next call waits for the previous Twilio call to finish. The worker pauses outside Monday–Friday, 09:00–18:00 Europe/Bucharest and starts no new call after 17:55 to leave room for its five-minute call limit. It stops at a 20 campaign calls per day limit. If Twilio returns an ambiguous error after a dial request, the campaign moves to **needs review** instead of retrying a possible duplicate call.

Scheduling needs the existing `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `DEMO_HASH_SECRET`, plus these private Vercel environment variables in Production (and Preview if testing preview deployments):

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `MASSCALL_PUBLIC_URL` set to `https://masscall.vercel.app`

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

Use **🇷🇴 Română** in the header to translate the interface, including dialogs, call states, history, and setup help. Switch back with **EN · English**. The choice persists in browser storage; toggling preserves unsaved form data and does not translate user-entered instructions or change the agent's selected speaking language. New agents default to Romanian with Romanian instructions. Existing saved custom agents are preserved. New call timestamps use Europe/Bucharest. The recording announcement uses Twilio's ro-RO / Polly.Carmen voice when the agent speaks Romanian.

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
