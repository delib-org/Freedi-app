import type { Participant, Topic, TablePlan } from './types';
import { preferenceRank } from './preferences';
import { TableAssignmentError } from './errors';
import { LOWER_RANK_DEMAND_FACTOR } from './constants';

export interface TopicDemand {
	topicId: string;
	weight: number;
	maxTables: number;
}

/**
 * How many tables each topic gets and how big each is.
 *
 * Tables: as few as seat everyone within `tableSize`, spread over topics in
 * proportion to first-choice demand (largest remainder), each topic capped by
 * its `maxTables`. Second and third choices only break ties, so a topic that
 * nobody put first gets a table only when caps leave no other room. Sizes are
 * spread evenly so no table is a lonely leftover: 22 people at size 7 give
 * 6, 6, 5, 5, not 7, 7, 7, 1.
 */
export function allocateTables(
	participants: readonly Participant[],
	topics: readonly Topic[],
	tableSize: number,
	maxRanked: number,
	existing: ExistingTables = {},
): TablePlan[] {
	const seats = existing.seats ?? participants.length;
	if (seats === 0 || topics.length === 0) return [];

	const tableCount = Math.ceil(seats / tableSize);
	const demand = topicDemand(participants, topics, maxRanked, existing.tablesPerTopic);
	const tablesPerTopic = apportion(demand, tableCount);
	const plans = expand(demand, tablesPerTopic);
	assertEveryoneFits(plans, seats, tableSize);

	return sizeEvenly(plans, seats);
}

/** Tables that exist already: only `seats` more seats are planned, and each topic's cap counts what it has. */
export interface ExistingTables {
	seats?: number;
	tablesPerTopic?: ReadonlyMap<string, number>;
}

export function topicDemand(
	participants: readonly Participant[],
	topics: readonly Topic[],
	maxRanked: number,
	tablesPerTopic: ReadonlyMap<string, number> = new Map(),
): TopicDemand[] {
	const demand = topics.map<TopicDemand>((topic) => ({
		topicId: topic.id,
		weight: 0,
		maxTables: Math.max(
			0,
			(topic.maxTables ?? Number.POSITIVE_INFINITY) - (tablesPerTopic.get(topic.id) ?? 0),
		),
	}));
	for (const entry of demand) {
		for (const participant of participants) {
			const rank = preferenceRank(participant, entry.topicId, maxRanked);
			if (rank >= 0) entry.weight += LOWER_RANK_DEMAND_FACTOR ** rank;
		}
	}

	return demand;
}

/**
 * Hamilton apportionment with caps: quotas by weight, floors first, then the
 * largest remainders, skipping topics at their cap. Tables still left when
 * every wanted topic is capped go round-robin to any topic under its cap.
 * Returns the tables each topic gets, in the input order.
 */
function apportion(demand: readonly TopicDemand[], tableCount: number): number[] {
	const totalWeight = demand.reduce((sum, entry) => sum + entry.weight, 0);
	const quotas = demand.map((entry) =>
		totalWeight === 0 ? 0 : (tableCount * entry.weight) / totalWeight,
	);
	const tables = quotas.map((quota, i) => Math.min(Math.floor(quota), demand[i].maxTables));
	const order = quotas
		.map((quota, i) => ({ i, remainder: quota - Math.floor(quota) }))
		.sort((a, b) => b.remainder - a.remainder || b.i - a.i)
		.map(({ i }) => i);

	let remaining = tableCount - tables.reduce((sum, count) => sum + count, 0);
	remaining = handOut(
		remaining,
		order.filter((i) => demand[i].weight > 0),
		demand,
		tables,
	);
	handOut(remaining, order, demand, tables);

	return tables;
}

/** Deals `remaining` tables one at a time over `candidates` under their caps; returns what is left. */
function handOut(
	remaining: number,
	candidates: readonly number[],
	demand: readonly TopicDemand[],
	tables: number[],
): number {
	while (remaining > 0) {
		const open = candidates.filter((i) => tables[i] < demand[i].maxTables);
		if (open.length === 0) return remaining;
		for (const i of open) {
			if (remaining === 0) break;
			tables[i]++;
			remaining--;
		}
	}

	return 0;
}

/** One plan per table, topics in demand order (the heaviest first gets the +1 seats). */
function expand(demand: readonly TopicDemand[], tablesPerTopic: readonly number[]): TablePlan[] {
	const order = demand
		.map((entry, i) => ({ entry, i }))
		.sort((a, b) => b.entry.weight - a.entry.weight || a.i - b.i);
	const plans: TablePlan[] = [];
	for (const { entry, i } of order) {
		for (let t = 0; t < tablesPerTopic[i]; t++) plans.push({ topicId: entry.topicId, size: 0 });
	}

	return plans;
}

function assertEveryoneFits(plans: readonly TablePlan[], seats: number, tableSize: number): void {
	if (plans.length * tableSize < seats) {
		throw new TableAssignmentError('Topic caps leave too few tables to seat everyone', {
			seats,
			tableSize,
			tables: plans.length,
		});
	}
}

function sizeEvenly(plans: readonly TablePlan[], seats: number): TablePlan[] {
	const base = Math.floor(seats / plans.length);
	const extra = seats % plans.length;

	return plans.map((plan, i) => ({ ...plan, size: i < extra ? base + 1 : base }));
}
