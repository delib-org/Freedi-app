/**
 * The participant's last preference choices, kept locally while saving so a
 * network error does not lose them (IA: "הבחירות נשמרות מקומית לעריכה").
 */

export interface PreferenceDraft {
	ranked: string[];
	/** 0..100, or null for "not specified". */
	position: number | null;
	/** When the draft was written (ms); an older draft yields to what the server saved later. */
	savedAt: number;
}

const KEY_PREFIX = 'freedi_tables_prefs_';

export function draftStorageKey(sessionId: string, uid: string): string {
	return `${KEY_PREFIX}${sessionId}_${uid}`;
}

export function serializeDraft(draft: PreferenceDraft): string {
	return JSON.stringify(draft);
}

/** Parse a stored draft; anything malformed is ignored (null). */
export function parseDraft(raw: string | null): PreferenceDraft | null {
	if (!raw) return null;

	try {
		const value: unknown = JSON.parse(raw);

		if (typeof value !== 'object' || value === null) return null;

		const { ranked, position, savedAt } = value as {
			ranked?: unknown;
			position?: unknown;
			savedAt?: unknown;
		};

		if (!Array.isArray(ranked) || !ranked.every((id) => typeof id === 'string')) return null;
		if (position !== null && typeof position !== 'number') return null;

		return {
			ranked: ranked as string[],
			position: position as number | null,
			savedAt: typeof savedAt === 'number' ? savedAt : 0,
		};
	} catch {
		return null;
	}
}

export function loadDraft(
	sessionId: string,
	uid: string,
	storage: Pick<Storage, 'getItem'>,
): PreferenceDraft | null {
	return parseDraft(storage.getItem(draftStorageKey(sessionId, uid)));
}

export function saveDraft(
	sessionId: string,
	uid: string,
	draft: PreferenceDraft,
	storage: Pick<Storage, 'setItem'>,
): void {
	storage.setItem(draftStorageKey(sessionId, uid), serializeDraft(draft));
}

/** Drop the draft once the server has the choices. */
export function clearDraft(
	sessionId: string,
	uid: string,
	storage: Pick<Storage, 'removeItem'>,
): void {
	storage.removeItem(draftStorageKey(sessionId, uid));
}

/** A draft wins only when it is newer than the server's last update of the session. */
export function draftIsFresh(draft: PreferenceDraft, serverLastUpdate: number): boolean {
	return draft.savedAt >= serverLastUpdate;
}
