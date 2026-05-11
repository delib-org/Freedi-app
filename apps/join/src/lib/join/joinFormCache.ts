/**
 * Join-form submission cache + API.
 *
 * The three Maps in this module are the load-bearing UX optimization that
 * lets `handleJoin` skip the form modal on a second click (same role, same
 * question). They're populated on save and on first Firestore fetch; the
 * `subscribeUserJoinFormSubmission` listener keeps them honest across tabs
 * and admin resets.
 *
 * Historically these were embedded in store.ts. Carving them out into a
 * named module gives them their own surface for testing and makes the
 * cache lifecycle legible. Public exports flow back through `store.ts`
 * re-exports so existing call sites don't need to change.
 */

import m from 'mithril';
import { db, doc, getDoc, setDoc, onSnapshot, Unsubscribe } from '../firebase';
import { Collections } from '@freedi/shared-types';
import { getUserState } from '../user';

export type JoinRole = 'activist' | 'organizer';

export interface JoinFormSubmissionData {
	role: JoinRole | null;
	displayName: string;
	values: Record<string, string>;
}

// Module-private cache state. Three maps cover the three lookup shapes the
// UI needs:
//   • `joinFormSubmitted`         — set membership ("any submission at all?")
//   • `joinFormSubmittedRole`     — role-only peek (handleJoin's fast path)
//   • `joinFormSubmissionCache`   — full payload for re-opening the form
//
// Keys are `${questionId}_${userId}` everywhere.
const joinFormSubmitted = new Set<string>();
const joinFormSubmittedRole = new Map<string, JoinRole>();
const joinFormSubmissionCache = new Map<string, JoinFormSubmissionData>();

function cacheKey(questionId: string, userId: string): string {
	return `${questionId}_${userId}`;
}

/**
 * Checks Firestore (with cache fast path) for whether the user has any
 * submission under this question. Populates the cache on hit so subsequent
 * calls skip the read.
 */
export async function hasJoinFormSubmission(
	questionId: string,
	userId: string,
): Promise<boolean> {
	const key = cacheKey(questionId, userId);
	if (joinFormSubmitted.has(key)) return true;

	const submissionRef = doc(
		db,
		Collections.statements,
		questionId,
		'joinFormSubmissions',
		userId,
	);
	const snap = await getDoc(submissionRef);
	if (snap.exists()) {
		joinFormSubmitted.add(key);

		return true;
	}

	return false;
}

/** Synchronous peek at the cached submission role — null if unknown locally. */
export function getCachedJoinFormSubmissionRole(
	questionId: string,
	userId: string,
): JoinRole | null {
	return joinFormSubmittedRole.get(cacheKey(questionId, userId)) ?? null;
}

/** Synchronous peek at the full cached submission — null if not in cache. */
export function getCachedJoinFormSubmissionData(
	questionId: string,
	userId: string,
): JoinFormSubmissionData | null {
	return joinFormSubmissionCache.get(cacheKey(questionId, userId)) ?? null;
}

/**
 * Fetches the user's submission from Firestore and refreshes the cache.
 * Returns null if no submission exists; in that case the cache entries are
 * cleared so a subsequent click correctly re-opens the form modal.
 */
export async function getJoinFormSubmissionData(
	questionId: string,
	userId: string,
): Promise<JoinFormSubmissionData | null> {
	const key = cacheKey(questionId, userId);
	const submissionRef = doc(
		db,
		Collections.statements,
		questionId,
		'joinFormSubmissions',
		userId,
	);
	const snap = await getDoc(submissionRef);
	if (!snap.exists()) {
		joinFormSubmittedRole.delete(key);
		joinFormSubmissionCache.delete(key);

		return null;
	}
	const data = snap.data() as
		| { role?: JoinRole; displayName?: string; values?: Record<string, string> }
		| undefined;

	const submission: JoinFormSubmissionData = {
		role: data?.role ?? null,
		displayName: data?.displayName ?? '',
		values: data?.values ?? {},
	};
	if (submission.role) joinFormSubmittedRole.set(key, submission.role);
	joinFormSubmissionCache.set(key, submission);

	return submission;
}

/** Back-compat: legacy role-only lookup. Delegates to the full fetcher. */
export async function getJoinFormSubmissionRole(
	questionId: string,
	userId: string,
): Promise<JoinRole | null> {
	const submission = await getJoinFormSubmissionData(questionId, userId);

	return submission?.role ?? null;
}

/**
 * Writes the user's submission to `joinFormSubmissions/{userId}` and
 * updates every cache key. `optionId`/`optionTitle` are legacy fields kept
 * for back-compat with the original sheet-driven trigger — the new sheet
 * sync (`fn_syncOptionMembersToSheet`) doesn't read them.
 */
export async function saveJoinFormSubmission(
	questionId: string,
	userId: string,
	displayName: string,
	values: Record<string, string>,
	role: JoinRole = 'activist',
	optionId?: string,
	optionTitle?: string,
): Promise<void> {
	const now = Date.now();
	const submissionRef = doc(
		db,
		Collections.statements,
		questionId,
		'joinFormSubmissions',
		userId,
	);
	// Reset syncedToSheet so the legacy onDocumentWritten trigger (no longer
	// used for sheet sync, but still has a backup write side-effect) reflects
	// the latest payload.
	await setDoc(
		submissionRef,
		{
			userId,
			questionId,
			displayName,
			values,
			role,
			optionId: optionId ?? '',
			optionTitle: optionTitle ?? '',
			createdAt: now,
			lastUpdate: now,
			syncedToSheet: false,
		},
		{ merge: true },
	);

	const key = cacheKey(questionId, userId);
	joinFormSubmitted.add(key);
	joinFormSubmittedRole.set(key, role);
	joinFormSubmissionCache.set(key, { role, displayName, values });
}

/**
 * Listens to the current user's own `joinFormSubmissions/{uid}` doc for the
 * active question and keeps every cache map in sync with Firestore.
 *
 * Closes the silent-failure scenario where an admin runs `resetQuestionJoining`
 * from another browser while the user has the join page open — without this
 * listener, the user's tab still has `joinFormSubmittedRole` populated, so
 * the next join click silently skips the form modal, the membership write
 * succeeds, but the sheet trigger finds no submission and returns
 * `skipped-no-submission`. The user sees themselves as joined in the app but
 * is invisible in the sheet.
 */
export function subscribeUserJoinFormSubmission(questionId: string): Unsubscribe {
	const user = getUserState().user;
	if (!user?.uid) {
		return () => undefined;
	}
	const uid = user.uid;
	const key = cacheKey(questionId, uid);
	const submissionRef = doc(
		db,
		Collections.statements,
		questionId,
		'joinFormSubmissions',
		uid,
	);

	return onSnapshot(submissionRef, (snap) => {
		if (!snap.exists()) {
			joinFormSubmittedRole.delete(key);
			joinFormSubmissionCache.delete(key);
			joinFormSubmitted.delete(key);
			m.redraw();

			return;
		}
		const data = snap.data() as
			| { role?: JoinRole; displayName?: string; values?: Record<string, string> }
			| undefined;
		joinFormSubmitted.add(key);
		if (data?.role) joinFormSubmittedRole.set(key, data.role);
		joinFormSubmissionCache.set(key, {
			role: data?.role ?? null,
			displayName: data?.displayName ?? '',
			values: data?.values ?? {},
		});
		m.redraw();
	});
}

/**
 * Drops every cache key for a list of user ids under one question. Used by
 * `resetQuestionJoining` after wiping the underlying Firestore docs. Always
 * safe; never throws.
 */
export function clearJoinFormCacheForUsers(
	questionId: string,
	userIds: Iterable<string>,
): void {
	for (const userId of userIds) {
		const key = cacheKey(questionId, userId);
		joinFormSubmitted.delete(key);
		joinFormSubmittedRole.delete(key);
		joinFormSubmissionCache.delete(key);
	}
}
