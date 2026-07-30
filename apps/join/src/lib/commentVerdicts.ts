/**
 * Private per-author verdicts on the comments under one of their suggestions.
 *
 * A suggestion author triages incoming comments as `helpful` or `ignored` —
 * working state that feeds the "improve with AI" flow. Verdicts live in the
 * `commentVerdicts` collection (doc id `${authorUid}--${commentId}`) whose
 * rules restrict reads and writes to the author, so the marks stay private
 * to them at the data layer, not just in the UI.
 *
 * Same optimistic+confirmed dance as `userEvaluations.ts`, with one twist:
 * un-marking deletes the doc, so the optimistic map stores `null` to mean
 * "cleared, awaiting server confirmation".
 */

import m from 'mithril';
import { Collections } from '@freedi/shared-types';
import { db, collection, doc, setDoc, deleteDoc, query, where, Unsubscribe } from './firebase';
import { resilientOnSnapshot } from './resilientListeners';
import { getUserState } from './user';

export type CommentVerdict = 'helpful' | 'ignored';

let confirmed: Map<string, CommentVerdict> = new Map();
let optimistic: Map<string, CommentVerdict | null> = new Map();
let listenerUnsub: Unsubscribe | null = null;

/**
 * Pure resolution used by `getVerdict` and unit tests: an in-flight optimistic
 * entry (including an optimistic clear, stored as `null`) wins over whatever
 * the server last confirmed.
 */
export function resolveVerdict(
	optimisticMap: Map<string, CommentVerdict | null>,
	confirmedMap: Map<string, CommentVerdict>,
	commentId: string,
): CommentVerdict | undefined {
	if (optimisticMap.has(commentId)) {
		return optimisticMap.get(commentId) ?? undefined;
	}

	return confirmedMap.get(commentId);
}

/** The author's current verdict on a comment; `undefined` means unmarked. */
export function getVerdict(commentId: string): CommentVerdict | undefined {
	return resolveVerdict(optimistic, confirmed, commentId);
}

/** How many of `commentIds` currently resolve to `helpful`. */
export function countHelpful(
	commentIds: string[],
	resolve: (commentId: string) => CommentVerdict | undefined = getVerdict,
): number {
	return commentIds.filter((id) => resolve(id) === 'helpful').length;
}

/**
 * Optimistic verdict write. `null` clears the mark (deletes the doc). The
 * listener drops the optimistic entry once the server snapshot agrees; on
 * write failure we roll back so the chips reflect what's actually stored.
 */
export async function setVerdict(
	optionId: string,
	commentId: string,
	verdict: CommentVerdict | null,
): Promise<void> {
	const uid = getUserState().user?.uid;
	if (!uid) return;

	optimistic.set(commentId, verdict);
	m.redraw();

	const verdictId = `${uid}--${commentId}`;
	const ref = doc(db, Collections.commentVerdicts, verdictId);

	try {
		if (verdict === null) {
			await deleteDoc(ref);
		} else {
			await setDoc(ref, {
				verdictId,
				optionId,
				commentId,
				authorId: uid,
				verdict,
				updatedAt: Date.now(),
			});
		}
	} catch (err) {
		optimistic.delete(commentId);
		m.redraw();
		console.error('[setVerdict] failed:', err);
	}
}

/**
 * Subscribe to the author's verdicts under one suggestion. Only useful for
 * the suggestion's author — everyone else's query would return nothing (and
 * the rules would reject unfiltered reads). Tears down any prior subscription.
 */
export function subscribeCommentVerdicts(optionId: string): Unsubscribe {
	unsubscribeCommentVerdicts();

	const uid = getUserState().user?.uid;
	if (!uid) {
		return () => undefined;
	}

	const q = query(
		collection(db, Collections.commentVerdicts),
		where('optionId', '==', optionId),
		where('authorId', '==', uid),
	);

	listenerUnsub = resilientOnSnapshot('commentVerdicts', q, (snap) => {
		const next = new Map<string, CommentVerdict>();
		for (const d of snap.docs) {
			const data = d.data() as { commentId?: string; verdict?: string };
			if (
				typeof data.commentId === 'string' &&
				(data.verdict === 'helpful' || data.verdict === 'ignored')
			) {
				next.set(data.commentId, data.verdict);
			}
		}
		confirmed = next;

		// Drop optimistic entries the server now agrees with — a confirmed set
		// for marks, a confirmed absence for clears.
		for (const [commentId, verdict] of optimistic) {
			const serverVerdict = next.get(commentId);
			if (verdict === null ? serverVerdict === undefined : serverVerdict === verdict) {
				optimistic.delete(commentId);
			}
		}
		m.redraw();
	});

	return listenerUnsub;
}

export function unsubscribeCommentVerdicts(): void {
	if (listenerUnsub) {
		listenerUnsub();
		listenerUnsub = null;
	}
	confirmed = new Map();
	optimistic = new Map();
}
