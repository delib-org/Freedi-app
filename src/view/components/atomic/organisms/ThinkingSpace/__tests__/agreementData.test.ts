import { Statement } from '@freedi/shared-types';
import { agreementCandidates, proposalEvidence } from '../agreementData';
const option = (id: string, createdAt: number, score: number): Statement =>
	({
		statementId: id,
		statement: id,
		createdAt,
		consensus: score,
		evaluation: { numberOfEvaluators: 10, sumEvaluations: 5, agreement: score },
	}) as Statement;
it('ranks by consensus instead of recency and excludes hidden and thematic records', () => {
	const old = option('old', 1, 0.8),
		recent = option('new', 2, 0.2);
	expect(
		agreementCandidates(
			[
				recent,
				old,
				{ ...old, statementId: 'hidden', hide: true },
				{ ...old, statementId: 'theme', isCluster: true, derivedByPipeline: 'topic-cluster' },
				old,
			],
			true,
		).map((p) => p.statementId),
	).toEqual(['old', 'new']);
});
it('does not reveal hidden results through ranking order', () => {
	expect(
		agreementCandidates([option('new', 2, 0.9), option('old', 1, 0.1)], false).map(
			(p) => p.statementId,
		),
	).toEqual(['old', 'new']);
});
it('does not infer counts of opponents from summed magnitudes', () => {
	expect(proposalEvidence(option('one', 1, 0.4)).oppose).toBeUndefined();
});
