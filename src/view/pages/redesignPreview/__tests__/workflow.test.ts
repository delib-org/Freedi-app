import {
	initialWorkflow,
	workflowReducer,
	evidence,
	reviewReadiness,
	rankProposals,
	Workflow,
} from '../workflowModel';

const draft = (): Workflow =>
	workflowReducer(initialWorkflow, { type: 'clause', id: 'trial', clauseId: 'clause-1' });
describe('Covenant review integrity', () => {
	it('keeps source votes on their version when wording changes', () => {
		const old = initialWorkflow.proposals[0];
		const state = workflowReducer(initialWorkflow, {
			type: 'add',
			proposal: { ...old, id: 'revision', previousId: old.id, text: 'A different trial' },
		});
		expect(state.proposals.at(-1)?.votes).toEqual({});
		expect(state.proposals[0].votes).toEqual(old.votes);
	});
	it('counts a changed evaluation once', () => {
		let state = workflowReducer(initialWorkflow, { type: 'rate', id: 'trial', value: 1 });
		state = workflowReducer(state, { type: 'rate', id: 'trial', value: -1 });
		expect(evidence(state.proposals[0].votes).n).toBe(21);
		expect(evidence(state.proposals[0].votes).oppose).toBe(1);
	});
	it('does not open review of an empty covenant', () => {
		expect(workflowReducer(initialWorkflow, { type: 'review' })).toBe(initialWorkflow);
	});
	it('locks reviewed wording and keeps historical positions separate', () => {
		let state = workflowReducer(draft(), { type: 'review' });
		state = workflowReducer(state, { type: 'position', position: 'no-objection' });
		const locked = state;
		expect(
			workflowReducer(state, {
				type: 'amend',
				id: 'clause-1',
				text: 'Changed',
				reason: 'Maintenance',
			}),
		).toBe(locked);
		state = workflowReducer(state, { type: 'reopen' });
		state = workflowReducer(state, {
			type: 'amend',
			id: 'clause-1',
			text: 'Changed',
			reason: 'Maintenance',
		});
		state = workflowReducer(state, { type: 'review' });
		expect(state.versions[0].positions.you).toBe('no-objection');
		expect(state.versions[0].clauses[0].text).not.toBe('Changed');
		expect(state.versions[1].positions).toEqual({});
		expect(state.versions[1].clauses[0].text).toBe('Changed');
	});
	it('never resolves someone else’s objection', () => {
		const state = workflowReducer(initialWorkflow, {
			type: 'resolve',
			id: 'garden',
			concernId: 'care',
		});
		expect(state.proposals.find((p) => p.id === 'garden')?.concerns[0].resolved).toBe(false);
	});
	it('does not mistake an enthusiastic small sample for the strongest common ground', () => {
		expect(rankProposals(initialWorkflow.proposals)[0].id).not.toBe('bench');
		expect(evidence(initialWorkflow.proposals.find((p) => p.id === 'bench')!.votes).mean).toBe(1);
	});
});

it('requires all responses, broad endorsement and no objections before adoption', () => {
	let state = workflowReducer(draft(), { type: 'review' });
	state = workflowReducer(state, { type: 'example-responses' });
	expect(reviewReadiness(state)).toBe(false);
	expect(workflowReducer(state, { type: 'adopt' })).toBe(state);
	state = workflowReducer(state, { type: 'position', position: 'object' });
	expect(reviewReadiness(state)).toBe(false);
	expect(workflowReducer(state, { type: 'adopt' })).toBe(state);
	state = workflowReducer(state, { type: 'position', position: 'no-objection' });
	expect(reviewReadiness(state)).toBe(true);
	state = workflowReducer(state, { type: 'adopt' });
	expect(state.phase).toBe('adopted');
	expect(workflowReducer(state, { type: 'position', position: 'object' })).toBe(state);
	state = workflowReducer(workflowReducer(state, { type: 'reopen' }), { type: 'review' });
	expect(state.versions[0].adopted).toBe(true);
	expect(state.versions[1].positions).toEqual({});
	expect(state.versions[1].adopted).toBeUndefined();
});
it('keeps the agreed endorsement threshold when review begins', () => {
	let state = workflowReducer(initialWorkflow, { type: 'target', value: 90 });
	state = workflowReducer(state, { type: 'clause', id: 'trial', clauseId: 'c' });
	state = workflowReducer(state, { type: 'review' });
	state = workflowReducer(state, { type: 'example-responses' });
	state = workflowReducer(state, { type: 'position', position: 'endorse' });
	expect(reviewReadiness(state)).toBe(false);
	expect(workflowReducer(state, { type: 'target', value: 80 })).toBe(state);
});
