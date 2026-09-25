# Masscall product TODO

## Target experience

1. A visitor enters their own phone number on the front page, verifies it, and receives one short free call from a shared Masscall demo number. The demo agent has a fixed identity and goal. No account or workspace token is needed.
2. A customer upgrades, creates a calling agent in a short guided form, previews its voice and introduction, and places a test call before using it with contacts.

## P0 — Make the free demo real

- [x] Replace the current preview-first landing experience with a clear **Get a free test call** form on `/`. The deployed `/` route currently serves `public/dashboard.html`; `public/index.html` is an older prototype.
- [x] Show the demo agent's name, company, purpose, and the real caller ID before the visitor requests the call.
- [x] For the Romania pilot, collect a Romanian mobile and explicit permission to receive an AI call. State that the free demo is not recorded.
- [x] Verify control of the phone number before dialing, then allow one short demo call per verified number. Keep the demo destination separate from the owner's `ALLOWED_TEST_NUMBERS` pilot list.
- [x] Add a public demo request endpoint that creates only the fixed demo agent and goal. Never accept agent instructions, caller ID, call duration, or arbitrary TwiML from the public form.
- [x] Set a short demo time limit and enforce per-number, per-IP, and global daily limits. Add retry/cooldown rules, bot protection, and a server-side spend cap.
- [ ] Configure and verify an owned, voice-capable Romanian Twilio number as the shared demo caller ID. Check its outbound permissions with a real test call.
- [x] Show requesting, ringing, connected, completed, and failed states on the page. Give the visitor a clear retry path when a call fails for a temporary reason.
- [x] Make the example agent introduce itself as an AI assistant, state why it is calling, conduct a brief conversation, and close naturally. The demo must never claim to book or update anything.
- [ ] Deploy the persistent voice bridge and complete an end-to-end call to a team-owned phone. Check connection, first response time, interruptions, audio quality, hangup, and recording behavior.

## P1 — Simple premium agent setup

- [x] Add account sign-in, workspace ownership, and a payment gate before creating or using premium agents.
- [x] Replace the long identity editor with a guided form whose required fields are **agent name**, **company**, **goal**, and **how the agent presents itself**. Include a plain-language example for each field.
- [x] Offer two voice choices, save the selected voice, and pass it into the GPT-Live session.
- [ ] Add short audio previews for each voice; currently customers hear the choice during a recorded test call.
- [x] Offer language as a simple choice and put detailed instructions and custom opening/closing phrases under an optional section.
- [ ] Add a simple tone choice.
- [x] Show a live preview of the editable introduction. The call prompt enforces AI disclosure.
- [x] Require a concrete goal for every agent. State what a successful call should accomplish and what the agent should say when it cannot complete that goal.
- [x] Let the customer call their own verified number with the new agent before enabling calls to contacts.
- [x] Save agents, voices, goals, and number assignments in authenticated server storage. Browser local storage is currently the source of truth, so settings do not follow a customer across devices.
- [x] Link the single pilot agent to an operator-assigned, owned Twilio number and show it in Studio.
- [x] Record premium test and contact calls with explicit consent, announce recording, and allow account owners to play or delete completed recordings.
- [x] Give paid customers a Stripe billing portal link for payment methods and cancellation.

## P2 — Customer calling and operations

- [x] Add individual Romanian mobile calling with consent records, destination checks, quiet hours, and opt-out handling.
- [ ] Add contact import and stronger consent evidence than a customer checkbox.
- [ ] Add call status callbacks, bridge/session IDs, failure reasons, and cost/usage logs so support can trace a call across Twilio and OpenAI.
- [x] Add account-scoped recent call history, playback, and manual recording deletion.
- [ ] Choose and implement automatic recording retention at Twilio, including older calls outside the recent history list. Decide whether transcripts are needed.
- [ ] Add plan limits for agents, phone numbers, and minutes, with a visible usage meter and overage behavior.
- [ ] Add safe number provisioning and country-specific requirements for premium customers. Keep number purchases disabled until the billing and ownership flow is complete.
- [ ] Test the whole funnel with real Romanian numbers and provider credentials: public demo, SMS verification, rate limits, GPT-Live call, Stripe signup, voice selection, recorded test call, customer call, and recording deletion.

## Existing pieces to reuse

- `api/telephony.js`: authenticated outbound calls, Twilio numbers, recordings, and test allowlist.
- `bridge/server.js`: Twilio Media Stream to GPT-Live audio relay.
- `public/identity.js`: agent identity, presentation, and opening/closing prompt fields.
- `public/dashboard.html` and `public/dashboard.js`: current deployed workspace and preview UI.

The visitor's test call is free **to the visitor**. Twilio and OpenAI still charge Masscall, which is why verification, call duration, and spend limits are P0 requirements.
