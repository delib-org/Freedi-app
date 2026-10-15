import { describe, expect, it } from 'vitest';
import type { PartyDistance } from '../distance';
import { EARLY_RESULT_ISLANDS, matchConfidence } from '../matchConfidence';

const pd = (partyId: string, distance: number | null, sharedIslands = 5): PartyDistance => ({
	partyId,
	distance,
	sharedIslands,
});

describe('matchConfidence', () => {
	it('picks a single first place', () => {
		const result = matchConfidence([pd('b', 0.4), pd('a', 0.2)], 10, 5);
		expect(result.firstPlace.map((entry) => entry.partyId)).toEqual(['a']);
		expect(result.isTie).toBe(false);
	});

	it('groups parties tied at the best distance', () => {
		const result = matchConfidence([pd('a', 0.3), pd('b', 0.3), pd('c', 0.5)], 10, 5);
		expect(result.firstPlace.map((entry) => entry.partyId)).toEqual(['a', 'b']);
		expect(result.isTie).toBe(true);
	});

	it('does not tie parties further apart than the epsilon', () => {
		expect(matchConfidence([pd('a', 0.3), pd('b', 0.31)], 10, 5).isTie).toBe(false);
	});

	it('is early below the island threshold and solid at it', () => {
		expect(matchConfidence([pd('a', 0.2, EARLY_RESULT_ISLANDS - 1)], 2, 2).evidence).toBe('early');
		expect(matchConfidence([pd('a', 0.2, EARLY_RESULT_ISLANDS)], 6, 3).evidence).toBe('solid');
	});

	it('carries the answered counts', () => {
		const result = matchConfidence([pd('a', 0.2)], 7, 4);
		expect(result.answeredStatements).toBe(7);
		expect(result.answeredIslands).toBe(4);
	});

	it('handles empty and all-null input', () => {
		for (const input of [[], [pd('a', null, 0), pd('b', null, 0)]]) {
			const result = matchConfidence(input, 0, 0);
			expect(result.firstPlace).toEqual([]);
			expect(result.isTie).toBe(false);
			expect(result.evidence).toBe('early');
		}
	});

	it('ignores null-distance parties when ranking', () => {
		const result = matchConfidence([pd('x', null, 0), pd('a', 0.6)], 4, 4);
		expect(result.firstPlace.map((entry) => entry.partyId)).toEqual(['a']);
	});
});
