import { mapEvidence } from '../PreviewMaps';
import { Proposal } from '../workflowModel';

const proposal = (votes: Record<string, number>): Proposal => ({
	id: 'test',
	text: 'Test',
	theme: 'Test',
	author: 'Test',
	votes,
	concerns: [],
});

it('distinguishes polarized opinions from neutral opinions with the same mean', () => {
	expect(mapEvidence(proposal({ a: 1, b: -1 }))).toMatchObject({
		mean: 0,
		mad: 1,
		n: 2,
		pro: 1,
		con: 1,
	});
	expect(mapEvidence(proposal({ a: 0, b: 0 }))).toMatchObject({
		mean: 0,
		mad: 0,
		n: 2,
		pro: 0,
		con: 0,
	});
});
it('keeps partial rating weight separate from the number of evaluators', () => {
	expect(mapEvidence(proposal({ a: 0.5, b: -0.5 }))).toMatchObject({ pro: 0.5, con: 0.5, n: 2 });
	expect(mapEvidence(proposal({})).n).toBe(0);
});
