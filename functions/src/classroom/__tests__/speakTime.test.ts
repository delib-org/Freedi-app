import type { ClassTable } from '@freedi/shared-types';
import { DEFAULT_SPEAK_SECONDS } from '@freedi/shared-types';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/** IA 25.5: the speaking time is the lesson's setting; a running turn keeps its own length. */

const NOW = 1_800_000_000_000;
const SECOND = 1000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
		noDeviceMembers: [],
		step: 'talk',
		askerUid: 'a',
		turn: 1,
		questionId: 'q1',
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: ['q1'],
		askedUids: ['a'],
		updatedAt: 0,
		...overrides,
	};
}

function ctx(patch: Partial<TransitionContext> = {}): TransitionContext {
	return { actorUid: 'b', isAdmin: false, now: NOW, lessonStep: 'tableTalk', ...patch };
}

describe('claimSpeaker uses the lesson speaking time', () => {
	it('writes speakerEndsAt and speakerMs from the lesson setting', () => {
		const next = applyTableAction(
			table(),
			{ action: 'claimSpeaker' },
			ctx({ speakMs: 90 * SECOND }),
		);

		expect(next).toMatchObject({
			speakerUid: 'b',
			speakerEndsAt: NOW + 90 * SECOND,
			speakerMs: 90 * SECOND,
		});
	});

	it('falls back to two minutes when the lesson sets nothing', () => {
		const next = applyTableAction(table(), { action: 'claimSpeaker' }, ctx());

		expect(next.speakerMs).toBe(DEFAULT_SPEAK_SECONDS * SECOND);
		expect(next.speakerEndsAt).toBe(NOW + DEFAULT_SPEAK_SECONDS * SECOND);
	});

	it('a teacher naming the next speaker gets the same length', () => {
		const next = applyTableAction(
			table(),
			{ action: 'nextSpeaker', uid: 'c' },
			ctx({ actorUid: 'teacher', isAdmin: true, speakMs: 30 * SECOND }),
		);

		expect(next).toMatchObject({ speakerUid: 'c', speakerMs: 30 * SECOND });
		expect(next.speakerEndsAt).toBe(NOW + 30 * SECOND);
	});

	it('leaves the running turn alone when the setting changes: only the next claim sees it', () => {
		const first = applyTableAction(
			table(),
			{ action: 'claimSpeaker' },
			ctx({ speakMs: 60 * SECOND }),
		);
		const later = ctx({ actorUid: 'c', now: NOW + 61 * SECOND, speakMs: 300 * SECOND });
		const second = applyTableAction(first, { action: 'claimSpeaker' }, later);

		expect(first.speakerMs).toBe(60 * SECOND);
		expect(second.speakerMs).toBe(300 * SECOND);
	});

	it('clears speakerMs with the speaker when the table moves on', () => {
		const talking = applyTableAction(
			table(),
			{ action: 'claimSpeaker' },
			ctx({ speakMs: 60 * SECOND }),
		);
		const writing = applyTableAction(
			talking,
			{ action: 'toWrite' },
			ctx({ actorUid: 'a', now: NOW + 5 * SECOND }),
		);

		expect(writing.speakerMs).toBeUndefined();
	});
});
