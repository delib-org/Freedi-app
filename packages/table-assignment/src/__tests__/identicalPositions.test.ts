import { assignTables } from '../assignTables';
import { sideStats, tableDeviation } from '../stats';
import type { Participant } from '../types';
import { makeTopics, POSITION_STOPS } from './crowd';

const TOPICS = makeTopics(3);
const FOURTEEN = 14;
const CROWD_OF_FORTY = 40;
const SIX_DECLARED = 6;
const MAX_CROWD = 60;
/** A value whose repeated division by n leaves rounding noise. */
const NOISY_POSITION = 33.3;

function at(position: number | undefined, count: number, from = 0): Participant[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `p${from + i}`,
		side: position === undefined ? undefined : [position],
		preferences: [TOPICS[i % TOPICS.length].id],
	}));
}

describe('identical positions', () => {
	it('gives sd exactly 0 and deviation 0 for a crowd that agrees on 100', () => {
		const crowd = at(100, FOURTEEN);
		expect(sideStats(crowd).sd).toEqual([0]);
		const result = assignTables(crowd, TOPICS, { seed: 1 });
		expect(result.metrics.balance.max).toBe(0);
		expect(result.metrics.balance.withinTolerance).toBe(true);
	});

	it('treats rounding noise around a shared value as no spread', () => {
		const stats = sideStats(at(NOISY_POSITION, FOURTEEN));
		expect(stats.sd).toEqual([0]);
		expect(tableDeviation(stats, stats)).toBe(0);
	});

	it('is within tolerance when only six of forty declared, all at 50', () => {
		const crowd = [...at(50, SIX_DECLARED), ...at(undefined, CROWD_OF_FORTY - SIX_DECLARED, SIX_DECLARED)];
		const result = assignTables(crowd, TOPICS, { seed: 2 });
		expect(result.metrics.balance.withinTolerance).toBe(true);
	});

	it('is within tolerance for every stop and every crowd size from 1 to 60', () => {
		for (const stop of POSITION_STOPS) {
			for (let n = 1; n <= MAX_CROWD; n++) {
				const result = assignTables(at(stop, n), TOPICS, { seed: n, restarts: 1 });
				expect(result.metrics.balance.max).toBe(0);
				expect(result.metrics.balance.withinTolerance).toBe(true);
			}
		}
	});
});
