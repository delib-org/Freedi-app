import { describeChart } from '../a11y';

describe('describeChart', () => {
	it('names the kind, the series and the entry count', () => {
		const desc = describeChart(
			{ kind: 'line', keys: [], granularity: 'day', series: [] },
			{ head: ['', 'Score', 'Reach'], rows: [['a', '1', '2'], ['b', '3', '4']] },
		);
		expect(desc).toBe('line chart; Score, Reach; 2 entries');
	});

	it('uses the singular for one entry and skips empty headers', () => {
		expect(describeChart({ kind: 'strip', parts: [] }, { head: ['', ''], rows: [['a', '1']] })).toBe('proportion strip; 1 entry');
	});
});
