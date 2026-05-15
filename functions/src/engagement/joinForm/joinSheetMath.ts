/**
 * Pure helpers for the join sheet sync trigger. Kept in their own module so
 * they can be tested without spinning up Firestore or the Sheets API. The
 * three production bugs that prompted this extraction (column-shift, missed
 * cancel→rejoin, wrong-row deletion) all lived in functions that were
 * embedded in async trigger handlers and therefore had no test coverage.
 *
 * MUST NOT import from firebase-admin / firebase-functions / googleapis —
 * these helpers are deterministic functions over plain inputs.
 */

import type { Creator, Statement } from '@freedi/shared-types';

export type Role = 'activist' | 'organizer';

// ---------------------------------------------------------------------------
// Membership diff
// ---------------------------------------------------------------------------

export interface MemberDiff {
	added: Creator[];
	removed: Creator[];
}

/**
 * Returns the set difference between two `joined`/`organizers` arrays. Used
 * by the sync trigger to compute "who newly joined" / "who left" without
 * relying on update timestamps. Skips entries with no `uid` because empty
 * placeholders sometimes appear in admin-seeded data.
 */
export function diffMembers(
	beforeArr: Creator[] | undefined,
	afterArr: Creator[] | undefined,
): MemberDiff {
	const before = new Map<string, Creator>();
	for (const c of beforeArr ?? []) {
		if (c?.uid) before.set(c.uid, c);
	}
	const after = new Map<string, Creator>();
	for (const c of afterArr ?? []) {
		if (c?.uid) after.set(c.uid, c);
	}
	const added: Creator[] = [];
	const removed: Creator[] = [];
	for (const [uid, creator] of after) {
		if (!before.has(uid)) added.push(creator);
	}
	for (const [uid, creator] of before) {
		if (!after.has(uid)) removed.push(creator);
	}

	return { added, removed };
}

// ---------------------------------------------------------------------------
// Membership events (used by the audit-trail backup)
// ---------------------------------------------------------------------------

export interface MembershipEvent {
	action: 'joined' | 'left';
	role: Role;
	user: Creator;
}

/**
 * Computes a flat sequence of membership events from a before/after
 * Statement. Order: joined-additions → joined-removals → organizer-additions
 * → organizer-removals. Used by `fn_backupOptionMembership` to write a
 * separate audit row per transition.
 */
export function computeMembershipEvents(
	before: Statement | undefined,
	after: Statement | undefined,
): MembershipEvent[] {
	const events: MembershipEvent[] = [];

	const activist = diffMembers(before?.joined, after?.joined);
	for (const creator of activist.added) {
		events.push({ action: 'joined', role: 'activist', user: creator });
	}
	for (const creator of activist.removed) {
		events.push({ action: 'left', role: 'activist', user: creator });
	}

	const organizer = diffMembers(before?.organizers, after?.organizers);
	for (const creator of organizer.added) {
		events.push({ action: 'joined', role: 'organizer', user: creator });
	}
	for (const creator of organizer.removed) {
		events.push({ action: 'left', role: 'organizer', user: creator });
	}

	return events;
}

// ---------------------------------------------------------------------------
// User memberships across an option set
// ---------------------------------------------------------------------------

export interface UserMembership {
	optionId: string;
	optionTitle: string;
	role: Role;
}

/**
 * Returns every (option, role) tuple that names the given user as a member
 * across the supplied options. Skips cluster docs and hidden integrated
 * members the same way the live trigger does — they're option-typed but
 * carry no real membership state.
 *
 * Used by `fn_syncSubmissionToSheet` to find which sheet rows to backfill
 * when a user's form submission lands after they've already been added to
 * one or more options (the "join-before-form" drift mode).
 */
export function findUserMembershipsInOptions(
	options: Statement[],
	userId: string,
): UserMembership[] {
	if (!userId) return [];
	const memberships: UserMembership[] = [];
	for (const opt of options) {
		if (opt.isCluster === true) continue;
		const integratedInto = (opt as { integratedInto?: string }).integratedInto;
		if (integratedInto) continue;

		const inJoined = (opt.joined ?? []).some((c) => c?.uid === userId);
		const inOrganizers = (opt.organizers ?? []).some((c) => c?.uid === userId);
		if (inJoined) {
			memberships.push({
				optionId: opt.statementId,
				optionTitle: opt.statement ?? '',
				role: 'activist',
			});
		}
		if (inOrganizers) {
			memberships.push({
				optionId: opt.statementId,
				optionTitle: opt.statement ?? '',
				role: 'organizer',
			});
		}
	}

	return memberships;
}

// ---------------------------------------------------------------------------
// Row layout
// ---------------------------------------------------------------------------

export interface RowContext {
	userId: string;
	displayName: string;
	role: Role;
	optionId: string;
	optionTitle: string;
	submittedAt: string;
	questionId: string;
	/** Form values keyed by field LABEL (matches the sheet header cells). */
	formValues: Record<string, string>;
}

/**
 * Build a row whose cells line up with the existing header. Lands every
 * value in the column whose header matches it — so legacy 9-col sheets
 * (no `optionId` column) and new 10-col sheets both get correct data.
 * Unknown header columns are filled with empty strings so widths stay
 * aligned. The input `header` SHOULD be the literal cells of A1:?1 with
 * trim applied; we trim again here defensively in case the caller passed
 * raw cells.
 */
export function buildRowFromHeader(header: string[], ctx: RowContext): string[] {
	return header.map((h) => {
		const trimmed = h.trim();
		switch (trimmed) {
			case 'userId':
				return ctx.userId;
			case 'displayName':
				return ctx.displayName;
			case 'role':
				return ctx.role;
			case 'optionId':
				return ctx.optionId;
			case 'optionTitle':
				return ctx.optionTitle;
			case 'submittedAt':
				return ctx.submittedAt;
			case 'questionId':
				return ctx.questionId;
			default:
				return ctx.formValues[trimmed] ?? '';
		}
	});
}

// ---------------------------------------------------------------------------
// Column index → A1 notation
// ---------------------------------------------------------------------------

/**
 * Converts a 0-based column index to Sheets A1 column notation.
 *   0 → "A", 25 → "Z", 26 → "AA", 51 → "AZ", 52 → "BA", ...
 *
 * Pulled into the pure-math module so the carry/wrap behavior around the
 * Z/AA boundary is unit-testable in isolation — the migration writer uses
 * this to compute the target cell range for the new `optionId` column on
 * v1 sheets, and a wrong letter here would write to the wrong column.
 */
export function columnIndexToA1(index: number): string {
	if (!Number.isInteger(index) || index < 0) return '';
	let n = index;
	let result = '';
	while (n >= 0) {
		result = String.fromCharCode(65 + (n % 26)) + result;
		n = Math.floor(n / 26) - 1;
	}

	return result;
}

// ---------------------------------------------------------------------------
// v1 → v2 schema migration (adds the `optionId` column)
// ---------------------------------------------------------------------------

export interface V1ToV2MigrationPlan {
	/** False when the sheet is already v2 or the migration is a no-op. */
	needsMigration: boolean;
	/** Header row to write after migration (only set when needsMigration). */
	newHeader: string[];
	/**
	 * Column index where the new `optionId` cell goes (0-based). The whole
	 * column header + per-row values are written to this position; the rest
	 * of the sheet is untouched.
	 */
	optionIdColumnIndex: number;
	/**
	 * One entry per data row in `rows[1:]`, in the same order. `null` means
	 * we couldn't resolve the row's option title — leave the cell blank;
	 * the row still matches by title via the legacy path.
	 */
	optionIdsByRow: Array<string | null>;
}

/**
 * Computes what a v1→v2 in-place migration would do, given the current sheet
 * contents and a `title → optionId` lookup built from live option docs.
 *
 * The migration is non-destructive: we APPEND the `optionId` column at the
 * right edge of the existing header rather than inserting in the middle, so
 * the human-curated column ordering is preserved and the write is a single
 * column-range update.
 *
 * Idempotent: if `optionId` is already in the header, returns
 * `needsMigration: false` so callers can short-circuit.
 *
 * Pure — no Sheets API or Firestore. Tested in `joinSheetMath.test.ts`.
 */
export function planV1ToV2Migration(
	rows: string[][],
	titleToOptionId: Map<string, string>,
): V1ToV2MigrationPlan {
	const empty: V1ToV2MigrationPlan = {
		needsMigration: false,
		newHeader: [],
		optionIdColumnIndex: -1,
		optionIdsByRow: [],
	};
	if (rows.length === 0) return empty;

	const header = rows[0] ?? [];
	const existingOptionIdCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionId',
	);
	if (existingOptionIdCol !== -1) return empty;

	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);

	const newHeader = [...header, 'optionId'];
	const optionIdsByRow: Array<string | null> = [];
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] ?? [];
		if (optionTitleCol === -1) {
			optionIdsByRow.push(null);
			continue;
		}
		const title = typeof row[optionTitleCol] === 'string' ? row[optionTitleCol].trim() : '';
		if (title === '') {
			optionIdsByRow.push(null);
			continue;
		}
		optionIdsByRow.push(titleToOptionId.get(title) ?? null);
	}

	return {
		needsMigration: true,
		newHeader,
		optionIdColumnIndex: header.length,
		optionIdsByRow,
	};
}

// ---------------------------------------------------------------------------
// Orphan row detection (reconcile-only)
// ---------------------------------------------------------------------------

/**
 * Builds the lookup set that `findOrphanRowIndices` consumes. For every live
 * membership we emit BOTH an id-keyed AND a title-keyed tuple so the orphan
 * check works against v2 sheets (match by `optionId`) and v1 sheets (match
 * by `optionTitle`) with the same data. Returning the set rather than
 * building it inline keeps the orphan-detector pure and trivially testable.
 */
export function buildLiveMemberKeys(
	memberships: Array<{ userId: string; role: Role; optionId: string; optionTitle: string }>,
): Set<string> {
	const keys = new Set<string>();
	for (const m of memberships) {
		if (!m.userId) continue;
		if (m.optionId) keys.add(`${m.userId}|${m.role}|${m.optionId}`);
		if (m.optionTitle) keys.add(`${m.userId}|${m.role}|${m.optionTitle}`);
	}

	return keys;
}

/**
 * Returns indices (0-based; row 0 is header) of sheet rows that have a
 * `userId` value but DON'T correspond to any live (userId, role, option)
 * membership tuple in `liveMemberKeys`. Used by the reconcile callable to
 * remove rows for users who left an option while the sync trigger was down
 * — the primary cause of long-lived sheet drift.
 *
 * Safety properties:
 *   - Refuses to match (and therefore won't delete) if the header has no
 *     `userId` column — we don't know what we're looking at.
 *   - Skips rows with an empty `userId` cell (manual notes / blank rows).
 *   - On v1 sheets (no `optionId` column) matches by title alone. Title
 *     renames between joiners' rows and current option titles would cause
 *     false-positive orphans; the v1→v2 migration eliminates this risk.
 *     Callers SHOULD only invoke this after migration or while explicitly
 *     accepting the v1 trade-off.
 */
export function findOrphanRowIndices(rows: string[][], liveMemberKeys: Set<string>): number[] {
	if (rows.length < 2) return [];
	const header = rows[0] ?? [];
	const userIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'userId');
	if (userIdCol === -1) return [];

	const roleCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'role');
	const optionIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'optionId');
	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);
	if (optionIdCol === -1 && optionTitleCol === -1) return [];

	const orphans: number[] = [];
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] ?? [];
		const uid = row[userIdCol];
		if (typeof uid !== 'string' || uid === '') continue;
		const role = roleCol !== -1 ? (row[roleCol] ?? '') : '';
		const oid = optionIdCol !== -1 ? (row[optionIdCol] ?? '') : '';
		const otitle = optionTitleCol !== -1 ? (row[optionTitleCol] ?? '') : '';

		const matchesById = oid !== '' && liveMemberKeys.has(`${uid}|${role}|${oid}`);
		const matchesByTitle = otitle !== '' && liveMemberKeys.has(`${uid}|${role}|${otitle}`);
		if (!matchesById && !matchesByTitle) {
			orphans.push(i);
		}
	}

	return orphans;
}

// ---------------------------------------------------------------------------
// Row finder (idempotency / removal)
// ---------------------------------------------------------------------------

export interface FindRowArgs {
	userId: string;
	role: Role;
	optionId: string;
	optionTitle: string;
}

/**
 * Find the row in `rows[1:]` (header at row[0]) that matches the given
 * (userId, role, option) tuple. Returns -1 if no match.
 *
 * Refuses to match on userId+role alone — affirmative option match is
 * required (either by `optionId` OR by `optionTitle`). This guards against
 * the production bug where Shai's "ran over the previous in Excel" event
 * happened because the search couldn't disambiguate two of his rows.
 *
 * Iterates from the bottom up so admins inspecting the sheet see the
 * latest copy disappear when a user un-joins.
 */
export function findRowIndex(rows: string[][], args: FindRowArgs): number {
	if (rows.length < 2) return -1;
	const header = rows[0] ?? [];
	const userIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'userId');
	if (userIdCol === -1) return -1;

	const roleCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'role');
	const optionIdCol = header.findIndex((h) => typeof h === 'string' && h.trim() === 'optionId');
	const optionTitleCol = header.findIndex(
		(h) => typeof h === 'string' && h.trim() === 'optionTitle',
	);

	// If neither option column exists, we can't safely identify the right
	// row — refuse to match rather than fall through to a userId+role-only
	// match (which would risk deleting an unrelated row).
	if (optionIdCol === -1 && optionTitleCol === -1) return -1;

	for (let i = rows.length - 1; i >= 1; i--) {
		const row = rows[i];
		if (!row) continue;
		const cell = row[userIdCol];
		if (typeof cell !== 'string' || cell !== args.userId) continue;

		// Role must match exactly when the column exists. Empty-string and
		// missing cells are NOT a free pass — they could match any role and
		// cause deletion of the wrong row.
		if (roleCol !== -1) {
			const cellRole = row[roleCol];
			if (typeof cellRole !== 'string' || cellRole !== args.role) continue;
		}

		const cellOptionId = optionIdCol !== -1 ? row[optionIdCol] : undefined;
		const cellOptionTitle = optionTitleCol !== -1 ? row[optionTitleCol] : undefined;
		const optionIdMatches =
			optionIdCol !== -1 &&
			typeof cellOptionId === 'string' &&
			cellOptionId !== '' &&
			cellOptionId === args.optionId;
		const optionTitleMatches =
			optionTitleCol !== -1 &&
			args.optionTitle !== '' &&
			typeof cellOptionTitle === 'string' &&
			cellOptionTitle !== '' &&
			cellOptionTitle === args.optionTitle;
		if (!optionIdMatches && !optionTitleMatches) continue;

		return i;
	}

	return -1;
}
