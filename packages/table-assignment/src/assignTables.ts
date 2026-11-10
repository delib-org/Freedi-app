import type { Assignment, AssignmentOptions, Participant, Topic } from './types';
import {
	BALANCE_TOLERANCE_DEFAULT,
	MAX_RANKED_PREFERENCES,
	RESTARTS_DEFAULT,
	SWAP_TRIES_DEFAULT,
	TABLE_SIZE_DEFAULT,
} from './constants';
import { TableAssignmentError } from './errors';
import { createRng } from './rng';
import { allocateTables } from './allocateTables';
import { sideStats } from './stats';
import { dealSnake, type Seating } from './deal';
import { improveBySwaps, type SeatingScore } from './improve';
import { buildMetrics, buildTables } from './metrics';

interface ResolvedOptions {
	tableSize: number;
	maxRanked: number;
	tolerance: number;
	restarts: number;
	seed: number;
	maxSwapTries: number;
	locked: Readonly<Record<string, number>>;
}

/**
 * Seat every participant at a topic table so that each table mirrors the
 * crowd (same mean and spread of sides, within tolerance) and, inside that,
 * as many people as possible get a topic they asked for. Same input and seed,
 * same room.
 */
export function assignTables(
	participants: readonly Participant[],
	topics: readonly Topic[],
	options: AssignmentOptions = {},
): Assignment {
	const resolved = resolveOptions(options);
	validate(participants, topics, resolved);
	const plans = allocateTables(participants, topics, resolved.tableSize, resolved.maxRanked);
	const population = sideStats(participants);
	const lockedIndexes = new Set(
		participants.flatMap((p, i) => (resolved.locked[p.id] === undefined ? [] : [i])),
	);
	const rng = createRng(resolved.seed);

	let best: { seating: Seating; score: SeatingScore } | undefined;
	let triesLeft = resolved.maxSwapTries;
	for (let restart = 0; restart < resolved.restarts; restart++) {
		if (best && triesLeft <= 0) break;
		const seating = dealSnake(participants, plans, resolved.locked, rng);
		const score = improveBySwaps(
			participants,
			plans,
			seating,
			population,
			{ maxRanked: resolved.maxRanked, tolerance: resolved.tolerance, locked: lockedIndexes, maxSwapTries: triesLeft },
			rng,
		);
		triesLeft -= score.swapTries;
		if (!best || isBetter(score, best.score, resolved.tolerance)) best = { seating, score };
	}

	const tables = best ? buildTables(participants, plans, best.seating, population) : [];
	const metrics = buildMetrics(
		participants,
		tables,
		population,
		resolved.maxRanked,
		resolved.tolerance,
	);

	return { tables, seed: resolved.seed, metrics };
}

/** Within tolerance beats outside; then preferences; then the tightest, most even balance. */
function isBetter(candidate: SeatingScore, incumbent: SeatingScore, tolerance: number): boolean {
	const candidateFits = candidate.maxDeviation <= tolerance;
	const incumbentFits = incumbent.maxDeviation <= tolerance;
	if (candidateFits !== incumbentFits) return candidateFits;
	if (candidate.preferenceScore !== incumbent.preferenceScore)
		return candidate.preferenceScore > incumbent.preferenceScore;
	if (candidate.maxDeviation !== incumbent.maxDeviation)
		return candidate.maxDeviation < incumbent.maxDeviation;

	return candidate.sumDeviation < incumbent.sumDeviation;
}

function resolveOptions(options: AssignmentOptions): ResolvedOptions {
	return {
		tableSize: options.tableSize ?? TABLE_SIZE_DEFAULT,
		maxRanked: options.maxRankedPreferences ?? MAX_RANKED_PREFERENCES,
		tolerance: options.balanceTolerance ?? BALANCE_TOLERANCE_DEFAULT,
		restarts: options.restarts ?? RESTARTS_DEFAULT,
		seed: options.seed ?? Date.now(),
		maxSwapTries: options.maxSwapTries ?? SWAP_TRIES_DEFAULT,
		locked: options.locked ?? {},
	};
}

function validate(
	participants: readonly Participant[],
	topics: readonly Topic[],
	options: ResolvedOptions,
): void {
	if (!Number.isInteger(options.tableSize) || options.tableSize < 1) {
		throw new TableAssignmentError('tableSize must be a whole number of at least 1', {
			tableSize: options.tableSize,
		});
	}
	if (!Number.isInteger(options.restarts) || options.restarts < 1)
		throw new TableAssignmentError('restarts must be a whole number of at least 1', {
			restarts: options.restarts,
		});
	if (!Number.isInteger(options.maxRanked) || options.maxRanked < 0)
		throw new TableAssignmentError('maxRankedPreferences must be a whole number, 0 or more', {
			maxRankedPreferences: options.maxRanked,
		});
	if (Number.isNaN(options.tolerance) || options.tolerance < 0)
		throw new TableAssignmentError('balanceTolerance must be a number, 0 or more', {
			balanceTolerance: options.tolerance,
		});
	if (Number.isNaN(options.maxSwapTries) || options.maxSwapTries < 0)
		throw new TableAssignmentError('maxSwapTries must be a number, 0 or more', {
			maxSwapTries: options.maxSwapTries,
		});
	assertParticipantsWellFormed(participants);
	assertTopicsWellFormed(topics);
	assertUniqueIds(
		participants.map((p) => p.id),
		'participant',
	);
	assertUniqueIds(
		topics.map((t) => t.id),
		'topic',
	);
	const axes = new Set(participants.flatMap((p) => (p.side ? [p.side.length] : [])));
	if (axes.size > 1)
		throw new TableAssignmentError('Every declared side must have the same number of axes', {
			axes: [...axes],
		});
	if (participants.length > 0 && topics.length === 0)
		throw new TableAssignmentError('No topics to seat people at', {});
}

function assertParticipantsWellFormed(participants: readonly Participant[]): void {
	for (const participant of participants) {
		if (!Array.isArray(participant.preferences)) {
			throw new TableAssignmentError('Every participant needs a preferences array', {
				id: participant.id,
			});
		}
		if (participant.side === undefined) continue;
		if (!Array.isArray(participant.side) || !participant.side.every(Number.isFinite)) {
			throw new TableAssignmentError('A declared side must be an array of finite numbers', {
				id: participant.id,
			});
		}
	}
}

function assertTopicsWellFormed(topics: readonly Topic[]): void {
	for (const topic of topics) {
		const { maxTables } = topic;
		if (maxTables !== undefined && (!Number.isInteger(maxTables) || maxTables < 0)) {
			throw new TableAssignmentError('maxTables must be a whole number, 0 or more', {
				topicId: topic.id,
				maxTables,
			});
		}
	}
}

function assertUniqueIds(ids: readonly string[], kind: string): void {
	const seen = new Set<string>();
	for (const id of ids) {
		if (seen.has(id)) throw new TableAssignmentError(`Duplicate ${kind} id`, { id });
		seen.add(id);
	}
}
