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
