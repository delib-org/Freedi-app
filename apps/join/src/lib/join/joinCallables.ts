/**
 * Client-side wrappers around the Join-app Cloud Functions.
 *
 * Three categories:
 *   1. `toggleJoining` — server-enforced join/leave/swap via fn_joinOption.
 *      Firestore rules block direct client writes to joined/organizers when
 *      a joinForm is configured, so this callable is the only legitimate
 *      write path for membership.
 *   2. `resetOptionJoining` / `resetQuestionJoining` — admin-only wipe
 *      operations. The single-option variant writes the cleared arrays
 *      directly (admin paths bypass the joinForm rule); the question-wide
 *      variant additionally walks submissions and the sheet.
 *   3. `testSheetAccess` — facilitator setup smoke-test.
 *
 * Carved out of store.ts so the trust-sensitive wrappers live together.
 */

import { Statement, StatementType, Collections } from '@freedi/shared-types';
import {
	db,
	functions,
	collection,
	doc,
	getDocs,
	setDoc,
	query,
	where,
	writeBatch,
	httpsCallable,
} from '../firebase';
import { getUserState } from '../user';
import { isAdmin } from '../admin';
import { clearJoinFormCacheForUsers, type JoinRole } from './joinFormCache';

// ---------------------------------------------------------------------------
// toggleJoining (server-enforced via fn_joinOption)
// ---------------------------------------------------------------------------

export interface ToggleJoiningResult {
	success: boolean;
	leftStatementId?: string;
	leftStatementTitle?: string;
	error?: string;
}

export interface ToggleJoiningOptions {
	/**
	 * When set, atomically remove the user from this sibling option's
	 * `joined`/`organizers` list before adding them to the new one. Used by
	 * the LimitReachedModal swap flow so a cap is preserved across the swap.
	 */
	releaseFromOptionId?: string;
}

interface JoinOptionCallableRequest {
	optionId: string;
	role: JoinRole;
	releaseFromOptionId?: string;
}

interface JoinOptionCallableResult {
	success: true;
	action: 'joined' | 'left' | 'swapped';
	role: JoinRole;
	leftStatementId?: string;
	leftStatementTitle?: string;
}

/**
 * Toggles the current user's membership on `optionId` (an option) via the
 * `fn_joinOption` callable. The callable is now the canonical write path:
 * it enforces the per-user cap, applies `singleJoinOnly`, and performs
 * atomic swaps. Firestore rules forbid clients from writing to
 * `joined`/`organizers` directly when a `joinForm` is configured, so this
 * is the only legitimate route.
 *
 * `parentStatementId` is now informational (kept in the signature so call
 * sites don't need to change) — the callable derives it from the option's
 * `parentId`. The `leftStatementId`/`leftStatementTitle` fields on the
 * result are populated when the operation was a swap or a `singleJoinOnly`
 * implicit removal.
 */
export async function toggleJoining(
	optionId: string,
	_parentStatementId: string,
	role: JoinRole = 'activist',
	options: ToggleJoiningOptions = {},
): Promise<ToggleJoiningResult> {
	try {
		if (!getUserState().user?.uid) {
			throw new Error('User not authenticated');
		}

		const call = httpsCallable<JoinOptionCallableRequest, JoinOptionCallableResult>(
			functions,
			'fn_joinOption',
		);
		const payload: JoinOptionCallableRequest = { optionId, role };
		if (options.releaseFromOptionId) {
			payload.releaseFromOptionId = options.releaseFromOptionId;
		}
		const result = await call(payload);

		return {
			success: true,
			leftStatementId: result.data.leftStatementId,
			leftStatementTitle: result.data.leftStatementTitle,
		};
	} catch (error) {
		console.error('[Join] toggleJoining failed:', error);

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to toggle joining',
		};
	}
}

// ---------------------------------------------------------------------------
// testSheetAccess
// ---------------------------------------------------------------------------

export interface TestSheetAccessResult {
	ok: boolean;
	serviceAccountEmail: string;
	error?: string;
}

/**
 * Calls the `testSheetAccess` Cloud Function to verify that the service
 * account can read/write the given spreadsheet. Used by the facilitator
 * panel "Test connection" button to give immediate feedback before the
 * first real submission — catches the "sheet not shared" mistake at setup.
 */
export async function testSheetAccess(sheetUrl: string): Promise<TestSheetAccessResult> {
	const call = httpsCallable<{ sheetUrl: string }, TestSheetAccessResult>(
		functions,
		'testSheetAccess',
	);
	const result = await call({ sheetUrl });

	return result.data;
}

// ---------------------------------------------------------------------------
// reconcileJoinSheet
// ---------------------------------------------------------------------------

export interface ReconcileJoinSheetResult {
	success: boolean;
	questionId: string;
	optionsScanned: number;
	totalMembers: number;
	appended: number;
	skippedAlreadyPresent: number;
	skippedNoSubmission: number;
	/**
	 * Number of sheet rows removed in the orphan-cleanup pass. Orphans are
	 * rows whose (userId, role, option) tuple no longer corresponds to any
	 * live membership — typically users who left an option while the sync
	 * trigger was unavailable.
	 */
	removed: number;
	/**
	 * True when orphan removal was skipped because the sheet still uses the
	 * v1 (no `optionId` column) schema. On v1 the orphan check matches by
	 * title alone, which is ambiguous if option titles were renamed after
	 * some users joined — deleting under that ambiguity could remove valid
	 * rows. Migrate to v2 to enable cleanup.
	 */
	orphanRemovalSkippedV1: boolean;
	errors: number;
	message: string;
}

/**
 * Calls `fn_reconcileJoinSheet` to backfill the Google Sheet from the
 * authoritative option `joined`/`organizers` arrays. Idempotent — only
 * appends rows that are missing for the (uid, optionId, role) tuple, never
 * deletes. Surfaced via a facilitator-panel button so admins can fix a
 * mismatched sheet on demand without waiting for the per-write trigger to
 * recover.
 *
 * The callable enforces admin authorization itself; this wrapper does not
 * re-check, so facilitators who can see the button (gated by `isAdmin()`
 * in the panel) get the server's actual permission decision.
 */
export async function reconcileJoinSheet(
	questionId: string,
): Promise<ReconcileJoinSheetResult> {
	const call = httpsCallable<{ questionId: string }, ReconcileJoinSheetResult>(
		functions,
		'fn_reconcileJoinSheet',
	);
	const result = await call({ questionId });

	return result.data;
}

// ---------------------------------------------------------------------------
// resetOptionJoining
// ---------------------------------------------------------------------------

/**
 * Admin-only: clear `joined` and `organizers` on a single option, sending
 * its activist + organizer counters back to zero. Form submissions and
 * Google Sheet rows live at the question level (one per user, regardless
 * of which option they joined) and are NOT touched here — see
 * `resetQuestionJoining` for a full clean slate. The Firestore rule allows
 * this write for question admins (same surface that already permits
 * `setOptionFlag`).
 */
export async function resetOptionJoining(optionId: string): Promise<void> {
	if (!isAdmin()) return;
	await setDoc(
		doc(db, Collections.statements, optionId),
		{ joined: [], organizers: [], lastUpdate: Date.now() },
		{ merge: true },
	);
}

// ---------------------------------------------------------------------------
// resetQuestionJoining
// ---------------------------------------------------------------------------

export interface ResetQuestionJoiningResult {
	optionsCleared: number;
	submissionsDeleted: number;
	sheetRowsRemoved: number;
	/**
	 * Human-readable identifiers for steps that failed. The UI surfaces these
	 * so partial successes (e.g. options cleared but the submissions delete
	 * blocked by undeployed Firestore rules) stay visible rather than
	 * swallowed by the outer error handler.
	 */
	errors: string[];
}

/**
 * Admin-only: nuke every join-related record under a question.
 *
 *   1. Walk every child option (`statementType === option`) and clear its
 *      `joined` + `organizers` arrays in a Firestore batch.
 *   2. Read the question's `joinFormSubmissions` subcollection (one doc per
 *      user who filled the form) so we know whose sheet rows to remove.
 *   3. Best-effort: call `fn_removeUserFromSheet` per submitter. The cloud
 *      function is a no-op when the question isn't a sheets-destination
 *      form and surfaces its own errors — we keep going regardless so a
 *      single failure doesn't strand the rest of the wipe.
 *   4. Delete the submission docs in a second batch.
 *   5. Drop the matching entries from the in-memory caches so the next
 *      click doesn't optimistically skip the form modal.
 *
 * Each step is independently try/caught so a partial failure still returns
 * whatever did succeed. The result includes an `errors` array so the UI
 * can tell the admin which step needs attention (most often a
 * Firestore-rules deploy after this feature first ships, or a missing
 * CORS origin on the sheet-removal callable).
 */
export async function resetQuestionJoining(
	questionId: string,
): Promise<ResetQuestionJoiningResult> {
	const result: ResetQuestionJoiningResult = {
		optionsCleared: 0,
		submissionsDeleted: 0,
		sheetRowsRemoved: 0,
		errors: [],
	};
	if (!isAdmin() || !questionId) return result;

	const now = Date.now();

	// Step 1 — clear joined/organizers on every option under the question.
	try {
		const optionsSnap = await getDocs(
			query(
				collection(db, Collections.statements),
				where('parentId', '==', questionId),
				where('statementType', '==', StatementType.option),
			),
		);

		if (optionsSnap.size > 0) {
			const batch = writeBatch(db);
			for (const optionDoc of optionsSnap.docs) {
				batch.set(optionDoc.ref, { joined: [], organizers: [], lastUpdate: now }, { merge: true });
			}
			await batch.commit();
			result.optionsCleared = optionsSnap.size;
		}
	} catch (err) {
		console.error('[resetQuestionJoining] step 1 (clear options) failed', err);
		result.errors.push('options');
	}

	// Step 2 — pull every submission so we know which users to wipe from the
	// sheet (and so we can delete the docs themselves afterward). If the
	// read itself fails we can't do steps 3 or 4, so bail with what we have.
	let submissionsSnap: Awaited<ReturnType<typeof getDocs>> | null = null;
	let userIds: string[] = [];
	try {
		submissionsSnap = await getDocs(
			collection(db, Collections.statements, questionId, 'joinFormSubmissions'),
		);
		userIds = submissionsSnap.docs.map((d) => d.id);
	} catch (err) {
		console.error('[resetQuestionJoining] step 2 (read submissions) failed', err);
		result.errors.push('submissions_read');

		return result;
	}

	// Step 3 — best-effort sheet wipe. Sequential rather than parallel so we
	// don't hammer the Sheets API; the cloud function rate is the limiter.
	for (const userId of userIds) {
		try {
			await removeUserFromSheet(questionId, userId);
			result.sheetRowsRemoved++;
		} catch (err) {
			console.error('[resetQuestionJoining] step 3 (remove sheet row) failed', {
				userId,
				err,
			});
		}
	}
	if (userIds.length > 0 && result.sheetRowsRemoved < userIds.length) {
		result.errors.push('sheet');
	}

	// Step 4 — delete submission docs. Failure here is the most likely outcome
	// on first deploy: the rule allowing admin delete on `joinFormSubmissions`
	// has to ship via `firebase deploy --only firestore:rules` before client
	// deletes succeed. We log + continue rather than throw.
	if (submissionsSnap.size > 0) {
		try {
			const subBatch = writeBatch(db);
			for (const submissionDoc of submissionsSnap.docs) {
				subBatch.delete(submissionDoc.ref);
			}
			await subBatch.commit();
			result.submissionsDeleted = submissionsSnap.size;
		} catch (err) {
			console.error('[resetQuestionJoining] step 4 (delete submissions) failed', err);
			result.errors.push('submissions_delete');
		}
	}

	// Step 5 — drop matching cache entries. Delegates to the cache module's
	// helper so the three Maps stay in sync (and so we don't reach into
	// joinFormCache internals from here).
	clearJoinFormCacheForUsers(questionId, userIds);

	return result;
}

/**
 * Remove a user from the Google Sheet when they un-join an option. Calls
 * the Cloud Function with the user's ID to find and delete their row.
 * Surfaces the result via console so failures show up in DevTools.
 *
 * Private to this module — the only legitimate caller is the admin reset
 * flow. (Per-click sheet removal is now driven by the sheet sync trigger
 * on the server side; the client no longer calls this on toggleJoining.)
 */
async function removeUserFromSheet(questionId: string, userId: string): Promise<void> {
	if (!questionId || !userId) return;

	try {
		const call = httpsCallable<
			{ questionId: string; userId: string },
			{ success: boolean; message?: string; deletedRow?: number }
		>(functions, 'fn_removeUserFromSheet');

		const result = await call({ questionId, userId });

		if (result.data.success) {
			console.info(
				'[removeUserFromSheet] OK:',
				result.data.message,
				result.data.deletedRow ? `(row ${result.data.deletedRow})` : '',
			);
		} else {
			console.error('[removeUserFromSheet] Failed:', result.data.message);
		}
	} catch (error) {
		console.error('[removeUserFromSheet] Error calling function:', error);
		throw error;
	}
}

// ---------------------------------------------------------------------------
// getUserCommittedOptions — re-exposed helper used by the cap UX.
// Lives here because it's tightly coupled to the cap logic that drives the
// LimitReachedModal — see `apps/join/src/components/SolutionCard.ts`.
// ---------------------------------------------------------------------------

/**
 * All visible options the user is currently committed to (any role).
 * Distinct — a user who's both activist and organizer on the same option
 * counts once. Used by the per-user cap: the cap is "how many activities
 * you're committed to" and is role-agnostic, so a role swap on the same
 * option (activist ↔ organizer) doesn't bump the count and shouldn't
 * trigger the swap modal. Hidden / failed options are filtered out so
 * they don't inflate the count toward an admin-imposed cap participants
 * can no longer act on.
 *
 * Takes the visible options list as an argument rather than reading
 * module state so this module stays decoupled from the active-question
 * state in `store.ts`.
 */
export function getUserCommittedOptionsFrom(allOptions: Statement[], uid: string): Statement[] {
	return allOptions.filter((option) => {
		if (option.hide === true) return false;
		if (option.joinStatus === 'failed') return false;
		const inJoined = Array.isArray(option.joined) && option.joined.some((c) => c.uid === uid);
		const inOrgs = Array.isArray(option.organizers) && option.organizers.some((c) => c.uid === uid);

		return inJoined || inOrgs;
	});
}
