import type { Participant, PopulationStats, TablePlan } from './types';
import type { Seating } from './deal';
import type { Rng } from './rng';
import { shuffle } from './rng';
import { preferenceWeight } from './preferences';
import { sideStats, tableDeviation } from './stats';
import { IMPROVEMENT_EPSILON, MAX_IMPROVEMENT_PASSES } from './constants';

export interface SearchOptions {
	maxRanked: number;
	tolerance: number;
	locked: ReadonlySet<number>;
	/** Stop after this many evaluated swaps and keep the seating reached so far. */
	maxSwapTries: number;
}

/** What the search tracks about a seating; also the score a restart is judged by. */
export interface SeatingScore {
	preferenceScore: number;
	maxDeviation: number;
	sumDeviation: number;
	/** Swaps evaluated to get here, the search's own measure of work. */
	swapTries: number;
}

interface SearchState {
	seating: Seating;
	deviations: number[];
	swapTries: number;
	score: SeatingScore;
}

/**
 * Pairwise swaps that raise the preference score while every table stays a
 * mirror of the crowd (worst deviation within tolerance, or at least no worse
 * than it already was). Swaps that leave preferences untouched are taken when
 * they tighten the balance. Repeats until a full pass changes nothing.
 */
export function improveBySwaps(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	seating: Seating,
	population: PopulationStats,
	options: SearchOptions,
	rng: Rng,
): SeatingScore {
	const state = initialState(participants, plans, seating, population, options.maxRanked);
	runPasses(participants, plans, population, options, state, rng, 'balance');
	runPasses(participants, plans, population, options, state, rng, 'preference');

	return { ...state.score, swapTries: state.swapTries };
}

type Phase = 'balance' | 'preference';

/**
 * The balance phase runs first and takes any swap that evens out the room
 * while the worst table is outside tolerance, whatever it costs in
 * preferences. The preference phase then trades under the usual ceiling.
 */
function runPasses(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	population: PopulationStats,
	options: SearchOptions,
	state: SearchState,
	rng: Rng,
	phase: Phase,
): void {
	for (let pass = 0; pass < MAX_IMPROVEMENT_PASSES; pass++) {
		if (state.swapTries >= options.maxSwapTries) break;
		if (phase === 'balance' && state.score.maxDeviation <= options.tolerance) break;
		const swapped = onePass(participants, plans, population, options, state, rng, phase);
		if (!swapped) break;
	}
}

export function scoreSeating(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	seating: Seating,
	population: PopulationStats,
	maxRanked: number,
): SeatingScore {
	return initialState(participants, plans, seating, population, maxRanked).score;
}

function initialState(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	seating: Seating,
	population: PopulationStats,
	maxRanked: number,
): SearchState {
	const deviations = seating.map((members) => deviationOf(members, participants, population));
	const preferenceScore = seating.reduce(
		(sum, members, t) =>
			sum +
			members.reduce(
				(inner, i) => inner + preferenceWeight(participants[i], plans[t].topicId, maxRanked),
				0,
			),
		0,
	);

	return {
		seating,
		deviations,
		swapTries: 0,
		score: {
			preferenceScore,
			maxDeviation: Math.max(0, ...deviations),
			sumDeviation: sum(deviations),
			swapTries: 0,
		},
	};
}

function onePass(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	population: PopulationStats,
	options: SearchOptions,
	state: SearchState,
	rng: Rng,
	phase: Phase,
): boolean {
	let swapped = false;
	for (const [a, b] of shuffle(tablePairs(plans.length), rng)) {
		if (state.swapTries >= options.maxSwapTries) break;
		const maxElsewhere = Math.max(0, ...state.deviations.filter((_, t) => t !== a && t !== b));
		for (let ia = 0; ia < state.seating[a].length; ia++) {
			for (let ib = 0; ib < state.seating[b].length; ib++) {
				if (
					trySwap(
						participants,
						plans,
						population,
						options,
						state,
						[a, ia],
						[b, ib],
						maxElsewhere,
						phase,
					)
				)
					swapped = true;
			}
		}
	}

	return swapped;
}

type Seat = readonly [table: number, position: number];

function trySwap(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	population: PopulationStats,
	options: SearchOptions,
	state: SearchState,
	[a, ia]: Seat,
	[b, ib]: Seat,
	maxElsewhere: number,
	phase: Phase,
): boolean {
	const pa = state.seating[a][ia];
	const pb = state.seating[b][ib];
	if (options.locked.has(pa) || options.locked.has(pb)) return false;
	state.swapTries++;

	const gain = preferenceGain(
		participants[pa],
		participants[pb],
		plans[a].topicId,
		plans[b].topicId,
		options.maxRanked,
	);
	if (phase === 'preference' && gain < 0) return false;
	if (phase === 'balance' && state.score.maxDeviation <= options.tolerance) return false;
	if ((phase === 'balance' || gain === 0) && noSideToTrade(participants[pa], participants[pb])) return false;

	state.seating[a][ia] = pb;
	state.seating[b][ib] = pa;
	const devA = deviationOf(state.seating[a], participants, population);
	const devB = deviationOf(state.seating[b], participants, population);
	const next: SeatingScore = {
		preferenceScore: state.score.preferenceScore + gain,
		maxDeviation: Math.max(maxElsewhere, devA, devB),
		sumDeviation:
			state.score.sumDeviation - state.deviations[a] - state.deviations[b] + devA + devB,
		swapTries: 0,
	};
	const accepted =
		phase === 'balance' ? evensOut(state.score, next) : accepts(state.score, next, options.tolerance);
	if (!accepted) {
		state.seating[a][ia] = pa;
		state.seating[b][ib] = pb;

		return false;
	}
	state.deviations[a] = devA;
	state.deviations[b] = devB;
	state.score = next;

	return true;
}

/**
 * Balance is the hard constraint, preferences the objective. A swap that
 * helps preferences is taken when the worst table stays within tolerance
 * (or no worse than it already is); one that helps nobody's preference is
 * taken only when it makes the room more even.
 */
function accepts(current: SeatingScore, next: SeatingScore, tolerance: number): boolean {
	const ceiling = Math.max(tolerance, current.maxDeviation) + IMPROVEMENT_EPSILON;
	if (next.preferenceScore > current.preferenceScore) return next.maxDeviation <= ceiling;

	return evensOut(current, next);
}

/** Taken when it lowers the worst table, or keeps it and lowers the total. */
function evensOut(current: SeatingScore, next: SeatingScore): boolean {
	if (next.maxDeviation < current.maxDeviation - IMPROVEMENT_EPSILON) return true;

	return (
		next.maxDeviation <= current.maxDeviation + IMPROVEMENT_EPSILON &&
		next.sumDeviation < current.sumDeviation - IMPROVEMENT_EPSILON
	);
}

function preferenceGain(
	a: Participant,
	b: Participant,
	topicA: string,
	topicB: string,
	maxRanked: number,
): number {
	return (
		preferenceWeight(a, topicB, maxRanked) +
		preferenceWeight(b, topicA, maxRanked) -
		preferenceWeight(a, topicA, maxRanked) -
		preferenceWeight(b, topicB, maxRanked)
	);
}

/** Two undeclared participants, or two with identical sides, cannot change any table's balance. */
function noSideToTrade(a: Participant, b: Participant): boolean {
	if (!a.side && !b.side) return true;
	if (!a.side || !b.side) return false;

	return a.side.length === b.side.length && a.side.every((value, axis) => value === b.side?.[axis]);
}

function deviationOf(
	members: readonly number[],
	participants: readonly Participant[],
	population: PopulationStats,
): number {
	return tableDeviation(sideStats(members.map((i) => participants[i])), population);
}

function tablePairs(tables: number): Array<[number, number]> {
	const pairs: Array<[number, number]> = [];
	for (let a = 0; a < tables; a++) for (let b = a + 1; b < tables; b++) pairs.push([a, b]);

	return pairs;
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
