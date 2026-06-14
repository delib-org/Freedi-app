/**
 * Optimistic evaluation state (§4.2). The `evaluate` form action persists the
 * vote, but the option's denormalized stats — `corroborationScore` (C_p),
 * `evaluationAverage`, `evaluationCount` — are only recomputed server-side
 * (`recomputeAncestors`) and arrive a beat later over the realtime listener.
 *
 * To make voting feel instant we hold a per-statement *override*: the moment a
 * face is clicked we project the new C_p / average / evaluator-count locally and
 * render those, then drop the override once the authoritative recompute lands
 * (detected as the server stats moving off the pre-vote baseline).
 *
 * The projection is *exact* for a leaf option (no direct evidence children): its
 * C_p is purely `baseCredibility` over its own votes — the same closed form the
 * server scorer uses. For an option that already carries evidence we keep the
 * server's C_p (still updating count, average and the highlighted face), since
 * the full DF-QuAD combine can't be reproduced from denormalized fields alone.
 */
import type { Statement } from '@freedi/shared-types';

/** Mirrors `@freedi/evidence`'s DEFAULT_CORROBORATION_CONFIG (kept inline so the
 *  scorer package never enters the client bundle). κ = N/(N+k). */
const PRIOR = 0.5;
const K = 4;

/** Server-known stats for one option, as rendered before any optimistic touch. */
export interface EvalBase {
	/** The user's own vote ∈ {-1,-0.5,0,0.5,1} or null. */
	myVote: number | null;
	/** Number of evaluators. */
	count: number;
	/** Average vote ∈ [-1,1], or null when nobody has voted. */
	average: number | null;
	/** Consensus / corroboration C_p ∈ [0,1], or null. */
	consensus: number | null;
}

export interface EvalView extends EvalBase {
	/** True while an optimistic override is in effect (drives the change pulse). */
	pending: boolean;
}

interface Override {
	/** The optimistically-chosen vote (after toggle), null = retracted. */
	vote: number | null;
	/** The vote the *server baseline* below already reflects for this user. */
	baseVote: number | null;
	/** Server count / average captured the instant the override began — the
	 *  fingerprint we watch for "the recompute landed". */
	baseCount: number;
	baseAvg: number | null;
}

// Stat projections (count / average / C_p). These reconcile away once the
// server recompute lands.
const overrides = $state<Record<string, Override>>({});

// The user's own vote as the client knows it — set on every click and kept for
// the session. Unlike the stat override it does NOT reconcile away, because the
// realtime listener only carries statement aggregates, never the viewer's own
// vote; dropping it would snap the highlighted face back to the stale load-time
// value. A fresh page load re-reads the authoritative `myEvaluations`.
const myVotes = $state<Record<string, number | null>>({});

/** Leaf-option consensus: `baseCredibility` over the node's own votes. Exact for
 *  an option with no direct evidence children. `sum`/`count` are in [-1,1]. */
function leafConsensus(sum: number, count: number): number {
	if (count <= 0) return PRIOR;
	const vote01 = (sum / count + 1) / 2; // mean vote mapped [-1,1] → [0,1]
	const kappa = count / (count + K);

	return kappa * vote01 + (1 - kappa) * PRIOR;
}

/** Toggle-aware: clicking the already-selected face retracts the vote, mirroring
 *  the server's `evaluate`. Returns the resolved new vote. */
export function applyOptimistic(
	statementId: string,
	faceValue: number,
	base: EvalBase,
): number | null {
	const existing = overrides[statementId];
	const currentVote = existing ? existing.vote : base.myVote;
	const newVote = currentVote === faceValue ? null : faceValue;

	if (existing) {
		// Keep the original baseline snapshot — only the chosen vote changes.
		existing.vote = newVote;
	} else {
		overrides[statementId] = {
			vote: newVote,
			baseVote: base.myVote,
			baseCount: base.count,
			baseAvg: base.average,
		};
	}
	myVotes[statementId] = newVote;

	return newVote;
}

/** The POST failed (or redirected away) — discard the optimistic projection. */
export function revertOptimistic(statementId: string): void {
	delete overrides[statementId];
	delete myVotes[statementId];
}

/**
 * Realtime tick: once an option's server stats move off the pre-vote baseline,
 * the authoritative recompute has landed (and already includes this user's
 * persisted vote), so we drop the override and trust the server from here on.
 */
export function reconcileOptimistic(statements: Statement[]): void {
	for (const s of statements) {
		const o = overrides[s.statementId];
		if (!o) continue;
		const x = s as Statement & { evaluationCount?: number; evaluationAverage?: number };
		const count = typeof x.evaluationCount === 'number' ? x.evaluationCount : 0;
		const avg = typeof x.evaluationAverage === 'number' ? x.evaluationAverage : null;
		const countMoved = count !== o.baseCount;
		const avgMoved = avg !== null && (o.baseAvg === null || Math.abs(avg - o.baseAvg) > 1e-6);
		if (countMoved || avgMoved) delete overrides[s.statementId];
	}
}

/** Project the displayed stats: server base, adjusted by any pending override. */
export function viewEvaluation(statementId: string, base: EvalBase, leaf: boolean): EvalView {
	// The viewer's own vote: client-known value wins over the (possibly stale)
	// server load-time value, so the highlighted face stays correct after the
	// stat override has reconciled away.
	const myVote = statementId in myVotes ? myVotes[statementId] : base.myVote;

	const o = overrides[statementId];
	if (!o) return { ...base, myVote, pending: false };

	const deltaCount = (o.vote !== null ? 1 : 0) - (o.baseVote !== null ? 1 : 0);
	const count = Math.max(0, base.count + deltaCount);

	const serverSum = (base.average ?? 0) * base.count; // sum of votes in [-1,1]
	const sum = serverSum + ((o.vote ?? 0) - (o.baseVote ?? 0));
	const average = count > 0 ? sum / count : null;

	const consensus = leaf ? (count > 0 ? leafConsensus(sum, count) : null) : base.consensus;

	return { myVote, count, average, consensus, pending: true };
}
