/**
 * The "join your class" step a student meets ONCE per class (and once per
 * device switch): a class game admits roster members only, so a join refused
 * with `class-membership-required` detours here — claim a spot (new student)
 * or reclaim one (returning student on a new device) — and then retries.
 *
 * This is the rules of that detour and nothing else: no Mithril, no
 * callables. It takes a state and an event and says what the new state is;
 * the view runs the network and feeds the outcomes back in as events.
 */
import type { JoinClassAliasRow } from '@freedi/shared-types';

export type ClassJoinStep =
	/** "Are you new here, or have you played before?" */
	| 'choice'
	/** Typing a nickname */
	| 'claim'
	/** The one-time PIN screen — must be acknowledged before moving on */
	| 'pin-keep'
	/** Picking your alias from the roster list */
	| 'pick'
	/** Typing the rejoin PIN for the picked alias */
	| 'pin-entry'
	/** A callable is in flight */
	| 'busy'
	/** Membership settled — the caller retries the session join */
	| 'done';

export interface ClassJoinState {
	step: ClassJoinStep;
	/** Which step `busy` will resolve back into on failure */
	returnTo: ClassJoinStep;
	className: string;
	aliases: JoinClassAliasRow[];
	/** The picked roster spot (reclaim path) */
	memberId: string | null;
	/** The claimed alias + PIN, held only for the pin-keep screen */
	claimedAlias: string | null;
	pin: string | null;
	/** i18n key of the current error, or null */
	errorKey: string | null;
}

export type ClassJoinEvent =
	| { kind: 'choose-new' }
	| { kind: 'choose-returning' }
	| { kind: 'back' }
	| { kind: 'submit' }
	| { kind: 'aliases-loaded'; className: string; aliases: JoinClassAliasRow[] }
	| { kind: 'claimed'; alias: string; pin: string }
	| { kind: 'pin-acknowledged' }
	| { kind: 'picked'; memberId: string }
	| { kind: 'reclaimed' }
	| { kind: 'failed'; errorKey: string };

export const INITIAL_CLASS_JOIN: ClassJoinState = {
	step: 'choice',
	returnTo: 'choice',
	className: '',
	aliases: [],
	memberId: null,
	claimedAlias: null,
	pin: null,
	errorKey: null,
};

/**
 * Apply one event. Unknown combinations return the state unchanged — a stray
 * network resolution after the student pressed back must not teleport them.
 */
export function classJoinReduce(state: ClassJoinState, event: ClassJoinEvent): ClassJoinState {
	switch (event.kind) {
		case 'choose-new':
			return state.step === 'choice' ? { ...state, step: 'claim', errorKey: null } : state;
		case 'choose-returning':
			// The alias list is fetched while the picker shows a spinner
			return state.step === 'choice'
				? { ...state, step: 'busy', returnTo: 'choice', errorKey: null }
				: state;
		case 'aliases-loaded':
			return state.step === 'busy'
				? {
						...state,
						step: 'pick',
						className: event.className,
						aliases: event.aliases,
						errorKey: null,
					}
				: state;
		case 'submit':
			if (state.step === 'claim') return { ...state, step: 'busy', returnTo: 'claim' };
			if (state.step === 'pin-entry') return { ...state, step: 'busy', returnTo: 'pin-entry' };

			return state;
		case 'claimed':
			return state.step === 'busy'
				? {
						...state,
						step: 'pin-keep',
						claimedAlias: event.alias,
						pin: event.pin,
						errorKey: null,
					}
				: state;
		case 'pin-acknowledged':
			// The PIN leaves memory the moment it leaves the screen
			return state.step === 'pin-keep' ? { ...state, step: 'done', pin: null } : state;
		case 'picked':
			return state.step === 'pick'
				? { ...state, step: 'pin-entry', memberId: event.memberId, errorKey: null }
				: state;
		case 'reclaimed':
			return state.step === 'busy' ? { ...state, step: 'done', errorKey: null } : state;
		case 'failed':
			return state.step === 'busy'
				? { ...state, step: state.returnTo, errorKey: event.errorKey }
				: state;
		case 'back':
			if (state.step === 'claim' || state.step === 'pick') {
				return { ...state, step: 'choice', errorKey: null };
			}
			if (state.step === 'pin-entry') {
				return { ...state, step: 'pick', memberId: null, errorKey: null };
			}

			return state;
		default:
			return state;
	}
}

/** Map a callable failure onto the sentence the student should read. */
export function classJoinErrorKey(error: unknown): string {
	const text = String(error);
	if (/already-exists|taken/i.test(text)) return 'classJoin.alias_taken';
	if (/resource-exhausted|Too many/i.test(text)) return 'classJoin.pin_locked';
	if (/permission-denied|Wrong PIN/i.test(text)) return 'classJoin.wrong_pin';
	if (/not-found/i.test(text)) return 'classJoin.class_not_found';

	return 'common.error';
}
