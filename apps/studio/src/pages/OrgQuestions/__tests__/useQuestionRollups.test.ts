import { describe, it, expect } from 'vitest';
import type { QuestionProgress, Statement } from '@freedi/shared-types';
import type { ProgressMap } from '@/db/progress';
import { computeQuestionRollups } from '../useQuestionRollups';

function question(overrides: Partial<Statement>): Statement {
	return {
		statementId: 'q1',
		statement: 'Main question',
		parentId: 'top',
		topParentId: 'q1',
		lastUpdate: 1000,
		createdAt: 500,
		...overrides,
	} as Statement;
}

function progress(overrides: Partial<QuestionProgress>): QuestionProgress {
	return {
		statementId: 'q1',
		topParentId: 'q1',
		entered: 0,
		suggested: 0,
		evaluated: 0,
		options: 0,
		evaluations: 0,
		lastActivity: 0,
		lastUpdate: 0,
		...overrides,
	};
}

describe('computeQuestionRollups', () => {
	it('uses the question’s own progress doc for the funnel and counts activities from sub-question docs', () => {
		const map: ProgressMap = {
			q1: progress({ entered: 10, suggested: 4, evaluated: 2, lastActivity: 9000 }),
			a1: progress({ statementId: 'a1', topParentId: 'q1' }),
			a2: progress({ statementId: 'a2', topParentId: 'q1' }),
			other: progress({ statementId: 'other', topParentId: 'q2' }),
		};
		const [rollup] = computeQuestionRollups([question({ numberOfMembers: 7 })], map);

		expect(rollup.progress).toEqual({ entered: 10, suggested: 4, evaluated: 2 });
		expect(rollup.activityCount).toBe(2);
		expect(rollup.memberCount).toBe(7);
		expect(rollup.lastActivityAt).toBe(9000);
		expect(rollup.engines).toEqual([]);
		expect(rollup.status).toBe('open');
	});

	it('falls back to zero counts and the statement timestamps without a progress doc', () => {
		const [rollup] = computeQuestionRollups(
			[question({ lastChildUpdate: 4000, lastUpdate: 3000 })],
			{},
		);

		expect(rollup.progress).toEqual({ entered: 0, suggested: 0, evaluated: 0 });
		expect(rollup.activityCount).toBe(0);
		expect(rollup.memberCount).toBe(0);
		expect(rollup.lastActivityAt).toBe(4000);
	});

	it('maps the stored questionStatus to a run state', () => {
		const rollups = computeQuestionRollups(
			[
				question({ statementId: 'a', statementSettings: { questionStatus: 'closed' } }),
				question({ statementId: 'b', statementSettings: { questionStatus: 'frozen' } }),
				question({ statementId: 'c', statementSettings: { questionStatus: 'live' } }),
			],
			{},
		);

		expect(rollups.map((r) => r.status)).toEqual(['closed', 'frozen', 'open']);
	});
});

describe('computeQuestionRollups — linked questions', () => {
	const map: ProgressMap = { q1: progress({}) };

	it('leaves an owned question unmarked', () => {
		const [rollup] = computeQuestionRollups([question({})], map, {});

		expect(rollup.linked).toBe(false);
		expect(rollup.title).toBe('Main question');
		expect(rollup.realTitle).toBeUndefined();
	});

	it('shows the board name and keeps the real title alongside it', () => {
		const [rollup] = computeQuestionRollups([question({})], map, {
			q1: { label: 'Budget round' },
		});

		expect(rollup.linked).toBe(true);
		expect(rollup.title).toBe('Budget round');
		expect(rollup.realTitle).toBe('Main question');
	});

	it('marks a linked question with no board name and keeps its own title', () => {
		const [rollup] = computeQuestionRollups([question({})], map, { q1: {} });

		expect(rollup.linked).toBe(true);
		expect(rollup.title).toBe('Main question');
		expect(rollup.realTitle).toBeUndefined();
	});

	it('does not repeat the title when the board name matches it', () => {
		const [rollup] = computeQuestionRollups([question({})], map, {
			q1: { label: 'Main question' },
		});

		expect(rollup.title).toBe('Main question');
		expect(rollup.realTitle).toBeUndefined();
	});

	it('falls back to the real title when the board name is blank', () => {
		const [rollup] = computeQuestionRollups([question({})], map, { q1: { label: '   ' } });

		expect(rollup.title).toBe('Main question');
		expect(rollup.realTitle).toBeUndefined();
	});
});

describe('computeQuestionRollups — a linked crowd survey', () => {
	it("uses Mass Consensus's numbers, not the funnel's, when they exist", () => {
		// The funnel counters read as almost nothing for a survey: answering
		// through the survey flow leaves no per-statement trail.
		const map: ProgressMap = { q1: progress({ entered: 1, suggested: 8, evaluated: 22 }) };
		const [rollup] = computeQuestionRollups([question({ statementId: 'q1' })], map, {
			q1: {
				questionIds: ['q1'],
				surveyStats: { entered: 26, responded: 20, completed: 12 },
			},
		});

		expect(rollup.progress).toEqual({ entered: 26, suggested: 20, evaluated: 12 });
	});

	it('counts a linked survey as one activity, not as its missing children', () => {
		const [rollup] = computeQuestionRollups(
			[question({ statementId: 'q1' })],
			{},
			{
				q1: { surveyStats: { entered: 3, responded: 2, completed: 1 } },
			},
		);

		expect(rollup.activityCount).toBe(1);
	});

	it('sums the covered questions when the survey has no stats yet', () => {
		const map: ProgressMap = {
			q1: progress({ statementId: 'q1', entered: 1, suggested: 8, evaluated: 22 }),
			q2: progress({ statementId: 'q2', entered: 2, suggested: 10, evaluated: 19 }),
		};
		const [rollup] = computeQuestionRollups([question({ statementId: 'q1' })], map, {
			q1: { questionIds: ['q1', 'q2'] },
		});

		expect(rollup.progress).toEqual({ entered: 3, suggested: 18, evaluated: 41 });
	});

	it("still reads an owned question's own record", () => {
		const map: ProgressMap = { q1: progress({ entered: 5, suggested: 2, evaluated: 1 }) };
		const [rollup] = computeQuestionRollups([question({ statementId: 'q1' })], map, {});

		expect(rollup.progress).toEqual({ entered: 5, suggested: 2, evaluated: 1 });
	});
});
