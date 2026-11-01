import type { Statement } from '@freedi/shared-types';

/** Pure helpers for the teacher's "plan the questions" screen. No Firebase, no
 *  Mithril, so every rule the screen leans on can be unit-tested. */

/** Longest question text the teacher can write (IA §12.1). */
export const MAX_QUESTION_LENGTH = 140;
/** Longest one-line hint under a question. */
export const MAX_HINT_LENGTH = 140;

export type ClassRole = 'guiding' | 'challenge';

/** The class-only keys live in `statementSettings`. They are not (yet) in the
 *  shared `StatementSettings` type, so reads go through this view. */
interface ClassSettingsView {
	classRole?: unknown;
	hint?: unknown;
	classCode?: unknown;
}

function classSettings(statement: Statement | null | undefined): ClassSettingsView {
	return (statement?.statementSettings ?? {}) as ClassSettingsView;
}

/** Missing or unknown `classRole` means a guiding question, so questions that
 *  were created before the classroom existed still show up in the list. */
export function classRoleOf(statement: Statement): ClassRole {
	return classSettings(statement).classRole === 'challenge' ? 'challenge' : 'guiding';
}

/** The table-facing hint, or an empty string. */
export function hintOf(statement: Statement): string {
	const hint = classSettings(statement).hint;

	return typeof hint === 'string' ? hint : '';
}

/** The 6-digit class code stored on the workspace, if one exists yet.
 *  Single place to adjust once the lesson helpers (B1) land. */
export function readClassCode(statement: Statement | null | undefined): string | undefined {
	const code = classSettings(statement).classCode;
	if (typeof code === 'string' && code.trim() !== '') return code.trim();
	if (typeof code === 'number' && Number.isFinite(code)) return String(code);

	return undefined;
}

export interface PlanSplit {
	challenge: Statement | undefined;
	guiding: Statement[];
}

const NO_ORDER = Number.MAX_SAFE_INTEGER;

/** Order used by the whole screen: explicit `order` first, then creation time. */
export function compareByPlanOrder(a: Statement, b: Statement): number {
	const ao = typeof a.order === 'number' ? a.order : NO_ORDER;
	const bo = typeof b.order === 'number' ? b.order : NO_ORDER;
	if (ao !== bo) return ao - bo;

	return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

/** Split the workspace's sub-questions into the one challenge question and the
 *  ordered guiding list. `roleOverrides` covers the moment between creating a
 *  question and its role landing in the snapshot, so a new challenge question
 *  never flashes up as a table card. A second `challenge` question (should not
 *  happen) is treated as guiding rather than hidden. */
export function splitPlan(
	subQuestions: Statement[],
	roleOverrides: ReadonlyMap<string, ClassRole> = new Map(),
): PlanSplit {
	const sorted = [...subQuestions].sort(compareByPlanOrder);
	const roleOf = (s: Statement): ClassRole => roleOverrides.get(s.statementId) ?? classRoleOf(s);
	const challenges = sorted
		.filter((s) => roleOf(s) === 'challenge')
		.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
	const challenge = challenges[0];
	const guiding = sorted.filter((s) => s.statementId !== challenge?.statementId);

	return { challenge, guiding };
}

/** Trim and cut to the limit. Returns '' for blank input. */
export function normalizeQuestionText(raw: string, max: number = MAX_QUESTION_LENGTH): string {
	return raw.trim().slice(0, max);
}

/** Move `id` by `delta` places; stays inside the list. Returns a new array,
 *  or the same ids unchanged if the move is impossible. */
export function moveId(ids: string[], id: string, delta: number): string[] {
	const from = ids.indexOf(id);
	if (from === -1) return ids;
	const to = Math.min(ids.length - 1, Math.max(0, from + delta));
	if (to === from) return ids;
	const next = ids.filter((x) => x !== id);
	next.splice(to, 0, id);

	return next;
}

/** `order` for a question added at the end of the list. */
export function nextOrder(guiding: Statement[]): number {
	let max = -1;
	for (const s of guiding) {
		if (typeof s.order === 'number' && s.order > max) max = s.order;
	}

	return Math.max(max, guiding.length - 1) + 1;
}

/** Apply an optimistic id order to a list; unknown items are appended. */
export function applyIdOrder<T>(
	items: T[],
	ids: readonly string[] | null,
	getId: (item: T) => string,
): T[] {
	if (!ids) return items;
	const byId = new Map(items.map((item) => [getId(item), item]));
	const out: T[] = [];
	for (const id of ids) {
		const item = byId.get(id);
		if (item) {
			out.push(item);
			byId.delete(id);
		}
	}
	for (const item of byId.values()) out.push(item);

	return out;
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** True once the server order agrees with the optimistic one for every id both
 *  know about. Ids only one side has (added or removed elsewhere) are ignored,
 *  so a question added on another device cannot pin the optimistic order. */
export function orderConverged(
	serverIds: readonly string[],
	optimisticIds: readonly string[],
): boolean {
	const optimistic = new Set(optimisticIds);
	const server = new Set(serverIds);

	return sameIds(
		serverIds.filter((id) => optimistic.has(id)),
		optimisticIds.filter((id) => server.has(id)),
	);
}

/** The workspace link a student opens. */
export function studentJoinUrl(siteOrigin: string, mainId: string): string {
	return `${siteOrigin}/m/${mainId}`;
}
