import type { SetupDraft } from '@/logic/setupDraft';

/**
 * A copy of the Setup page in this browser until the server has confirmed it,
 * so a closed tab or a save that failed after leaving the page loses nothing.
 *
 * The copy belongs to one host (uid) and records the session's `lastUpdate` it
 * was written on top of: it is restored only for the same host and only when the
 * server's copy has not moved on since, so it never overwrites newer server data.
 */
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIX = 'freedi_tables_setup_';
const NEW_SESSION = 'new';

/** Which page the copy is of: a host's own session, or the host's not-yet-created one. */
export interface BackupScope {
	uid: string;
	/** Null on `/host/new`, before the name was first saved. */
	sessionId: string | null;
}

interface StoredBackup {
	uid: string;
	/** The session's lastUpdate when the copy was written; null for a session that does not exist yet. */
	serverUpdate: number | null;
	draft: SetupDraft;
}

function keyOf({ uid, sessionId }: BackupScope): string {
	return sessionId === null
		? `${PREFIX}${NEW_SESSION}_${encodeURIComponent(uid)}`
		: `${PREFIX}${sessionId}`;
}

function looksLikeDraft(value: unknown): value is SetupDraft {
	const draft = value as Partial<SetupDraft> | null;

	return typeof draft?.title === 'string' && Array.isArray(draft.topics);
}

function looksLikeBackup(value: unknown): value is StoredBackup {
	const backup = value as Partial<StoredBackup> | null;

	return (
		typeof backup?.uid === 'string' &&
		(backup.serverUpdate === null || typeof backup.serverUpdate === 'number') &&
		looksLikeDraft(backup.draft)
	);
}

export function writeSetupBackup(
	store: Store,
	scope: BackupScope,
	draft: SetupDraft,
	serverUpdate: number | null,
): void {
	const backup: StoredBackup = { uid: scope.uid, serverUpdate, draft };

	store.setItem(keyOf(scope), JSON.stringify(backup));
}

/**
 * The saved copy, or null when there is none, it is damaged, it is from before copies
 * carried a host and a time, it is another host's, or the server has changed since.
 * `serverUpdate` is the session's current lastUpdate (null when it does not exist yet).
 */
export function readSetupBackup(
	store: Store,
	scope: BackupScope,
	serverUpdate: number | null,
): SetupDraft | null {
	const raw = store.getItem(keyOf(scope));

	if (raw === null) return null;

	try {
		const parsed: unknown = JSON.parse(raw);

		if (!looksLikeBackup(parsed) || parsed.uid !== scope.uid) return null;
		if (serverUpdate !== null && (parsed.serverUpdate ?? 0) < serverUpdate) return null;

		return parsed.draft;
	} catch {
		return null;
	}
}

export function clearSetupBackup(store: Store, scope: BackupScope): void {
	store.removeItem(keyOf(scope));
}
