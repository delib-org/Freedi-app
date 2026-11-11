import type { Participant, PopulationStats, TableStats } from './types';
import { CONSTANT_AXIS_RELATIVE_SD } from './constants';

/** Per-axis mean and population sd of the sides given (undeclared ones skipped). */
export function sideStats(members: readonly Participant[]): PopulationStats {
	const sides = members.flatMap((member) => (member.side ? [member.side] : []));
	const n = sides.length;
	if (n === 0) return { n, mean: [], sd: [] };

	const axes = sides[0].length;
	const mean = new Array<number>(axes).fill(0);
	const sd = new Array<number>(axes).fill(0);
	for (const side of sides) side.forEach((value, axis) => (mean[axis] += value));
	mean.forEach((total, axis) => (mean[axis] = total / n));
	for (const side of sides)
		side.forEach((value, axis) => (sd[axis] += (value - mean[axis]) ** 2 / n));

	return { n, mean, sd: sd.map((variance, axis) => cleanSd(Math.sqrt(variance), mean[axis])) };
}

/** Rounding noise around a shared value is no spread: identical positions give sd exactly 0. */
function cleanSd(sd: number, mean: number): number {
	return isConstantAxis(sd, mean) ? 0 : sd;
}

function isConstantAxis(sd: number, mean: number): boolean {
	return sd <= CONSTANT_AXIS_RELATIVE_SD * Math.max(1, Math.abs(mean));
}

/**
 * How far a table is from being a mirror of the crowd, in population-sd
 * units, averaged over axes: |mean shift| plus |spread shift|. An axis the
 * whole crowd agrees on (sd 0) cannot be unbalanced. A table with one declared
 * member has no spread of its own, so only its mean counts.
 */
export function tableDeviation(table: PopulationStats, population: PopulationStats): number {
	if (table.n === 0 || population.n === 0 || population.mean.length === 0) return 0;

	let total = 0;
	population.mean.forEach((populationMean, axis) => {
		const populationSd = population.sd[axis];
		if (isConstantAxis(populationSd, populationMean)) return;
		const meanShift = Math.abs(table.mean[axis] - populationMean) / populationSd;
		const spreadShift = table.n < 2 ? 0 : Math.abs(table.sd[axis] - populationSd) / populationSd;
		total += meanShift + spreadShift;
	});

	return total / population.mean.length;
}

export function tableStats(
	members: readonly Participant[],
	population: PopulationStats,
): TableStats {
	const stats = sideStats(members);

	return { ...stats, deviation: tableDeviation(stats, population) };
}
