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
