import {
	AGORA_CIVIC_CENTER_POSITION,
	deriveCivicCampPosition,
	deriveCivicCampPositionFromIsland,
} from '@freedi/shared-types';

// A 4-stance island authored as a spectrum: s1 is the left pole, s4 the right.
const STANCES = [
	{ statementId: 's1', order: 1 },
	{ statementId: 's2', order: 2 },
	{ statementId: 's3', order: 3 },
	{ statementId: 's4', order: 4 },
];

describe('deriveCivicCampPositionFromIsland', () => {
	it('matches the anchor derivation when the player marked a pole', () => {
		const evaluations = [
			{ statementId: 's1', evaluation: 1 },
			{ statementId: 's4', evaluation: -1 },
		];
		expect(deriveCivicCampPositionFromIsland(evaluations, STANCES, 's1', 's4')).toBe(
			deriveCivicCampPosition(evaluations, 's1', 's4'),
		);
		expect(deriveCivicCampPositionFromIsland(evaluations, STANCES, 's1', 's4')).toBe(0);
	});

	it('places a middle-stance supporter on that stance side of centre', () => {
		// Supporting only s2 (polarity −1/3) leans left of centre.
		const position = deriveCivicCampPositionFromIsland(
			[{ statementId: 's2', evaluation: 1 }],
			STANCES,
			's1',
			's4',
		);
		expect(position).toBe(33);
	});

	it('reads opposing a pole-adjacent stance as leaning the other way', () => {
		// Opposing s2 pushes away from the left side.
		const position = deriveCivicCampPositionFromIsland(
			[{ statementId: 's2', evaluation: -1 }],
			STANCES,
			's1',
			's4',
		);
		expect(position).toBe(67);
	});

	it('balances symmetric middle support to the centre', () => {
		const position = deriveCivicCampPositionFromIsland(
			[
				{ statementId: 's2', evaluation: 1 },
				{ statementId: 's3', evaluation: 1 },
			],
			STANCES,
			's1',
			's4',
		);
		expect(position).toBe(AGORA_CIVIC_CENTER_POSITION);
	});

	it('weights a live-with lighter than a full support', () => {
		// Strong support for s3 (+1/3), live-with on s2 (−1/3): net leans right.
		const position = deriveCivicCampPositionFromIsland(
			[
				{ statementId: 's3', evaluation: 1 },
				{ statementId: 's2', evaluation: 0.5 },
			],
			STANCES,
			's1',
			's4',
		);
		expect(position).toBeGreaterThan(AGORA_CIVIC_CENTER_POSITION);
	});

	it('returns null when nothing was marked', () => {
		expect(deriveCivicCampPositionFromIsland([], STANCES, 's1', 's4')).toBeNull();
	});

	it('returns null without anchors or without usable orders', () => {
		expect(
			deriveCivicCampPositionFromIsland(
				[{ statementId: 's2', evaluation: 1 }],
				STANCES,
				null,
				's4',
			),
		).toBeNull();
		expect(
			deriveCivicCampPositionFromIsland(
				[{ statementId: 's2', evaluation: 1 }],
				STANCES.map((stance) => ({ statementId: stance.statementId })),
				's1',
				's4',
			),
		).toBeNull();
	});
});
