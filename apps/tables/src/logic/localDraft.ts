/**
 * The participant's last preference choices, kept locally while saving so a
 * network error does not lose them (IA: "הבחירות נשמרות מקומית לעריכה").
 */

export interface PreferenceDraft {
	ranked: string[];
	/** 0..100, or null for "not specified". */
	position: number | null;
}

const KEY_PREFIX = 'freedi_tables_prefs_';

export function draftStorageKey(sessionId: string): string {
	return `${KEY_PREFIX}${sessionId}`;
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

		const { ranked, position } = value as { ranked?: unknown; position?: unknown };

		if (!Array.isArray(ranked) || !ranked.every((id) => typeof id === 'string')) return null;
		if (position !== null && typeof position !== 'number') return null;

		return { ranked: ranked as string[], position: position as number | null };
	} catch {
		return null;
	}
}

export function loadDraft(
	sessionId: string,
	storage: Pick<Storage, 'getItem'>,
): PreferenceDraft | null {
	return parseDraft(storage.getItem(draftStorageKey(sessionId)));
}

export function saveDraft(
	sessionId: string,
	draft: PreferenceDraft,
	storage: Pick<Storage, 'setItem'>,
): void {
	storage.setItem(draftStorageKey(sessionId), serializeDraft(draft));
}
