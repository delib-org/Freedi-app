/**
 * Unsaved writing that must outlive a refresh.
 *
 * The opening sentence is the most expensive thing a student writes all lesson,
 * and the reload that rescues a stuck save used to take it with them. So every
 * draft box mirrors itself into sessionStorage.
 *
 * This exists because that mirroring was three try/catch blocks per draft,
 * repeated per box, with the storage key built by hand at each site — which is
 * how two boxes end up namespaced differently and a draft reappears in the
 * wrong session. Keys are constructed in one place; storage failures are
 * swallowed in one place.
 *
 * Storage genuinely can throw: private browsing, a full quota, a locked-down
 * school device. None of those should cost a student their sentence, so every
 * operation degrades to "the in-memory draft still stands".
 */

export interface StringStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface Draft {
	/** What was kept, or '' if nothing was — never throws. */
	read(): string;
	write(value: string): void;
	forget(): void;
	/** The key this draft occupies, for tests and for the storage-key registry. */
	readonly key: string;
}

/** Which box the draft belongs to. Namespaced per session, never per user. */
export type DraftName = 'first' | 'mine' | 'gap';

export function draftKey(sessionId: string, name: DraftName): string {
	return `agora_${sessionId}_${name}_draft`;
}

function browserStore(): StringStore | null {
	try {
		return window.sessionStorage;
	} catch {
		// Storage blocked entirely (some privacy modes throw on access itself)
		return null;
	}
}

export function sessionDraft(
	sessionId: string,
	name: DraftName,
	store: StringStore | null = browserStore(),
): Draft {
	const key = draftKey(sessionId, name);

	return {
		key,

		read() {
			try {
				return store?.getItem(key) ?? '';
			} catch {
				return '';
			}
		},

		write(value: string) {
			try {
				store?.setItem(key, value);
			} catch {
				// Full or blocked — the in-memory draft still stands
			}
		},

		forget() {
			try {
				store?.removeItem(key);
			} catch {
				// Nothing to do
			}
		},
	};
}
