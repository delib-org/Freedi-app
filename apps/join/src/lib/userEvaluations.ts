/**
 * Per-user evaluations on options under the active question.
 *
 * Two maps, both keyed by optionId:
 *   • `confirmed` — what Firestore says (populated by the snapshot listener).
 *   • `optimistic` — what the user just clicked, before Firestore has acked.
 *
 * Reads (`getEffectiveEvaluation`) prefer optimistic over confirmed, so the
 * picked face stays highlighted with zero perceived lag. The listener clears
 * an optimistic entry as soon as the server confirms it (or it stays in
 * place if the server rejects, which surfaces as an inconsistency the
 * caller can notice).
 *
 * Carved out of store.ts so the optimistic+confirmed dance lives in one
 * place instead of being sprinkled through 2300 lines.
 */

import m from 'mithril';
import { Statement, Collections, Creator } from '@freedi/shared-types';
import { db, collection, doc, setDoc, query, where, onSnapshot, Unsubscribe } from './firebase';
import { getUserState } from './user';
import { unhighlightOption } from './newSolutionsBuffer';

let confirmed: Map<string, number> = new Map();
let optimistic: Map<string, number> = new Map();
let listenerUnsub: Unsubscribe | null = null;

/**
 * What face should be highlighted on the option's evaluation row? Returns
 * the optimistic value if a click is still in flight, otherwise the
 * server-confirmed value. `undefined` means the user hasn't evaluated yet.
 */
export function getEffectiveEvaluation(optionId: string): number | undefined {
	if (optimistic.has(optionId)) {
		return optimistic.get(optionId);
	}

	return confirmed.get(optionId);
}

function buildCreator(): Creator | null {
	const user = getUserState().user;
	if (!user?.uid) return null;

	return {
		uid: user.uid,
		displayName: user.displayName ?? '',
		email: user.email ?? null,
		photoURL: user.photoURL ?? null,
		isAnonymous: user.isAnonymous ?? false,
	};
}

/**
 * Optimistic evaluation write — mirrors the main app's `setEvaluationToDB`
 * shape so the same Cloud Function aggregates the result. Highlights the
 * face immediately, then writes through; the listener clears the optimistic
 * entry as soon as the server snapshot matches.
 */
export async function setEvaluation(option: Statement, score: number): Promise<void> {
	if (score < -1 || score > 1) return;
	if (!option.parentId) return;

	const creator = buildCreator();
	if (!creator) return;

	// Optimistic: paint the chosen face immediately so click → highlight has
	// no perceptible lag.
	optimistic.set(option.statementId, score);

	// Un-pin from the top-of-list highlight so the option falls to its
	// natural sorted position — the FLIP animation in Solutions.ts handles
	// the move.
	unhighlightOption(option.statementId);

	m.redraw();

	const evaluationId = `${creator.uid}--${option.statementId}`;
	const data = {
		parentId: option.parentId,
		evaluationId,
		statementId: option.statementId,
		evaluatorId: creator.uid,
		updatedAt: Date.now(),
		evaluation: score,
		evaluator: creator,
	};

	try {
		await setDoc(doc(db, Collections.evaluations, evaluationId), data);
	} catch (err) {
		// Roll the optimistic entry back so the UI reflects what's actually
		// saved on the server side.
		optimistic.delete(option.statementId);
		m.redraw();
		console.error('[setEvaluation] failed:', err);
		throw err;
	}
}

/**
 * Subscribe to the current user's evaluations under this question, so the
 * card UI re-renders into the correct selected face when other clients (or
 * another tab) update the value. Tears down any prior subscription.
 */
export function subscribeUserEvaluations(questionId: string): Unsubscribe {
	if (listenerUnsub) {
		listenerUnsub();
		listenerUnsub = null;
	}
	confirmed = new Map();
	optimistic = new Map();

	const creator = buildCreator();
	if (!creator) {
		return () => undefined;
	}

	const q = query(
		collection(db, Collections.evaluations),
		where('parentId', '==', questionId),
		where('evaluatorId', '==', creator.uid),
	);

	listenerUnsub = onSnapshot(q, (snap) => {
		const next = new Map<string, number>();
		for (const d of snap.docs) {
			const data = d.data() as { statementId?: string; evaluation?: number };
			if (typeof data.statementId === 'string' && typeof data.evaluation === 'number') {
				next.set(data.statementId, data.evaluation);
			}
		}
		confirmed = next;

		// Clear optimistic entries that the server has now confirmed (or that
		// the server resolved to the same value). Keeping a stale optimistic
		// override would mask a server-rejected write.
		for (const [optionId, optimisticScore] of optimistic) {
			const serverScore = next.get(optionId);
			if (serverScore === optimisticScore) {
				optimistic.delete(optionId);
			}
		}
		m.redraw();
	});

	return listenerUnsub;
}
