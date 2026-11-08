import type {
	AssignedTable,
	AssignmentMetrics,
	Participant,
	PopulationStats,
	TablePlan,
} from './types';
import type { Seating } from './deal';
import { preferenceRank } from './preferences';
import { tableStats } from './stats';

export function buildTables(
	participants: readonly Participant[],
	plans: readonly TablePlan[],
	seating: Seating,
	population: PopulationStats,
): AssignedTable[] {
	return seating.map((members, index) => {
		const seated = members.map((i) => participants[i]);

		return {
			index,
			topicId: plans[index].topicId,
			memberIds: seated.map((p) => p.id),
			stats: tableStats(seated, population),
		};
	});
}

export function buildMetrics(
	participants: readonly Participant[],
	tables: readonly AssignedTable[],
	population: PopulationStats,
	maxRanked: number,
	tolerance: number,
): AssignmentMetrics {
	const deviations = tables.map((table) => table.stats.deviation);
	const max = Math.max(0, ...deviations);
	const byId = new Map(participants.map((p) => [p.id, p]));
	const byRank = new Array<number>(maxRanked).fill(0);
	let none = 0;
	let noPreference = 0;
	let score = 0;
	for (const table of tables) {
		for (const id of table.memberIds) {
			const participant = byId.get(id);
			if (!participant) continue;
			if (participant.preferences.length === 0) {
				noPreference++;
				continue;
			}
			const rank = preferenceRank(participant, table.topicId, maxRanked);
			if (rank < 0) none++;
			else {
				byRank[rank]++;
				score += maxRanked - rank;
			}
		}
	}

	return {
		population,
		balance: {
			max,
			mean: deviations.length ? deviations.reduce((a, b) => a + b, 0) / deviations.length : 0,
			tolerance,
			withinTolerance: max <= tolerance,
		},
		preferences: {
			byRank,
			none,
			noPreference,
			score,
			maxScore: (participants.length - noPreference) * maxRanked,
		},
	};
}
