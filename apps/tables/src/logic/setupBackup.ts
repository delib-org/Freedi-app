import type { SetupDraft } from '@/logic/setupDraft';

/**
 * A copy of the Setup page in this browser until the server has confirmed it,
 * so a closed tab or a save that failed after leaving the page loses nothing.
 */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIX = 'freedi_tables_setup_';
const NEW_SESSION = 'new';

function keyOf(sessionId: string | null): string {
	return `${PREFIX}${sessionId ?? NEW_SESSION}`;
}

function looksLikeDraft(value: unknown): value is SetupDraft {
	const draft = value as Partial<SetupDraft> | null;

	return typeof draft?.title === 'string' && Array.isArray(draft.topics);
}

export function writeSetupBackup(store: Store, sessionId: string | null, draft: SetupDraft): void {
	store.setItem(keyOf(sessionId), JSON.stringify(draft));
}

export function readSetupBackup(store: Store, sessionId: string | null): SetupDraft | null {
	const raw = store.getItem(keyOf(sessionId));

	if (raw === null) return null;

	try {
		const parsed: unknown = JSON.parse(raw);

		return looksLikeDraft(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function clearSetupBackup(store: Store, sessionId: string | null): void {
	store.removeItem(keyOf(sessionId));
}
