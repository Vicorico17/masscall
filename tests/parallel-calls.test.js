import test from 'node:test';
import assert from 'node:assert/strict';
import { parallelCallRequests } from '../public/parallel-calls.js';

const setup = {from:'+14155550104',objective:'Confirm appointment',agent:{name:'Ana'},callPlan:{category:'Wrong category',personNotes:'Private notes for someone else',opening:'Hello',completionTrigger:'Confirmed'}};

test('two-call test validates both destinations before dialing', () => {
  for (const numbers of [['+40700000101'], ['+40700000101','bad'], ['+40700000101','+40 700 000 101']]) {
    assert.throws(() => parallelCallRequests(setup, numbers));
  }
  assert.throws(() => parallelCallRequests({...setup,from:''}, ['+40700000101','+40700000102']));
});

test('parallel recipients get separate contexts and never inherit another selected person', () => {
  const requests = parallelCallRequests(setup, ['+40 700 000 101','+40700000102'], [{phone:'+40700000101',name:'Maria',category:'Customers',notes:'Maria only'}]);
  assert.equal(requests[0].contact,'Maria');
  assert.equal(requests[0].callPlan.personNotes,'Maria only');
  assert.equal(requests[1].contact,'');
  assert.equal(requests[1].callPlan.personNotes,'');
  assert.equal(requests[1].callPlan.category,'');
  assert.equal(requests[0].objective,setup.objective);
  requests[0].agent.name='Changed'; requests[0].callPlan.opening='Changed';
  assert.equal(requests[1].agent.name,'Ana');
  assert.equal(setup.agent.name,'Ana');
  assert.equal(requests[1].callPlan.opening,'Hello');
});
