import type { TextRow } from './moderationQueue';

/**
 * The teacher's "what they wrote" lenses over the flat list of rows:
 * by student (the spine), by question, and a free-text search. Pure.
 */
export interface StudentSummary {
	uid: string;
	anonName: string;
	removed: boolean;
	count: number;
	hiddenCount: number;
	lastAt: number;
}

export interface QuestionGroup {
	key: string;
	order: number;
	rows: TextRow[];
}

/** A run of rows sharing one place, with the divider that names it */
export interface RowRun {
	contextKey: string;
	first: TextRow;
	rows: TextRow[];
}

const byOldest = (a: TextRow, b: TextRow): number =>
	a.createdAt - b.createdAt || a.statementId.localeCompare(b.statementId);

/** One student's whole path, oldest first */
export function rowsOfStudent(rows: readonly TextRow[], uid: string): TextRow[] {
	return rows.filter((item) => item.authorUid === uid).sort(byOldest);
}

/**
 * Everyone who wrote, latest writer first, removed students after the rest.
 * A removed student with no lines left on the board still shows (under the
 * pseudonym parked at removal), so the teacher can find their thread.
 */
export function summarizeStudents(
	rows: readonly TextRow[],
	removed: Readonly<Record<string, string>>,
): StudentSummary[] {
	const byUid = new Map<string, StudentSummary>();
	for (const item of rows) {
		const found = byUid.get(item.authorUid);
		if (found) {
			found.count += 1;
			found.hiddenCount += item.hidden ? 1 : 0;
			found.lastAt = Math.max(found.lastAt, item.createdAt);
		} else {
			byUid.set(item.authorUid, {
				uid: item.authorUid,
				anonName: item.anonName,
				removed: Object.prototype.hasOwnProperty.call(removed, item.authorUid),
				count: 1,
				hiddenCount: item.hidden ? 1 : 0,
				lastAt: item.createdAt,
			});
		}
	}
	for (const [uid, anonName] of Object.entries(removed)) {
		if (!byUid.has(uid)) {
			byUid.set(uid, { uid, anonName, removed: true, count: 0, hiddenCount: 0, lastAt: 0 });
		}
	}

	return [...byUid.values()].sort(
		(a, b) => Number(a.removed) - Number(b.removed) || b.lastAt - a.lastAt,
	);
}

/** Rows grouped by where they were written, in lesson order; inside a group oldest first */
export function groupByQuestion(rows: readonly TextRow[]): QuestionGroup[] {
	const groups = new Map<string, QuestionGroup>();
	for (const item of rows) {
		const group = groups.get(item.contextKey) ?? {
			key: item.contextKey,
			order: item.contextOrder,
			rows: [],
		};
		group.rows.push(item);
		groups.set(item.contextKey, group);
	}

	return [...groups.values()]
		.map((group) => ({ ...group, rows: group.rows.sort(byOldest) }))
		.sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

/** Consecutive rows that share a place — a divider goes above each run */
export function runsOf(rows: readonly TextRow[]): RowRun[] {
	const runs: RowRun[] = [];
	for (const item of rows) {
		const last = runs[runs.length - 1];
		if (last && last.contextKey === item.contextKey) last.rows.push(item);
		else runs.push({ contextKey: item.contextKey, first: item, rows: [item] });
	}

	return runs;
}

/** Text, pseudonym or real name contains the query (case-insensitive, trimmed) */
export function searchRows(
	rows: readonly TextRow[],
	query: string,
	realNameOf: (uid: string) => string | undefined,
): TextRow[] {
	const needle = query.trim().toLocaleLowerCase();
	if (!needle) return [...rows];

	return rows.filter(
		(item) =>
			item.text.toLocaleLowerCase().includes(needle) ||
			item.anonName.toLocaleLowerCase().includes(needle) ||
			(realNameOf(item.authorUid) ?? '').toLocaleLowerCase().includes(needle),
	);
}
