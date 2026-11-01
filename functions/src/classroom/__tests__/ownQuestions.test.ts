import type { ClassTable, ClassTableAction } from '@freedi/shared-types';
import { ClassroomError } from '../classroomErrors';
import { applyTableAction, TransitionContext } from '../tableTransitions';

/** IA 25.4: with own questions off, a table cannot pick or claim a question a student wrote. */

const NOW = 1_800_000_000_000;

function table(overrides: Partial<ClassTable> = {}): ClassTable {
	return {
		tableId: 'm--1',
		mainId: 'm',
		n: 1,
		memberUids: ['a', 'b', 'c'],
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

function ctx(patch: Partial<TransitionContext> = {}): TransitionContext {
	return { actorUid: 'a', isAdmin: false, now: NOW, lessonStep: 'tableTalk', ...patch };
}

function reasonOf(t: ClassTable, action: ClassTableAction, c: TransitionContext): string | null {
	try {
		applyTableAction(t, action, c);
	} catch (error) {
		if (error instanceof ClassroomError) return error.reason ?? error.code;
		throw error;
	}

	return null;
}

const claim: ClassTableAction = { action: 'claimTurn', fromTurn: 1, questionId: 'own1' };

describe('own questions off', () => {
	it('refuses claiming a table-written question', () => {
		const c = ctx({ questionIsOwn: true, allowOwnQuestions: false });

		expect(reasonOf(table(), claim, c)).toBe('own-questions-off');
	});

	it('refuses picking a table-written question', () => {
		const c = ctx({ questionIsOwn: true, allowOwnQuestions: false });

		expect(reasonOf(table(), { action: 'pickQuestion', questionId: 'own1' }, c)).toBe(
			'own-questions-off',
		);
	});

	it("still allows the teacher's own questions", () => {
		const c = ctx({ questionIsOwn: false, allowOwnQuestions: false });

		expect(reasonOf(table(), { ...claim, questionId: 'q1' }, c)).toBeNull();
	});

	it('allows own questions when the setting is on or absent', () => {
		expect(
			reasonOf(table(), claim, ctx({ questionIsOwn: true, allowOwnQuestions: true })),
		).toBeNull();
		expect(reasonOf(table(), claim, ctx({ questionIsOwn: true }))).toBeNull();
	});
});
