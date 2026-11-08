import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgoraStage, type AgoraStagePlanItem } from '@freedi/shared-types';

// The hand streams Firestore and asks a callable; neither runs in node
vi.mock('../firebase', () => ({ db: {}, doc: vi.fn(), onSnapshot: vi.fn(() => () => {}) }));
vi.mock('../callables', () => ({ dealNotes: vi.fn() }));
vi.mock('../flows/stageAccess', () => ({ canWriteStage: () => true }));

const sessionState = {
	session: null as unknown,
	myParticipant: null as unknown,
	participants: [] as unknown[],
};
vi.mock('../session', () => ({ getSessionState: () => sessionState }));

const delib = {
	proposals: [] as unknown[],
	answersByQuestion: {} as Record<string, unknown[]>,
	myRatings: {},
};
vi.mock('../proposals', () => ({ getDeliberationState: () => delib }));

import { visibleStationNotes } from '../hands';

const note = (statementId: string, creatorId: string) => ({
	statementId,
	creatorId,
	hidden: false,
});
const square: AgoraStagePlanItem = { itemId: 'd', stage: AgoraStage.deliberation };
const session = {
	sessionId: 's',
	teacherId: 'teacher',
	challengeQuestionId: 'cq',
	stage: AgoraStage.deliberation,
};
const eightStudents = Array.from({ length: 8 }, (_, i) => ({ userId: `u${i}` }));

describe('visibleStationNotes', () => {
	beforeEach(() => {
		sessionState.session = session;
		sessionState.participants = eightStudents;
		delib.proposals = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
			note(id, `author-${id}`),
		);
		delib.proposals.push(note('mine', 'u1'));
	});

	it('shows the teacher every note — a teacher has no hand', () => {
		sessionState.myParticipant = null;
		expect(visibleStationNotes(square)).toHaveLength(9);

		// Even a teacher who somehow holds a participant doc is not dealt to
		sessionState.myParticipant = { userId: 'teacher' };
		expect(visibleStationNotes(square)).toHaveLength(9);
	});

	it('shows a student only their own note until a hand is dealt', () => {
		sessionState.myParticipant = { userId: 'u1' };
		const shown = visibleStationNotes(square);
		expect(shown.map((n) => n.statementId)).toEqual(['mine']);
	});

	it('shows a student everything when the class is small', () => {
		sessionState.myParticipant = { userId: 'u1' };
		sessionState.participants = eightStudents.slice(0, 6);
		expect(visibleStationNotes(square)).toHaveLength(9);
	});
});
