import type { ClassVoteDisplay, ClassVoteOrder, Statement } from '@freedi/shared-types';

/**
 * What the students' vote screen shows of the running vote. Pure, so each rule
 * is unit-testable. The only source is the challenge question's `selections{}`
 * (vote counts per proposal, kept by the fn_vote trigger): an aggregate, never
 * who voted for what.
 */

const PERCENT = 100;

export interface VoteResult {
	count: number;
	/** 0..100: this proposal's share of the votes cast on the ballot. */
	percent: number;
}

function displayOf(challenge: Statement | null | undefined): ClassVoteDisplay {
	return challenge?.statementSettings?.voteDisplay ?? {};
}

/** The teacher's "students see live results" switch. On unless switched off. */
export function liveResultsOn(challenge: Statement | null | undefined): boolean {
	return displayOf(challenge).liveResults !== false;
}

// >>> voteSummary BEGIN
/** The default order: by C_p (statement.consensus), the proposals the class agrees on most. */
export const DEFAULT_VOTE_ORDER: ClassVoteOrder = 'consensus';

/** What the teacher chose for the order of the proposals (one setting for every screen). */
export function voteOrderOf(challenge: Statement | null | undefined): ClassVoteOrder {
	const order = displayOf(challenge).order;

	return order === 'votes' || order === 'random' || order === 'consensus'
		? order
		: DEFAULT_VOTE_ORDER;
}

/** 'result' is the finished ballot: votes, then C_p, then id (the `decideBallot` rule), winner first. */
export type BallotOrderMode = ClassVoteOrder | 'result';

export interface BallotScores {
	/** statement.consensus (C_p) per proposal; missing = lowest. */
	consensus: Readonly<Record<string, number>>;
	/** Votes per proposal; missing = 0. */
	votes: Readonly<Record<string, number>>;
}

const HASH_OFFSET = 2166136261;
const HASH_PRIME = 16777619;
const MULBERRY_STEP = 0x6d2b79f5;
const UINT32 = 4294967296;

/** FNV-1a: a string to a 32-bit seed. */
function seedOf(text: string): number {
	let hash = HASH_OFFSET;
	for (let i = 0; i < text.length; i += 1) {
		hash = Math.imul(hash ^ text.charCodeAt(i), HASH_PRIME) >>> 0;
	}

	return hash;
}

/** mulberry32: a small seeded random generator (0 <= value < 1). */
function randomFrom(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (state + MULBERRY_STEP) >>> 0;
		let z = state;
		z = Math.imul(z ^ (z >>> 15), z | 1);
		z ^= z + Math.imul(z ^ (z >>> 7), z | 61);

		return ((z ^ (z >>> 14)) >>> 0) / UINT32;
	};
}

/**
 * The same shuffle for the same ids and seed, on every phone and the
 * projector: ids are sorted first, so the ballot's own order never matters.
 */
export function seededShuffle(ids: readonly string[], seed: string): string[] {
	const out = [...ids].sort();
	const next = randomFrom(seedOf(seed));
	for (let i = out.length - 1; i > 0; i -= 1) {
		const j = Math.floor(next() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}

	return out;
}

/** `previous` kept for the ids still on the ballot, new ids after it (by id). */
export function keepOrder(candidateIds: readonly string[], previous: readonly string[]): string[] {
	const wanted = new Set(candidateIds);
	const seen = previous.filter((id) => wanted.has(id));
	const known = new Set(seen);

	return [...seen, ...candidateIds.filter((id) => !known.has(id)).sort()];
}

function higherFirst(a: number, b: number): number {
	return a === b ? 0 : a > b ? -1 : 1;
}

/**
 * The ballot in the order the teacher chose; one function for the phones, the
 * projector and the Summary.
 * - 'consensus': highest C_p first. 'votes': most votes first. Ties keep the
 *   order already shown (`previous`), so a card moves only when it really
 *   overtakes another; new ids fall back to id.
 * - 'random': one shared shuffle seeded by `seed` (the challenge id); it never
 *   changes while the vote runs.
 * - 'result': the finished ballot, winner first.
 */
export function orderBallot(
	candidateIds: readonly string[],
	mode: BallotOrderMode,
	scores: BallotScores,
	previous: readonly string[],
	seed: string,
): string[] {
	if (mode === 'random') return seededShuffle(candidateIds, seed);
	const consensus = (id: string): number => scores.consensus[id] ?? Number.NEGATIVE_INFINITY;
	const votes = (id: string): number => scores.votes[id] ?? 0;
	const base = keepOrder(candidateIds, mode === 'result' ? [] : previous);
	const rank = new Map(base.map((id, index) => [id, index]));
	const tieRank = (a: string, b: string): number => (rank.get(a) ?? 0) - (rank.get(b) ?? 0);

	return [...base].sort((a, b) => {
		if (mode === 'result') {
			return (
				higherFirst(votes(a), votes(b)) || higherFirst(consensus(a), consensus(b)) || tieRank(a, b)
			);
		}
		const by = mode === 'votes' ? votes : consensus;

		return higherFirst(by(a), by(b)) || tieRank(a, b);
	});
}

/** Vote counts per proposal, out of `voteResults`. */
export function countsOf(results: Record<string, VoteResult>): Record<string, number> {
	return Object.fromEntries(Object.entries(results).map(([id, result]) => [id, result.count]));
}

/** statement.consensus (C_p) per proposal id. */
export function consensusOf(options: readonly Statement[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const option of options) {
		if (typeof option.consensus === 'number' && Number.isFinite(option.consensus)) {
			out[option.statementId] = option.consensus;
		}
	}

	return out;
}
// >>> voteSummary END

function countOf(selections: Record<string, number> | undefined, id: string): number {
	const value = selections?.[id];

	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Each candidate's votes and share of all votes on the ballot. Withdrawals
 * ('none') and options off the ballot do not count; no votes yet = 0% each.
 */
export function voteResults(
	candidateIds: readonly string[],
	selections: Record<string, number> | undefined,
): Record<string, VoteResult> {
	const counts = candidateIds.map((id) => [id, countOf(selections, id)] as const);
	const total = counts.reduce((sum, [, count]) => sum + count, 0);

	return Object.fromEntries(
		counts.map(([id, count]) => [
			id,
			{ count, percent: total === 0 ? 0 : Math.round((count / total) * PERCENT) },
		]),
	);
}
