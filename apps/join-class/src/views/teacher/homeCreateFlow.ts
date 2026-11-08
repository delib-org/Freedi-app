/**
 * The create area of the teacher home as a pure state machine (IA 13.15.2,
 * UX 13.D.5 / 13.D.7). No DOM, no Firebase: the view reads `step`, asks the
 * functions below for the next state and, for a back move, where focus goes.
 *
 *   idle -> choose -> nameNew
 *                  -> pick -> nameCopy (via 'pick')
 *   idle -> nameCopy (via 'row', the row's "new lesson, same questions")
 *
 * With no lessons there is nothing to copy: `openCreate` goes straight to
 * `nameNew`, which has no back step.
 */

export type CreateStep =
	| { kind: 'idle' }
	| { kind: 'choose' }
	| { kind: 'nameNew' }
	| { kind: 'pick' }
	| { kind: 'nameCopy'; sourceId: string; via: 'pick' | 'row' };

export type CreateFailure = 'invalid' | 'failed' | 'not_yours';

export interface CreateFlow {
	step: CreateStep;
	busy: boolean;
	error: CreateFailure | null;
	/** Id of the lesson this copy form will make; kept while the form is open so a retry reuses it. */
	copyId: string | null;
}

/** Where focus goes after a move (UX 13.D.7). `row*` targets name a lesson; the view falls back when it is gone. */
export type FocusTarget =
	| { kind: 'newButton' }
	| { kind: 'choiceNew' }
	| { kind: 'choicePrevious' }
	| { kind: 'pickLead' }
	| { kind: 'input' }
	| { kind: 'pickRow'; id: string }
	| { kind: 'rowCopy'; id: string };

export interface FlowMove {
	flow: CreateFlow;
	focus: FocusTarget;
}

export const IDLE_FLOW: CreateFlow = {
	step: { kind: 'idle' },
	busy: false,
	error: null,
	copyId: null,
};

function at(step: CreateStep, copyId: string | null = null): CreateFlow {
	return { step, busy: false, error: null, copyId };
}

/** "+ שיעור חדש": the question, or the name field when there is nothing to copy. */
export function openCreate(flow: CreateFlow, lessonCount: number): FlowMove {
	if (flow.step.kind !== 'idle') return { flow, focus: { kind: 'input' } };
	if (lessonCount === 0) return { flow: at({ kind: 'nameNew' }), focus: { kind: 'input' } };

	return { flow: at({ kind: 'choose' }), focus: { kind: 'choiceNew' } };
}

/** "שאלות חדשות". */
export function chooseNew(flow: CreateFlow): FlowMove {
	if (flow.step.kind !== 'choose') return { flow, focus: { kind: 'input' } };

	return { flow: at({ kind: 'nameNew' }), focus: { kind: 'input' } };
}

/** "שאלות משיעור קודם": the list switches to pick mode. */
export function choosePrevious(flow: CreateFlow): FlowMove {
	if (flow.step.kind !== 'choose') return { flow, focus: { kind: 'pickLead' } };

	return { flow: at({ kind: 'pick' }), focus: { kind: 'pickLead' } };
}

/** "בחירה" on a row in pick mode. `newId` is the id this copy will own. */
export function pickSource(flow: CreateFlow, sourceId: string, newId: string): FlowMove {
	if (flow.step.kind !== 'pick' || flow.busy) return { flow, focus: { kind: 'input' } };

	return { flow: at({ kind: 'nameCopy', sourceId, via: 'pick' }, newId), focus: { kind: 'input' } };
}

/** A row's "שיעור חדש עם אותן שאלות". Replaces any open step (and drops its lesson id). */
export function copyFromRow(flow: CreateFlow, sourceId: string, newId: string): FlowMove {
	if (flow.busy) return { flow, focus: { kind: 'input' } };

	return { flow: at({ kind: 'nameCopy', sourceId, via: 'row' }, newId), focus: { kind: 'input' } };
}

/** Escape / "ביטול": one step back, and the control that opened the step gets focus. Ignored while busy. */
export function back(flow: CreateFlow, lessonCount: number): FlowMove {
	const { step } = flow;
	if (flow.busy) return { flow, focus: { kind: 'input' } };
	switch (step.kind) {
		case 'choose':
			return { flow: IDLE_FLOW, focus: { kind: 'newButton' } };
		case 'nameNew':
			// the empty state's only form has nowhere to go back to
			return lessonCount === 0
				? { flow, focus: { kind: 'input' } }
				: { flow: at({ kind: 'choose' }), focus: { kind: 'choiceNew' } };
		case 'pick':
			return { flow: at({ kind: 'choose' }), focus: { kind: 'choicePrevious' } };
		case 'nameCopy':
			return step.via === 'pick'
				? { flow: at({ kind: 'pick' }), focus: { kind: 'pickRow', id: step.sourceId } }
				: { flow: IDLE_FLOW, focus: { kind: 'rowCopy', id: step.sourceId } };
		default:
			return { flow, focus: { kind: 'newButton' } };
	}
}

/** "יצירה": busy blocks a second submit. Returns null when a submit must not start. */
export function startSubmit(flow: CreateFlow): CreateFlow | null {
	if (flow.busy) return null;
	if (flow.step.kind !== 'nameNew' && flow.step.kind !== 'nameCopy') return null;

	return { ...flow, busy: true, error: null };
}

/** A submit ended badly: the form stays, the typed name stays, "יצירה" is enabled again. */
export function failSubmit(flow: CreateFlow, failure: CreateFailure): CreateFlow {
	return { ...flow, busy: false, error: failure };
}

/** The user typed again: a shown "invalid" goes away (a server failure stays until the next submit). */
export function clearInvalid(flow: CreateFlow): CreateFlow {
	return flow.error === 'invalid' ? { ...flow, error: null } : flow;
}

/** A Firebase callable error with the code the server answered. */
export function failureOf(error: unknown): CreateFailure {
	const code =
		typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : '';

	return code === 'functions/permission-denied' ? 'not_yours' : 'failed';
}

/** True while the list is in pick mode (the rows show "בחירה" instead of their actions). */
export function isPicking(flow: CreateFlow): boolean {
	return flow.step.kind === 'pick';
}
