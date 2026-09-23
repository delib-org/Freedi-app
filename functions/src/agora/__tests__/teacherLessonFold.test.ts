import { describe, it, expect, jest } from '@jest/globals';
import type { Transaction } from 'firebase-admin/firestore';
import type { AgoraSession } from '@freedi/shared-types';

jest.mock('../../db', () => ({
	db: { collection: () => ({ doc: (id: string) => ({ id }) }) },
}));

import { foldTeacherLessonTx } from '../aggregates';

const session = {
	sessionId: 's1',
	teacherId: 't1',
	createdAt: 1_000,
	lastUpdate: 2_000,
} as unknown as AgoraSession;

describe('foldTeacherLessonTx', () => {
	it('a room nobody joined is not a lesson: nothing is written', () => {
		const set = jest.fn();
		const agg = foldTeacherLessonTx(
			{ set } as unknown as Transaction,
			session,
			0,
			undefined,
			3_000,
		);

		expect(set).not.toHaveBeenCalled();
		expect(agg.lessonsRun).toBe(0);
	});
});
