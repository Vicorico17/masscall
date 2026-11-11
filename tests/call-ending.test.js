import test from 'node:test';
import assert from 'node:assert/strict';
import { createCallEnding, closingInstructions, hasFinalSignOff } from '../lib/call-ending.js';

function harness() {
  let now = 0, next = 0, empty = true;
  const timers = new Map(), finished = [];
  const ending = createCallEnding({
    finish: reason => finished.push(reason), isPlaybackEmpty: () => empty,
    schedule(fn, delay) { const id = ++next; timers.set(id, { fn, at: now + delay }); return id; },
    cancel(id) { timers.delete(id); }
  });
  return {
    ending, finished, timers,
    setEmpty(value) { empty = value; ending.playbackChanged(); },
    tick(ms) {
      const target = now + ms;
      while (true) {
        const due = [...timers].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; timers.delete(due[0]); due[1].fn();
      }
      now = target;
    }
  };
}

test('normal silence never ends an unfinished call', () => {
  const h = harness();
  h.ending.audioStarted(); h.ending.assistantTranscript('Aveți un moment?');
  h.setEmpty(true); h.tick(60000);
  assert.deepEqual(h.finished, []);
});

test('end tool waits for speech and acknowledged playback, including resumed audio', () => {
  const h = harness();
  h.ending.request(); h.setEmpty(true); h.tick(2000);
  assert.deepEqual(h.finished, []);
  h.setEmpty(false); h.ending.audioStarted(); h.tick(2000);
  assert.deepEqual(h.finished, []);
  h.setEmpty(true); h.tick(1000);
  h.ending.audioStarted(); h.setEmpty(false); h.tick(500);
  assert.deepEqual(h.finished, []);
  h.setEmpty(true); h.tick(1200);
  assert.deepEqual(h.finished, ['assistant_goodbye_finished']);
  h.tick(30000);
  assert.equal(h.finished.length, 1);
  assert.equal(h.timers.size, 0);
});

test('signature split across transcript fragments ends a call even without its tool', () => {
  const h = harness(); h.setEmpty(false);
  assert.equal(h.ending.assistantTranscript('Vizitați Masscall. Pu'), false);
  assert.equal(h.ending.assistantTranscript('pa Vico. Am ple'), false);
  assert.equal(h.ending.assistantTranscript('cat!'), true);
  h.tick(2000); assert.deepEqual(h.finished, []);
  h.setEmpty(true); h.tick(1200);
  assert.deepEqual(h.finished, ['assistant_goodbye_finished']);
});

test('duplicate end requests cannot reset the deadline when speech or marks never arrive', () => {
  for (const blocked of [false, true]) {
    const h = harness(); h.setEmpty(!blocked);
    assert.equal(h.ending.request(), true);
    h.tick(15000);
    assert.equal(h.ending.request(), false);
    h.ending.audioStarted(); h.tick(5000);
    assert.deepEqual(h.finished, ['goodbye_timeout']);
    h.ending.request(); h.tick(30000);
    assert.equal(h.finished.length, 1);
  }
});

test('disconnect cancels every pending hangup and clears transcript state', () => {
  const h = harness(); h.ending.request(); h.ending.audioStarted(); h.setEmpty(true);
  h.ending.dispose(); h.tick(30000);
  assert.deepEqual(h.finished, []);
  assert.equal(h.ending.assistantTranscript('pupa vico. am plecat'), false);
  assert.equal(h.timers.size, 0);
});

test('recognizes only the complete signature at the end, allowing speech punctuation', () => {
  assert.equal(hasFinalSignOff('Pupă Vico, am plecat!'), true);
  for (const text of ['am plecat', 'pupa vico', 'pupa vico. am plecat este o expresie', '"pupa vico. am plecat"']) {
    assert.equal(hasFinalSignOff(text), false, text);
  }
});

test('closing promotes Masscall before the exact signature and skips promotion for a stop', () => {
  assert.match(closingInstructions(), /masscall\.vercel\.app.*pupa vico\. am plecat/);
  assert.match(closingInstructions('caller_requested_end'), /Skip promotion/);
  assert.doesNotMatch(closingInstructions('caller_requested_end'), /masscall\.vercel\.app/);
  assert.match(closingInstructions('caller_requested_end'), /pupa vico\. am plecat/);
});
