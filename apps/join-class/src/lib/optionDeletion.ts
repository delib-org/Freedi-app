/**
 * Admin/creator option deletion for the Join app.
 *
 * Two entry points:
 *   • `deleteOption(optionId)`     — remove a single suggestion.
 *   • `deleteAllOptions(qId)`      — remove every suggestion under a question
 *                                    ("clean slate" before re-running a round).
 *
 * Both cascade to the option's descendant Statements so a delete doesn't leave
 * orphans behind in `statements`:
 *
 *   option
 *     ├── paragraph children        (statementType === paragraph)
 *     └── chat messages             (statementType === statement)
 *           └── paragraph children  (statementType === paragraph)
 *
 * Two levels is the full depth the Join app ever writes (see `sendMessage` and
 * `updateSuggestion` in store.ts), so the walk stops there rather than doing an
 * unbounded recursive descent from the client.
 *
 * `evaluations` docs are deliberately NOT deleted. The `deleteEvaluation`
 * Cloud Function writes the recomputed aggregate back onto the parent option,
 * which would resurrect a ghost doc for an option we just removed. Orphaned
 * evaluation docs are invisible once their option is gone (every read path is
 * keyed by a live optionId), so leaving them is the safer trade.
 *
 * Authorization mirrors `firestore.rules` (`allow delete: if isAuthorized()`):
 * question admins, workspace/system admins, the option's own creator, and
 * per-question delegates holding the matching solution scope. The client-side
 * gate below is a UX guard — the rules are the real enforcement.
 */

import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { db, collection, doc, getDocs, query, where, writeBatch } from './firebase';
import { isAdmin, canEditOption } from './admin';

/** Firestore hard limit on writes per batch. */
const BATCH_LIMIT = 500;
/** Firestore hard limit on values in an `in` filter. */
const IN_LIMIT = 30;

export interface DeleteAllOptionsResult {
	/** How many option documents were removed. */
	optionsDeleted: number;
	/** How many descendant documents (paragraphs, chat, chat paragraphs) went with them. */
	descendantsDeleted: number;
	/** Step identifiers that failed, surfaced to the admin by the caller. */
	errors: string[];
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}

	return out;
}

/** All statement ids whose `parentId` is one of `parentIds`. Batched into
 *  `in` queries of 30 so a question with hundreds of options still resolves
 *  in a bounded number of reads. */
async function findChildIds(parentIds: string[]): Promise<string[]> {
	if (parentIds.length === 0) return [];

	const ids: string[] = [];
	for (const group of chunk(parentIds, IN_LIMIT)) {
		const snap = await getDocs(
			query(collection(db, Collections.statements), where('parentId', 'in', group)),
		);
		for (const d of snap.docs) ids.push(d.id);
	}

	return ids;
}

/** Every descendant of the given options, two levels deep (see module doc). */
async function collectDescendantIds(optionIds: string[]): Promise<string[]> {
	const level1 = await findChildIds(optionIds);
	const level2 = await findChildIds(level1);

	return [...level1, ...level2];
}

/** Delete statement docs in 500-write batches. */
async function deleteStatementIds(ids: string[]): Promise<void> {
	for (const group of chunk(ids, BATCH_LIMIT)) {
		const batch = writeBatch(db);
		for (const id of group) {
			batch.delete(doc(db, Collections.statements, id));
		}
		await batch.commit();
	}
}

/**
 * Permanently delete one option and everything under it. Throws when the
 * active user isn't authorized so the caller can surface the failure rather
 * than silently no-op.
 */
export async function deleteOption(option: Statement): Promise<void> {
	if (!canEditOption(option)) {
		throw new Error('Not authorized to delete this option');
	}

	const descendants = await collectDescendantIds([option.statementId]);
	await deleteStatementIds([...descendants, option.statementId]);
}

/**
 * Admin-only: permanently delete every option under a question, plus their
 * descendants. Returns counts (and any failed step) instead of throwing, so a
 * partial success still tells the admin what happened.
 */
export async function deleteAllOptions(questionId: string): Promise<DeleteAllOptionsResult> {
	const result: DeleteAllOptionsResult = {
		optionsDeleted: 0,
		descendantsDeleted: 0,
		errors: [],
	};
	if (!isAdmin() || !questionId) {
		result.errors.push('not_admin');

		return result;
	}

	let optionIds: string[] = [];
	try {
		const snap = await getDocs(
			query(
				collection(db, Collections.statements),
				where('parentId', '==', questionId),
				where('statementType', '==', StatementType.option),
			),
		);
		optionIds = snap.docs.map((d) => d.id);
	} catch (err) {
		console.error('[deleteAllOptions] failed to read options', err);
		result.errors.push('read');

		return result;
	}

	if (optionIds.length === 0) return result;

	// Descendants are best-effort: if the read fails we still remove the
	// options themselves so the admin gets the clean slate they asked for.
	let descendantIds: string[] = [];
	try {
		descendantIds = await collectDescendantIds(optionIds);
	} catch (err) {
		console.error('[deleteAllOptions] failed to read descendants', err);
		result.errors.push('descendants');
	}

	try {
		await deleteStatementIds([...descendantIds, ...optionIds]);
		result.optionsDeleted = optionIds.length;
		result.descendantsDeleted = descendantIds.length;
	} catch (err) {
		console.error('[deleteAllOptions] delete failed', err);
		result.errors.push('delete');
	}

	return result;
}
