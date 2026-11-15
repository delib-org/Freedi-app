import type {
	ClassArriveByNameResponse,
	ClassNameAnswer,
	ClassNameChoice,
} from '@freedi/shared-types';

/**
 * The name gate of a connected lesson (IA tables-class-bridge 5.2): the student
 * writes the full name "as registered" and `classArriveByName` answers with one
 * of six outcomes. This file is the whole decision of what the screen does next,
 * with no Firebase and no DOM, so every outcome can be tested.
 */

/** What the gate screen shows. */
export type GateStep =
	/** The name field. */
	| { kind: 'ask' }
	/** "Someone already came in under this name. Is it you, on another device?" */
	| { kind: 'taken' }
	/** Two registrations share the name: pick by table. */
	| { kind: 'twice'; choices: ClassNameChoice[] }
	/** "We did not find a registration under this name": fix it, or join without. */
	| { kind: 'notFound' }
	/** In the lesson: the gate is finished, the stage takes over. */
	| { kind: 'done' };

export interface GateState {
	name: string;
	step: GateStep;
	/** A call is in flight. */
	saving: boolean;
	/** The last call failed (network or server): the form stays, the line says so. */
	failed: boolean;
}

export function initialGateState(name = ''): GateState {
	return { name, step: { kind: 'ask' }, saving: false, failed: false };
}

/**
 * The step an answer leads to. 'seated' and 'joined' finish the gate; so does
 * 'nameTwiceLater' (the student is in, without a seat, and picks by table when
 * the tables arrive: `deferredPick` tells the caller to remember that).
 */
export function stepOfResponse(response: ClassArriveByNameResponse): GateStep {
	switch (response.outcome) {
		case 'nameTaken':
			return { kind: 'taken' };
		case 'nameTwice':
			return { kind: 'twice', choices: response.choices };
		case 'notFound':
			return { kind: 'notFound' };
		case 'seated':
		case 'joined':
		case 'nameTwiceLater':
			return { kind: 'done' };
	}
}

/** The student is in, but two registrations share their name and no table is known yet. */
export function isDeferredPick(response: ClassArriveByNameResponse): boolean {
	return response.outcome === 'nameTwiceLater';
}

/** The full name to keep on this device after the answer, when the server gave one. */
export function arrivedName(response: ClassArriveByNameResponse): string | null {
	return response.outcome === 'seated' || response.outcome === 'joined' ? response.fullName : null;
}

/** The request of an answer: the first try carries no answer; each later button names its own. */
export function requestOf(
	mainId: string,
	fullName: string,
	answer?: ClassNameAnswer,
): { mainId: string; fullName: string; answer?: ClassNameAnswer } {
	return answer
		? { mainId, fullName: fullName.trim(), answer }
		: { mainId, fullName: fullName.trim() };
}

/** Back to the field with the name kept ("לתקן את השם"). */
export function backToAsk(state: GateState): GateState {
	return { ...state, step: { kind: 'ask' }, failed: false, saving: false };
}

/** The label key of one table choice (topic only when the registration has several). */
export function choiceLabelKey(choice: ClassNameChoice): string {
	return choice.topic ? 'opening.name_twice.choice' : 'opening.name_twice.choice_plain';
}
