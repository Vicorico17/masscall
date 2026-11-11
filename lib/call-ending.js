export const FINAL_SIGN_OFF = 'pupa vico. am plecat';
export const PROMOTION_WEBSITE = 'masscall.vercel.app';

export function closingInstructions(reason = 'goal_complete') {
  return [
    reason === 'caller_requested_end'
      ? 'The caller asked to stop. Skip promotion and further questions.'
      : `For a normally completed call (not a caller-requested stop), briefly invite the caller to visit ${PROMOTION_WEBSITE} to get Masscall voice AI agents. Use the selected language for this invitation.`,
    `Then say exactly "${FINAL_SIGN_OFF}" as your final words, in Romanian even if the rest of the call uses another language. Do not translate or replace this signature with a saved closing. Say it only when ending the call, never quote or discuss it during the conversation. Do not ask another question or wait for a reply. Stop speaking after it.`
  ].join(' ');
}

// Only assistant output is passed here. Keep a short tail, never a durable transcript.
export function hasFinalSignOff(text) {
  return /(?:^|\s)pupa\s+vico[\s,.!;:—-]+am\s+plecat[.!?\s]*$/iu.test(
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  );
}

// The deadline starts once and is never extended by duplicate tools or more audio.
export function createCallEnding({ finish, isPlaybackEmpty, schedule = setTimeout, cancel = clearTimeout, timeoutMs = 20000, drainMs = 1200 }) {
  let requested = false, speechStarted = false, closed = false;
  let deadline, drain, transcript = '';
  const clearDrain = () => { cancel(drain); drain = undefined; };
  const dispose = () => { closed = true; cancel(deadline); clearDrain(); transcript = ''; };
  const end = reason => { if (closed) return; dispose(); void finish(reason); };
  const request = () => {
    if (closed || requested) return false;
    requested = true;
    deadline = schedule(() => end('goodbye_timeout'), timeoutMs);
    return true;
  };
  const playbackChanged = () => {
    if (closed || !requested || !speechStarted) return;
    if (!isPlaybackEmpty()) { clearDrain(); return; }
    if (drain !== undefined) return;
    drain = schedule(() => {
      drain = undefined;
      if (isPlaybackEmpty()) end('assistant_goodbye_finished');
    }, drainMs);
  };
  return {
    request,
    get requested() { return requested; },
    audioStarted() { if (closed || !requested) return; speechStarted = true; clearDrain(); },
    playbackChanged,
    assistantTranscript(delta) {
      if (closed || typeof delta !== 'string') return false;
      transcript = (transcript + delta).slice(-500);
      if (!hasFinalSignOff(transcript)) return false;
      const first = request();
      speechStarted = true;
      playbackChanged();
      return first;
    },
    dispose
  };
}
