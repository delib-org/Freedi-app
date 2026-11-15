import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { MAX_TABLE_SIZE, choosing, moveOnNeeded, tableDone } from '@freedi/shared-types';
import { applyTableAction, TransitionContext } from '../tableTransitions';
import { removeMember } from '../tableMembership';

/**
 * Talking in turns at a table of up to 20 (Tal, 2026-11-15): turns always, at
 * any size, no free-talk mode. A full table of MAX_TABLE_SIZE runs every turn
 * to the end, and reserved seats (people not here yet) never hold a turn up.
 */

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const SPEECH_MS = 1000;
const members = Array.from({ length: MAX_TABLE_SIZE }, (_, i) => `m${i}`);

function bigTable(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: [...members],
		noDeviceMembers: [],
		step: 'pick',
		askerUid: null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: 0,
		...overrides,
	};
}

const as = (
	actorUid: string,
	now: number,
	lessonStep: 'tableTalk' | 'proposals' = 'tableTalk',
): TransitionContext => ({
	actorUid,
	isAdmin: false,
	now,
	lessonStep,
	speakMs: MINUTE,
});

describe('a table of 20 at Table talk', () => {
	it('runs twenty turns, each asker asks once and everyone answers, to the end', () => {
		let t = bigTable({ reservedSeats: [{ seatId: 's1', name: 'Not here yet' }] });
		let clock = NOW;
		const act = (uid: string, action: ClassTableAction): void => {
			clock += SPEECH_MS;
			t = applyTableAction(t, action, as(uid, clock));
		};

		members.forEach((asker, turnIndex) => {
			expect(choosing(t, clock)).toBe(true);
			act(asker, { action: 'claimTurn', fromTurn: t.turn, questionId: `own-${turnIndex}` });
			expect(t).toMatchObject({ step: 'talk', askerUid: asker, turn: turnIndex + 1 });
			for (const uid of [...members.filter((m) => m !== asker), asker]) {
				act(uid, { action: 'claimSpeaker' });
				act(uid, { action: 'finishSpeaking' });
			}
		});

		expect(t.askedUids).toHaveLength(MAX_TABLE_SIZE);
		expect(tableDone(t, clock)).toBe(true);
	});

	it('a tablemate who leaves mid-turn does not stop the turn', () => {
		let t = applyTableAction(
			bigTable(),
			{ action: 'claimTurn', fromTurn: 1, questionId: 'q' },
			as('m0', NOW),
		);
		t = removeMember(t, 'm19', NOW, 'tableTalk');
		for (const uid of members.slice(1, 19)) {
			t = applyTableAction(t, { action: 'passSpeaking' }, as(uid, NOW + 1));
		}
		t = applyTableAction(t, { action: 'passSpeaking' }, as('m0', NOW + 2));

		expect(choosing(t, NOW + 3)).toBe(true);
	});

	it('moves on with two presses at any size', () => {
		expect(moveOnNeeded(MAX_TABLE_SIZE)).toBe(2);
	});
});
