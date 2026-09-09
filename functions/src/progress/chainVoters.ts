/**
 * The electorate of a question: how many distinct people have evaluated
 * anything under it or under a question above it.
 *
 * This is the number every option beneath a question uses as N when nobody has
 * declared a stakeholder count by hand (see `resolveStakeholderCount` in
 * shared-types). It replaced the subscriber count, which measured traffic
 * rather than participation — a browser auto-subscribes the moment it opens a
 * page, so a question with two voters was reporting an electorate of fifteen.
 *
 * ## Why the chain, and why only upward
 *
 * Voting in a question makes you a stakeholder in that question and in every
 * question NESTED INSIDE it: you have taken part in the deliberation those
 * sub-questions belong to. It does not make you a stakeholder in a sibling
 * branch you never opened. So the set is the union along the ancestor chain,
 * and sibling subtrees never contribute to each other.
 *
 * ## Why it is recomputed here rather than pushed down
 *
 * A new voter in a question changes the number for that question AND for every
 * question nested below it — a fan-out that is unbounded in the tree's width.
 * Instead each question refreshes its own number whenever a vote lands in it,
 * which is precisely when the number is about to be consumed by the evaluation
 * trigger. A question nobody is voting in keeps a stale count, and that is the
 * correct behaviour rather than a tolerated one: the recorded N is meant to be
 * the N that produced the scores currently stored on its options.
 *
 * Cost in the common case (a question with no ancestors, or none that anyone
 * votes in directly) is a single document read, and no read at all once the
 * fingerprint below stops moving.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { Collections, QuestionParticipation, Statement } from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';

/** A tree deeper than this is a cycle or a bug; stop walking rather than spin. */
const MAX_CHAIN_DEPTH = 12;

/**
 * Ceiling on the marker documents one union recompute may read. Past this the
 * count falls back to the largest single question in the chain, which is a
 * lower bound on the union and so understates the electorate — the same
 * direction every other inference here errs in.
 */
const MAX_MARKER_READS = 5000;

const TOP_PARENT_SENTINEL = 'top';

/** Per-instance cache of a question's ancestor chain. Ancestry never moves. */
const chainCache = new Map<string, string[]>();
const CHAIN_CACHE_LIMIT = 500;

/**
 * The question and its ancestors, nearest first. Walks `parentId` rather than
 * trusting the denormalised `parents` array, which is only guaranteed to hold
 * the direct parent and the top and so can skip the middle of a deep tree.
 */
async function resolveChain(questionId: string): Promise<string[]> {
	const cached = chainCache.get(questionId);
	if (cached) return cached;

	const chain: string[] = [questionId];
	let currentId = questionId;

	for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth++) {
		const snap = await db.collection(Collections.statements).doc(currentId).get();
		if (!snap.exists) break;

		const parentId = (snap.data() as Partial<Statement> | undefined)?.parentId;
		if (!parentId || parentId === TOP_PARENT_SENTINEL || chain.includes(parentId)) break;

		chain.push(parentId);
		currentId = parentId;
	}

	if (chainCache.size >= CHAIN_CACHE_LIMIT) chainCache.clear();
	chainCache.set(questionId, chain);

	return chain;
}

/**
 * Distinct evaluators across the whole chain. One equality query per chain
 * member on `statementId` alone — the `evaluated` flag is filtered in memory
 * so this needs no composite index.
 */
async function countChainUnion(chain: string[]): Promise<number | undefined> {
	const voters = new Set<string>();
	let read = 0;

	for (const statementId of chain) {
		const snap = await db
			.collection(Collections.questionParticipation)
			.where('statementId', '==', statementId)
			.get();

		read += snap.docs.length;
		if (read > MAX_MARKER_READS) return undefined;

		for (const doc of snap.docs) {
			const marker = doc.data() as Partial<QuestionParticipation>;
			if (marker.evaluated && marker.userId) voters.add(marker.userId);
		}
	}

	return voters.size;
}

/**
 * Recompute and persist `chainEvaluators` for one question.
 *
 * The fingerprint is the chain's per-question unique-evaluator counters. Those
 * only move when somebody votes in a question of the chain for the first time,
 * which is exactly when the union can change — so an unchanged fingerprint is
 * proof the stored number is still correct, and the expensive union query runs
 * once per new voter rather than once per vote.
 *
 * Never throws: a failure here must not fail the evaluation that triggered it.
 * The number simply stays at its previous value.
 */
export async function refreshChainVoters(questionId: string): Promise<number | undefined> {
	if (!questionId || questionId === TOP_PARENT_SENTINEL) return undefined;

	try {
		const chain = await resolveChain(questionId);
		const progressRef = db.collection(Collections.questionProgress).doc(questionId);

		const progressSnaps = await db.getAll(
			...chain.map((id) => db.collection(Collections.questionProgress).doc(id)),
		);

		const evaluatedPerQuestion = progressSnaps.map((snap) => {
			const value = snap.exists ? (snap.data()?.evaluated as number | undefined) : undefined;

			return typeof value === 'number' && Number.isFinite(value) ? value : 0;
		});

		const fingerprint = chain.map((id, i) => `${id}:${evaluatedPerQuestion[i]}`).join('|');
		const stored = progressSnaps[0]?.exists ? progressSnaps[0].data() : undefined;
		if (stored?.chainKey === fingerprint) {
			return typeof stored.chainEvaluated === 'number' ? stored.chainEvaluated : undefined;
		}

		// A single-question chain needs no union: its own counter IS the answer.
		// Only when an ancestor has voters of its own can the two sets overlap.
		const ancestorsHaveVoters = evaluatedPerQuestion.slice(1).some((n) => n > 0);
		const count = ancestorsHaveVoters
			? ((await countChainUnion(chain)) ?? Math.max(...evaluatedPerQuestion))
			: evaluatedPerQuestion[0];

		const now = Date.now();
		const batch = db.batch();
		batch.set(progressRef, { chainEvaluated: count, chainKey: fingerprint }, { merge: true });
		// Mirrored onto the statement so the evaluation trigger reads it off the
		// parent document it is already holding, at no extra cost, and so the
		// settings screen can show the admin what N their options are using.
		batch.update(db.collection(Collections.statements).doc(questionId), {
			'evaluation.chainEvaluators': count > 0 ? count : FieldValue.delete(),
			lastUpdate: now,
		});
		await batch.commit();

		return count;
	} catch (error) {
		logError(error, {
			operation: 'progress.refreshChainVoters',
			statementId: questionId,
		});

		return undefined;
	}
}

/** Test-only: reset the per-instance ancestor-chain cache. */
export function clearChainCache(): void {
	chainCache.clear();
}
