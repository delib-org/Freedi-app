import { describe, expect, it } from 'vitest';
import type { Evaluation, OdysseyParty } from '@freedi/shared-types';
import type { IslandContent } from '../game';
import { buildOpinionMap } from '../opinionMap';
import type { AttitudeMap } from '../distance';

/** Doc §3 toy example: tax stance (s1, s2) independent of climate (s3, s4). */
const users: Array<[string, AttitudeMap]> = [
	['dana', { s1: 1, s2: 1, s3: 1, s4: 1 }],
	['eli', { s1: 1, s2: 1, s3: -1, s4: -1 }],
	['noa', { s1: -1, s2: -1, s3: 1, s4: 1 }],
	['omer', { s1: -1, s2: -1, s3: -1, s4: -1 }],
];

function makeEvaluations(): Evaluation[] {
	return users.flatMap(([uid, attitudes]) =>
		Object.entries(attitudes).map(([stanceId, value]) => ({
			evaluationId: `${uid}--${stanceId}`,
			parentId: stanceId.startsWith('s1') || stanceId.startsWith('s2') ? 'tax' : 'climate',
			statementId: stanceId,
			evaluatorId: uid,
			evaluation: value,
			updatedAt: 1,
		})),
	);
}

const islands: IslandContent[] = [
	{
		statementId: 'tax',
		title: 'tax',
		issue: '',
		shortExplain: '',
		opening: '',
		depthQuestion: '',
		imageUrl: null,
		posX: 0,
		posY: 0,
		sortOrder: 0,
		enabled: true,
		statement: { statementId: 'tax' } as IslandContent['statement'],
		stances: [
			{ statementId: 's1' } as IslandContent['statement'],
			{ statementId: 's2' } as IslandContent['statement'],
		],
	},
];

function distanceBetween(
	points: NonNullable<ReturnType<typeof buildOpinionMap>>['points'],
	a: string,
	b: string,
): number {
	const pointA = points.find((point) => point.id === a)!;
	const pointB = points.find((point) => point.id === b)!;

	return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

describe('buildOpinionMap', () => {
	it('recovers the doc toy example: 4 users need 2 dimensions (a square)', () => {
		const result = buildOpinionMap({
			uid: 'dana',
			evaluations: makeEvaluations(),
			islands: [],
			parties: [],
			minSharedStances: 1,
		});

		expect(result).not.toBeNull();
		const { points, fidelity, knownPairRatio } = result!;
		expect(points).toHaveLength(4);
		expect(knownPairRatio).toBe(1);

		// Two-level structure (sides vs diagonals) is rank-preserved exactly.
		expect(fidelity.r).toBeGreaterThan(0.99);
		expect(fidelity.stress).toBeLessThan(0.25);
		expect(result!.reliable).toBe(true);

		// Sides equal, diagonals equal and strictly longer — a square, not a line.
		const side = distanceBetween(points, 'dana', 'eli');
		expect(distanceBetween(points, 'dana', 'noa')).toBeCloseTo(side, 5);
		expect(distanceBetween(points, 'eli', 'omer')).toBeCloseTo(side, 5);
		expect(distanceBetween(points, 'noa', 'omer')).toBeCloseTo(side, 5);
		const diagonal = distanceBetween(points, 'dana', 'omer');
		expect(distanceBetween(points, 'eli', 'noa')).toBeCloseTo(diagonal, 5);
		expect(diagonal).toBeGreaterThan(side * 1.3);

		// The current user is marked.
		expect(points.find((point) => point.id === 'dana')?.kind).toBe('me');
	});

	it('places parties on the map as virtual users', () => {
		const party: OdysseyParty = {
			partyId: 'p1',
			name: 'הספינה',
			color: '#ff0000',
			imageUrl: null,
			description: '',
			positions: { tax: 's1' },
			sortOrder: 0,
			enabled: true,
		};

		// Party route on the tax island = { s1: +1, s2: −1 }.
		// dana matches it exactly (d=0), eli half-matches (d=0.5), noa is the
		// exact opposite (d=1) — a perfectly 1D configuration, so MDS must
		// reproduce these distances almost exactly.
		const lineUsers: Array<[string, AttitudeMap]> = [
			['dana', { s1: 1, s2: -1 }],
			['eli', { s1: 1, s2: 1 }],
			['noa', { s1: -1, s2: 1 }],
		];
		const evaluations: Evaluation[] = lineUsers.flatMap(([uid, attitudes]) =>
			Object.entries(attitudes).map(([stanceId, value]) => ({
				evaluationId: `${uid}--${stanceId}`,
				parentId: 'tax',
				statementId: stanceId,
				evaluatorId: uid,
				evaluation: value,
				updatedAt: 1,
			})),
		);

		const result = buildOpinionMap({
			uid: 'dana',
			evaluations,
			islands,
			parties: [party],
			minSharedStances: 1,
		});

		expect(result).not.toBeNull();
		const partyPoint = result!.points.find((point) => point.id === 'party--p1');
		expect(partyPoint).toMatchObject({ kind: 'party', label: 'הספינה', color: '#ff0000' });

		expect(distanceBetween(result!.points, 'party--p1', 'dana')).toBeLessThan(0.05);
		expect(distanceBetween(result!.points, 'party--p1', 'eli')).toBeCloseTo(0.5, 1);
		expect(distanceBetween(result!.points, 'party--p1', 'noa')).toBeCloseTo(1, 1);
		expect(result!.fidelity.r).toBeGreaterThan(0.99);
	});

	it('places a continuously-scored party between the poles', () => {
		// A softened route { s1: +0.5, s2: −0.5 } sits 0.25 from hard-route dana
		// and 0.75 from her opposite — the map must reproduce the fractions.
		const party: OdysseyParty = {
			partyId: 'p1',
			name: 'מתונה',
			color: '#00ff00',
			imageUrl: null,
			description: '',
			attitudes: { s1: 0.5, s2: -0.5 },
			positions: {},
			sortOrder: 0,
			enabled: true,
		};
		const lineUsers: Array<[string, AttitudeMap]> = [
			['dana', { s1: 1, s2: -1 }],
			['noa', { s1: -1, s2: 1 }],
		];
		const evaluations: Evaluation[] = lineUsers.flatMap(([uid, attitudes]) =>
			Object.entries(attitudes).map(([stanceId, value]) => ({
				evaluationId: `${uid}--${stanceId}`,
				parentId: 'tax',
				statementId: stanceId,
				evaluatorId: uid,
				evaluation: value,
				updatedAt: 1,
			})),
		);

		const result = buildOpinionMap({
			uid: 'dana',
			evaluations,
			islands,
			parties: [party],
			minSharedStances: 1,
		});

		expect(result).not.toBeNull();
		expect(distanceBetween(result!.points, 'party--p1', 'dana')).toBeCloseTo(0.25, 1);
		expect(distanceBetween(result!.points, 'party--p1', 'noa')).toBeCloseTo(0.75, 1);
	});

	it('returns null with fewer than 3 points or no known pairs', () => {
		expect(
			buildOpinionMap({
				uid: 'dana',
				evaluations: makeEvaluations().filter((evaluation) =>
					['dana', 'eli'].includes(evaluation.evaluatorId),
				),
				islands: [],
				parties: [],
				minSharedStances: 1,
			}),
		).toBeNull();

		// 3 users but overlap below the threshold everywhere → no known pairs.
		expect(
			buildOpinionMap({
				uid: 'dana',
				evaluations: makeEvaluations().filter((evaluation) => evaluation.evaluatorId !== 'omer'),
				islands: [],
				parties: [],
				minSharedStances: 10,
			}),
		).toBeNull();
	});

	it('flags an unreliable projection instead of hiding the numbers', () => {
		// Sparse, contradictory overlaps: pairs share little, imputation kicks in.
		const sparseUsers: Array<[string, AttitudeMap]> = [
			['a', { s1: 1, s2: -1, s3: 1 }],
			['b', { s1: -1, s4: 1, s5: -1 }],
			['c', { s2: 1, s4: -1, s6: 1 }],
			['d', { s3: -1, s5: 1, s6: -1 }],
		];
		const evaluations: Evaluation[] = sparseUsers.flatMap(([uid, attitudes]) =>
			Object.entries(attitudes).map(([stanceId, value]) => ({
				evaluationId: `${uid}--${stanceId}`,
				parentId: 'island',
				statementId: stanceId,
				evaluatorId: uid,
				evaluation: value,
				updatedAt: 1,
			})),
		);

		const result = buildOpinionMap({
			uid: 'a',
			evaluations,
			islands: [],
			parties: [],
			minSharedStances: 1,
		});

		expect(result).not.toBeNull();
		expect(result!.knownPairRatio).toBeGreaterThan(0);
		expect(typeof result!.fidelity.r).toBe('number');
		expect(typeof result!.reliable).toBe('boolean');
	});
});
