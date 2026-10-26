import { DEFAULT_GATE, decideBallot } from '@freedi/shared-types';
import type { ClassBallot } from '@freedi/shared-types';

/**
 * Pure ballot logic behind `classFreezeBallot` / `classCloseBallot`.
 */

/** Shortlist size when fewer than two proposals pass the gate. */
export const DEFAULT_BALLOT_TOP_N = 3;
/** A ballot needs at least this many candidates before the gate alone decides it. */
export const MIN_GATED_CANDIDATES = 2;
/** Upper bound on a requested topN (a class ballot is a handful of radio cards). */
export const MAX_BALLOT_TOP_N = 10;

export interface BallotOption {
	statementId: string;
	consensus?: number;
	hide?: boolean;
}

interface GateSource {
	votingSettings?: { threshold?: number };
}

/** The lesson's gate: the challenge question's threshold, else the workspace's, else 0.6. */
export function resolveGate(challenge: GateSource, main?: GateSource): number {
	const fromChallenge = challenge.votingSettings?.threshold;
	if (typeof fromChallenge === 'number') return fromChallenge;
	const fromMain = main?.votingSettings?.threshold;
	if (typeof fromMain === 'number') return fromMain;

	return DEFAULT_GATE;
}

function byConsensus(x: BallotOption, y: BallotOption): number {
	const diff = (y.consensus ?? 0) - (x.consensus ?? 0);

	return diff !== 0 ? diff : x.statementId < y.statementId ? -1 : 1;
}

/**
 * Candidates: every visible option at or above the gate (highest consensus
 * first) when at least two pass; otherwise the top N visible options.
 */
export function selectBallotCandidates(
	options: BallotOption[],
	gate: number,
	topN: number = DEFAULT_BALLOT_TOP_N,
): string[] {
	const visible = options.filter((o) => !o.hide).sort(byConsensus);
	const passing = visible.filter((o) => (o.consensus ?? 0) >= gate);
	if (passing.length >= MIN_GATED_CANDIDATES) return passing.map((o) => o.statementId);
	const n = Math.max(1, Math.min(MAX_BALLOT_TOP_N, Math.floor(topN)));

	return visible.slice(0, n).map((o) => o.statementId);
}

/** Votes per candidate from the challenge question's `selections{}`; sentinels and non-candidates dropped. */
export function tallyCandidates(
	candidateIds: string[],
	selections: Record<string, number> | undefined,
): Record<string, number> {
	return Object.fromEntries(
		candidateIds.map((id) => {
			const votes = selections?.[id];

			return [id, typeof votes === 'number' && votes > 0 ? votes : 0];
		}),
	);
}

/** The decision, or null for an empty ballot. Zero votes everywhere falls through to consensus. */
export function decideFromTally(
	tally: Record<string, number>,
	consensus: Record<string, number>,
): string | null {
	if (Object.keys(tally).length === 0) return null;

	return decideBallot(tally, consensus);
}

export type PauseRefusal = 'not-open' | 'closed';

export type PauseDecision =
	| { kind: 'refuse'; reason: PauseRefusal }
	| { kind: 'unchanged'; pausedAt: number | null }
	| { kind: 'write'; ballot: ClassBallot; pausedAt: number | null };

/**
 * Pause (votes locked, kept) or resume the ballot. Closing stays final: a
 * closed ballot is neither paused nor resumed. A repeat of the current state
 * writes nothing.
 */
export function decidePause(
	ballot: ClassBallot | undefined,
	paused: boolean,
	now: number,
): PauseDecision {
	if (!ballot) return { kind: 'refuse', reason: 'not-open' };
	if (typeof ballot.closedAt === 'number') return { kind: 'refuse', reason: 'closed' };
	const isPaused = typeof ballot.pausedAt === 'number';
	if (isPaused === paused) return { kind: 'unchanged', pausedAt: ballot.pausedAt ?? null };
	if (paused) return { kind: 'write', ballot: { ...ballot, pausedAt: now }, pausedAt: now };
	const open: ClassBallot = { ...ballot };
	delete open.pausedAt;

	return { kind: 'write', ballot: open, pausedAt: null };
}
