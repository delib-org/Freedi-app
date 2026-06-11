import { buildParticipationSummary } from '../privacyExportUtils';
import { Statement, Evaluation } from '@freedi/shared-types';

jest.mock('@/controllers/db/config', () => ({ FireStore: {} }));

function makeStatement(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'q1',
		statement: 'Test question',
		creatorId: 'admin',
		...overrides,
	} as Statement;
}

function makeOption(
	statementId: string,
	creatorId: string,
	extra: Partial<Statement> = {},
): Statement {
	return makeStatement({ statementId, creatorId, parentId: 'q1', ...extra });
}

/** Explicit rating: carries an evaluator object, like real swipe/main-app ratings */
function makeEvaluation(statementId: string, evaluatorId: string, value = 1): Evaluation {
	return {
		parentId: 'q1',
		statementId,
		evaluatorId,
		evaluator: { uid: evaluatorId, displayName: evaluatorId },
		evaluation: value,
	} as Evaluation;
}

/** Auto +1 self-vote written on solution submit: evaluatorId only, no evaluator object */
function makeAutoSelfVote(statementId: string, evaluatorId: string): Evaluation {
	return {
		parentId: 'q1',
		statementId,
		evaluatorId,
		evaluation: 1,
	} as Evaluation;
}

describe('privacyExportUtils', () => {
	describe('buildParticipationSummary', () => {
		it('counts distinct suggesters and explicit evaluators', () => {
			const parent = makeStatement({});
			const options = [
				makeOption('o1', 'userA'),
				makeOption('o2', 'userA'),
				makeOption('o3', 'userB'),
			];
			const evaluations = [
				makeEvaluation('o1', 'userB'),
				makeEvaluation('o2', 'userC'),
				makeEvaluation('o3', 'userC'),
			];

			const result = buildParticipationSummary(parent, options, evaluations);

			expect(result.suggestedCount).toBe(2); // userA, userB
			expect(result.evaluatedCount).toBe(2); // userB, userC
			expect(result.totalParticipants).toBe(3); // userA, userB, userC
		});

		it('does not count auto +1 self-votes as evaluating, but counts them as participating', () => {
			const parent = makeStatement({});
			const options = [makeOption('o1', 'userA')];
			const evaluations = [
				makeAutoSelfVote('o1', 'userA'),
				makeEvaluation('o1', 'userB'),
				// userC only has an auto +1 row (e.g. their own solution was later hidden)
				makeAutoSelfVote('o2', 'userC'),
			];

			const result = buildParticipationSummary(parent, options, evaluations);

			expect(result.evaluatedCount).toBe(1); // only userB actively rated
			expect(result.totalParticipants).toBe(3); // userA, userB, userC
		});

		it('excludes pipeline-derived options from suggesters', () => {
			const parent = makeStatement({});
			const options = [
				makeOption('o1', 'userA'),
				makeOption('cluster1', 'userB', { isCluster: true }),
				makeOption('synth1', 'botUser', { derivedByPipeline: 'synthesis' } as Partial<Statement>),
			];

			const result = buildParticipationSummary(parent, options, []);

			expect(result.suggestedCount).toBe(1); // only userA's genuine option
		});

		it('returns null enteredCount when view tracking is unavailable', () => {
			const parent = makeStatement({});

			const result = buildParticipationSummary(parent, [], []);

			expect(result.enteredCount).toBeNull();
		});

		it('uses recorded views for enteredCount, never below total participants', () => {
			const parent = makeStatement({ viewed: { individualViews: 2 } });
			const options = [makeOption('o1', 'userA'), makeOption('o2', 'userB')];
			const evaluations = [makeEvaluation('o1', 'userC')];

			const result = buildParticipationSummary(parent, options, evaluations);

			// 3 participants > 2 recorded views → clamp up to participants
			expect(result.enteredCount).toBe(3);
		});

		it('reports recorded views when they exceed participants', () => {
			const parent = makeStatement({ viewed: { individualViews: 18 } });
			const options = [makeOption('o1', 'userA')];
			const evaluations = [makeEvaluation('o1', 'userB')];

			const result = buildParticipationSummary(parent, options, evaluations);

			expect(result.enteredCount).toBe(18);
			expect(result.totalParticipants).toBe(2);
		});

		it('falls back to creator.uid when creatorId is missing', () => {
			const parent = makeStatement({});
			const option = makeStatement({
				statementId: 'o1',
				creatorId: '',
				creator: { uid: 'userX', displayName: 'X' },
			} as Partial<Statement>);

			const result = buildParticipationSummary(parent, [option], []);

			expect(result.suggestedCount).toBe(1);
		});
	});
});
