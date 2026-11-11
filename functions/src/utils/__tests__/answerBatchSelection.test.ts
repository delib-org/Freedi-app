import { StatementType, type Statement } from '@freedi/shared-types';
import { resolveBatchSize, selectAnswerBatch, visibleAnswers } from '../answerBatchSelection';

const UID = 'me';

function answer(id: string, extra: Partial<Statement> = {}): Statement {
	return {
		statementId: id,
		statement: `Answer ${id}`,
		statementType: StatementType.option,
		parentId: 'q',
		topParentId: 'q',
		creatorId: 'someone',
		createdAt: 1,
		lastUpdate: 1,
		...extra,
	} as Statement;
}

function answers(count: number): Statement[] {
	return Array.from({ length: count }, (_, index) => answer(`a${index}`));
}

function ids(statements: Statement[]): string[] {
	return statements.map((statement) => statement.statementId);
}

describe('visibleAnswers', () => {
	it('leaves out hidden answers', () => {
		expect(ids(visibleAnswers([answer('a'), answer('b', { hide: true })]))).toEqual(['a']);
	});

	it('leaves out an answer merged into a hidden grouping too', () => {
		const merged = answer('a', { hide: true, integratedInto: 'synth' });

		expect(visibleAnswers([merged])).toEqual([]);
	});

	it('keeps a synthesis and drops a topic grouping', () => {
		const synth = answer('s', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: ['x'],
		});
		const topic = answer('t', { isCluster: true, derivedByPipeline: 'topic-cluster' });

		expect(ids(visibleAnswers([synth, topic]))).toEqual(['s']);
	});

	it('serves a live synthesis in place of the originals it merged', () => {
		const synth = answer('s', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: ['a'],
		});

		expect(ids(visibleAnswers([answer('a'), answer('b'), synth])).sort()).toEqual(['b', 's']);
	});
});

describe('selectAnswerBatch', () => {
	it('never offers the person their own answer, which they cannot rate', () => {
		const own = answer('own', { creatorId: UID });
		const byCreatorField = answer('own2', {
			creatorId: 'legacy',
			creator: { uid: UID } as Statement['creator'],
		});

		const batch = selectAnswerBatch({
			statements: [own, byCreatorField, answer('a')],
			ratedIds: [],
			uid: UID,
			size: 6,
		});

		expect(ids(batch.answers)).toEqual(['a']);
		expect(batch.totalAnswers).toBe(3);
	});

	it('leaves out rated answers', () => {
		const batch = selectAnswerBatch({
			statements: answers(3),
			ratedIds: ['a0', 'a2'],
			uid: UID,
			size: 6,
		});

		expect(ids(batch.answers)).toEqual(['a1']);
		expect(batch.hasMore).toBe(false);
	});

	it('counts rating an original as rating the synthesis that covers it', () => {
		const synth = answer('s', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: ['a'],
		});

		const batch = selectAnswerBatch({
			statements: [answer('a'), synth, answer('b')],
			ratedIds: ['a'],
			uid: UID,
			size: 6,
		});

		expect(ids(batch.answers)).toEqual(['b']);
	});

	it('does not put the strongest answer first every time, so order reveals no ranking', () => {
		const leader = answer('leader', {
			evaluation: {
				sumEvaluations: 9,
				sumSquaredEvaluations: 9,
				numberOfEvaluators: 9,
				agreement: 1,
			} as Statement['evaluation'],
			consensus: 1,
		});
		const firstIds = new Set<string>();

		for (let round = 0; round < 60; round++) {
			const batch = selectAnswerBatch({
				statements: [leader, ...answers(5)],
				ratedIds: [],
				uid: UID,
				size: 6,
			});
			firstIds.add(batch.answers[0].statementId);
		}

		expect(firstIds.size).toBeGreaterThan(1);
	});

	it('does not change the cached list it was given', () => {
		const statements = answers(4);
		const before = ids(statements);

		selectAnswerBatch({ statements, ratedIds: [], uid: UID, size: 2 });

		expect(ids(statements)).toEqual(before);
	});
});

describe('resolveBatchSize', () => {
	it('keeps a valid size and caps a large one', () => {
		expect(resolveBatchSize(4)).toBe(4);
		expect(resolveBatchSize(10_000)).toBe(20);
	});

	it('falls back on anything that is not a positive whole number', () => {
		expect(resolveBatchSize('9')).toBe(6);
		expect(resolveBatchSize(undefined)).toBe(6);
		expect(resolveBatchSize(NaN)).toBe(6);
	});
});
