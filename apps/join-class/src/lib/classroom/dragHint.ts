/**
 * The long "drag a name to a table" hint shows once per teacher (design 5, A6): it is marked
 * seen when she taps "Got it" or moves one student. Stored per teacher uid in localStorage, so a
 * second device shows it once more. Storage may be missing or blocked: every access is guarded,
 * and then the hint simply shows (never an error).
 */

const KEY_PREFIX = 'class.dragHintSeen.';
const SEEN = '1';

export type HintStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function dragHintKey(uid: string): string {
	return `${KEY_PREFIX}${uid}`;
}

function defaultStorage(): HintStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

/** True when this teacher has already seen the hint. No uid yet: not seen (it shows). */
export function isDragHintSeen(
	uid: string | null,
	storage: HintStorage | null = defaultStorage(),
): boolean {
	if (!uid || !storage) return false;
	try {
		return storage.getItem(dragHintKey(uid)) === SEEN;
	} catch {
		return false;
	}
}

/** Remember that this teacher has seen the hint. Returns false when it could not be stored. */
export function markDragHintSeen(
	uid: string | null,
	storage: HintStorage | null = defaultStorage(),
): boolean {
	if (!uid || !storage) return false;
	try {
		storage.setItem(dragHintKey(uid), SEEN);

		return true;
	} catch {
		return false;
	}
}
