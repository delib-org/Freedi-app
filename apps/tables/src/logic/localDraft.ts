import { POSITION_DECLINED } from '@/logic/positionStops';
import type { PositionAnswer } from '@/logic/positionStops';

/**
 * What only this browser remembers about one person in one assignment:
 * the choices between the steps and across a failed save, and whether it
 * held a registration and whether it cancelled it (so a registration that
 * disappeared is told apart from a new visitor, and from a removal by someone
 * else). Storage is passed in; screens give them `safeStorage`.
 */

export interface ChoicesDraft {
	ranked: string[];
	/** The position answer; null when none was given yet. */
	position: PositionAnswer | null;
}

type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;
type Remover = Pick<Storage, 'removeItem'>;

const DRAFT_PREFIX = 'freedi_tables_prefs_';
const MEMORY_PREFIX = 'freedi_tables_me_';

export function draftStorageKey(sessionId: string, uid: string): string {
	return `${DRAFT_PREFIX}${sessionId}_${uid}`;
}

export function serializeDraft(draft: ChoicesDraft): string {
	return JSON.stringify(draft);
}

function isPositionAnswer(value: unknown): value is PositionAnswer | null {
	return value === null || typeof value === 'number' || value === POSITION_DECLINED;
}

/** Parse a stored draft; anything malformed is ignored (null). */
export function parseDraft(raw: string | null): ChoicesDraft | null {
	if (!raw) return null;

	try {
		const value: unknown = JSON.parse(raw);

		if (typeof value !== 'object' || value === null) return null;

		const { ranked, position } = value as { ranked?: unknown; position?: unknown };

		if (!Array.isArray(ranked) || !ranked.every((id) => typeof id === 'string')) return null;
		if (!isPositionAnswer(position)) return null;

		return { ranked: ranked as string[], position };
	} catch {
		return null;
	}
}

export function loadDraft(sessionId: string, uid: string, storage: Reader): ChoicesDraft | null {
	return parseDraft(storage.getItem(draftStorageKey(sessionId, uid)));
}

export function saveDraft(
	sessionId: string,
	uid: string,
	draft: ChoicesDraft,
	storage: Writer,
): void {
	storage.setItem(draftStorageKey(sessionId, uid), serializeDraft(draft));
}

/** Drop the draft once the server has the choices. */
export function clearDraft(sessionId: string, uid: string, storage: Remover): void {
	storage.removeItem(draftStorageKey(sessionId, uid));
}

export interface RegistrationMemory {
	/** This browser held a registration in this assignment. */
	wasRegistered: boolean;
	/** The last full name, offered again by "register again". */
	lastName: string;
	/** This browser asked to cancel, so a disappearing record is the person's own doing. */
	cancelledHere: boolean;
}

/** Why a registration this browser held is gone: its own cancel, or someone else's action. */
export type RegistrationLoss = 'cancelled' | 'removed';

const NO_MEMORY: RegistrationMemory = { wasRegistered: false, lastName: '', cancelledHere: false };

function memoryKey(sessionId: string, uid: string): string {
	return `${MEMORY_PREFIX}${sessionId}_${uid}`;
}

export function parseMemory(raw: string | null): RegistrationMemory {
	if (!raw) return NO_MEMORY;

	try {
		const value = JSON.parse(raw) as Partial<RegistrationMemory> | null;

		return {
			wasRegistered: value?.wasRegistered === true,
			lastName: typeof value?.lastName === 'string' ? value.lastName : '',
			// Memory written before this field existed could only end in a cancel on that screen.
			cancelledHere: value?.wasRegistered === true && value.cancelledHere !== false,
		};
	} catch {
		return NO_MEMORY;
	}
}

export function loadMemory(sessionId: string, uid: string, storage: Reader): RegistrationMemory {
	return parseMemory(storage.getItem(memoryKey(sessionId, uid)));
}

export function rememberRegistration(
	sessionId: string,
	uid: string,
	fullName: string,
	storage: Writer,
): void {
	const memory: RegistrationMemory = {
		wasRegistered: true,
		lastName: fullName,
		cancelledHere: false,
	};

	storage.setItem(memoryKey(sessionId, uid), JSON.stringify(memory));
}

/** "Register again": the person starts over; the name stays on offer. */
export function forgetRegistration(sessionId: string, uid: string, storage: Reader & Writer): void {
	const memory: RegistrationMemory = {
		wasRegistered: false,
		lastName: loadMemory(sessionId, uid, storage).lastName,
		cancelledHere: false,
	};

	storage.setItem(memoryKey(sessionId, uid), JSON.stringify(memory));
}

function writeCancelledHere(
	sessionId: string,
	uid: string,
	cancelledHere: boolean,
	storage: Reader & Writer,
): void {
	const memory: RegistrationMemory = { ...loadMemory(sessionId, uid, storage), cancelledHere };

	storage.setItem(memoryKey(sessionId, uid), JSON.stringify(memory));
}

/** Noted before the call: the record's removal can reach this browser before the answer does. */
export function markCancelledHere(sessionId: string, uid: string, storage: Reader & Writer): void {
	writeCancelledHere(sessionId, uid, true, storage);
}

/** The cancel failed, so the person is still registered and did not leave. */
export function unmarkCancelledHere(
	sessionId: string,
	uid: string,
	storage: Reader & Writer,
): void {
	writeCancelledHere(sessionId, uid, false, storage);
}

/** Why a held registration is gone; null when this browser holds none to miss. */
export function registrationLoss(memory: RegistrationMemory): RegistrationLoss | null {
	if (!memory.wasRegistered) return null;

	return memory.cancelledHere ? 'cancelled' : 'removed';
}
