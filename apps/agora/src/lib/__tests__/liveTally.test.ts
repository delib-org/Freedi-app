import { describe, it, expect } from 'vitest';
import { liveWeighings, tallyRow } from '../flows/liveTally';

describe('tallyRow', () => {
	it('says nothing when nothing has happened', () => {
		expect(tallyRow(0, 0)).toEqual({ state: 'none' });
	});

	it('reports the weighing the server has not counted yet', () => {
		expect(tallyRow(0, 3)).toEqual({ state: 'counting', weighed: 3 });
	});

	it('says how many are still on the way once a figure is up', () => {
		expect(tallyRow(2, 5)).toEqual({ state: 'behind', pending: 3 });
	});

	it('is settled when the figure has caught up', () => {
		expect(tallyRow(4, 4)).toEqual({ state: 'settled' });
	});

	it('trusts the server when the live timeline is behind it', () => {
		// A retraction, or a trimmed timeline: never contradict the aggregate
		expect(tallyRow(4, 1)).toEqual({ state: 'settled' });
	});

	it('treats nonsense counts as zero rather than throwing', () => {
		expect(tallyRow(-1, -1)).toEqual({ state: 'none' });
	});
});

describe('liveWeighings', () => {
	const timeline = {
		s1: [{ evaluatorId: 'u1' }, { evaluatorId: 'u2' }],
		s2: [{ evaluatorId: 'u1' }, { evaluatorId: 'u1' }],
		s3: [],
	};

	it('counts people, not events — a re-rating is not a second voice', () => {
		const counts = liveWeighings(timeline, ['s1', 's2', 's3']);

		expect(counts.get('s1')).toBe(2);
		expect(counts.get('s2')).toBe(1);
		expect(counts.get('s3')).toBe(0);
	});

	it('gives a text nobody has touched a zero, not undefined', () => {
		expect(liveWeighings(timeline, ['unknown']).get('unknown')).toBe(0);
	});
});
