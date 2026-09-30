import test from 'node:test';
import assert from 'node:assert/strict';
import {callReviewResults,normalizeCallReview} from '../public/call-review.js';

test('call review accepts only known outcomes and bounds follow-up notes',()=>{
 const review=normalizeCallReview({result:'follow_up',nextStep:'Send the requested service details.',followUpAt:'2026-10-02',notes:'Asked for a call next week.',reviewedAt:'2026-09-30T12:00:00.000Z'});
 assert.deepEqual(review,{result:'follow_up',nextStep:'Send the requested service details.',followUpAt:'2026-10-02',notes:'Asked for a call next week.',reviewedAt:'2026-09-30T12:00:00.000Z'});
 assert.equal(normalizeCallReview({result:'made_up',nextStep:'x'.repeat(500),notes:'n'.repeat(1100)}).result,'');
 assert.equal(normalizeCallReview({result:callReviewResults[0].id,nextStep:'x'.repeat(500),notes:'n'.repeat(1100)}).nextStep.length,400);
 assert.equal(normalizeCallReview({followUpAt:'2026-02-30'}).followUpAt,'');
});
