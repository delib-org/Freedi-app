/** Per-device list of main-statement "workspaces" the user has admin access
 *  to. Powers the Main page list. Stored in localStorage so the list persists
 *  across sessions on this device but doesn't leak across devices. */

const KEY = 'freedi_join_my_workspaces';

export interface MyWorkspace {
	id: string;
	title: string;
	color?: string;
	lastVisited: number;
}

function readRaw(): MyWorkspace[] {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];

		return parsed.filter(
			(w): w is MyWorkspace =>
				typeof w === 'object' &&
				w !== null &&
				typeof (w as MyWorkspace).id === 'string' &&
				typeof (w as MyWorkspace).title === 'string' &&
				typeof (w as MyWorkspace).lastVisited === 'number',
		);
	} catch {
		return [];
	}
}

function writeRaw(list: MyWorkspace[]): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(list));
	} catch (err) {
		console.error('[myWorkspaces] persist failed:', err);
	}
}

/** Returns the list sorted most-recent-first. */
export function getMyWorkspaces(): MyWorkspace[] {
	return readRaw().sort((a, b) => b.lastVisited - a.lastVisited);
}

/** Insert or update a workspace entry. Idempotent — calling on every visit
 *  refreshes the title/color and bumps `lastVisited`. */
export function recordMyWorkspace(entry: Omit<MyWorkspace, 'lastVisited'>): void {
	if (!entry.id || !entry.title) return;
	const list = readRaw();
	const idx = list.findIndex((w) => w.id === entry.id);
	const next: MyWorkspace = {
		id: entry.id,
		title: entry.title,
		color: entry.color,
		lastVisited: Date.now(),
	};
	if (idx >= 0) {
		list[idx] = next;
	} else {
		list.push(next);
	}
	writeRaw(list);
}

export function removeMyWorkspace(id: string): void {
	const list = readRaw().filter((w) => w.id !== id);
	writeRaw(list);
}

/** Extract a Firestore-style statement ID from raw user input. Accepts:
 *   - bare IDs (alphanumeric + - and _)
 *   - join-app URLs:    .../m/<id>  or  .../m/<id>/q/...
 *   - main-app URLs:    .../statement/<id>/...  (any segment after the last slash that looks like an ID)
 *   - leading/trailing whitespace and query strings
 *  Returns null if no plausible ID is found. */
export function parseWorkspaceId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Bare ID — typical Firestore IDs are 16+ chars of [A-Za-z0-9_-]; we accept
	// anything ≥ 8 to stay forgiving without matching obvious junk like words.
	const bareIdMatch = /^[A-Za-z0-9_-]{8,}$/.exec(trimmed);
	if (bareIdMatch) return trimmed;

	// URL — strip query string then take the last non-empty path segment that
	// looks ID-shaped. Falls back to the segment after `/m/` or `/statement/`
	// when the trailing segment isn't an ID (e.g. URL ends in `/q/...`).
	const noQuery = trimmed.split('?')[0].split('#')[0];
	const segments = noQuery.split('/').filter(Boolean);

	const idShape = /^[A-Za-z0-9_-]{8,}$/;

	// 1. Prefer the segment immediately following a known prefix.
	for (const prefix of ['m', 'statement', 'main']) {
		const i = segments.indexOf(prefix);
		if (i >= 0 && segments[i + 1] && idShape.test(segments[i + 1])) {
			return segments[i + 1];
		}
	}

	// 2. Otherwise pick the last ID-shaped segment.
	for (let i = segments.length - 1; i >= 0; i--) {
		if (idShape.test(segments[i])) return segments[i];
	}

	return null;
}
