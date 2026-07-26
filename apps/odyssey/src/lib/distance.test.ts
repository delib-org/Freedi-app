import { describe, expect, it } from 'vitest';
import type { Evaluation, OdysseyParty } from '@freedi/shared-types';
import { ODYSSEY_ATTITUDES } from '@freedi/shared-types';
import {
	MIN_SHARED_STANCES,
	opinionDistance,
	opinionDistanceEngine,
	partyAttitudes,
} from './distance';
import { attitudeValue } from './evaluations';
import type { IslandContent } from './game';

/** Minimal island fixture — the engine only reads statementId + stance ids. */
function island(statementId: string, stanceIds: string[]): IslandContent {
	return {
		statementId,
		stances: stanceIds.map((id) => ({ statementId: id })),
	} as unknown as IslandContent;
}

function party(partyId: string, positions: Record<string, string>): OdysseyParty {
	return {
		partyId,
		name: partyId,
		color: '#000000',
		imageUrl: null,
		description: '',
		positions,
		sortOrder: 1,
		enabled: true,
	};
}

function evaluation(
	evaluatorId: string,
	statementId: string,
	value: number,
	displayName = evaluatorId,
): Evaluation {
	return {
		evaluationId: `${evaluatorId}--${statementId}`,
		parentId: 'island-1',
		statementId,
		evaluatorId,
		evaluation: value,
		updatedAt: 0,
		evaluator: { uid: evaluatorId, displayName },
	};
}

describe('attitude → evaluation scale mapping', () => {
	it('maps the three attitudes onto the standard agree-disagree scale', () => {
		expect(attitudeValue('support')).toBe(1);
		expect(attitudeValue('livewith')).toBe(0.5);
		expect(attitudeValue('oppose')).toBe(-1);
	});

	it('covers every declared attitude', () => {
		for (const attitude of ODYSSEY_ATTITUDES) {
			expect(() => attitudeValue(attitude.key)).not.toThrow();
		}
	});
});

describe('opinionDistance (doc §1 metric)', () => {
	const stanceIds = ['s1', 's2', 's3', 's4', 's5'];
	const identical = Object.fromEntries(stanceIds.map((id) => [id, 1]));
	const opposite = Object.fromEntries(stanceIds.map((id) => [id, -1]));

	it('is 0 for identical maps and 1 for fully opposed maps', () => {
		expect(opinionDistance(identical, identical).distance).toBe(0);
		expect(opinionDistance(identical, opposite).distance).toBe(1);
	});

	it('averages only over shared stances', () => {
		const a = { s1: 1, s2: 1, s3: 1, s4: 1, s5: 1, extra: -1 };
		const b = { ...identical, other: -1 };
		const result = opinionDistance(a, b);
		expect(result.sharedStances).toBe(5);
		expect(result.distance).toBe(0);
	});

	it('returns null under the minimum-overlap rule', () => {
		const few = { s1: 1, s2: -1 };
		const result = opinionDistance(few, identical);
		expect(few && Object.keys(few).length).toBeLessThan(MIN_SHARED_STANCES);
		expect(result.distance).toBeNull();
		expect(result.sharedStances).toBe(2);
	});
});

describe('parties as virtual users', () => {
	const islands = [island('island-1', ['s1', 's2', 's3', 's4'])];

	it('builds the virtual route: +1 on the declared stance, -1 on the rest', () => {
		const virtual = partyAttitudes(party('p', { 'island-1': 's2' }), islands);
		expect(virtual).toEqual({ s1: -1, s2: 1, s3: -1, s4: -1 });
	});

	it('distance 0 when the player mirrors the party route, 1 when opposed', () => {
		const mirror = { s1: -1, s2: 1, s3: -1, s4: -1 };
		const opposed = { s1: 1, s2: -1, s3: 1, s4: 1 };
		const result = opinionDistanceEngine.partyDistances({
			attitudes: mirror,
			islands,
			parties: [party('close', { 'island-1': 's2' })],
		});
		expect(result[0].distance).toBe(0);
		expect(result[0].sharedIslands).toBe(1);

		const far = opinionDistanceEngine.partyDistances({
			attitudes: opposed,
			islands,
			parties: [party('far', { 'island-1': 's2' })],
		});
		expect(far[0].distance).toBe(1);
	});

	it('returns null distance for a party without declared positions', () => {
		const result = opinionDistanceEngine.partyDistances({
			attitudes: { s1: 1 },
			islands,
			parties: [party('unknown', {})],
		});
		expect(result[0].distance).toBeNull();
		expect(result[0].sharedIslands).toBe(0);
	});
});

describe('participant distances', () => {
	const stanceIds = ['s1', 's2', 's3', 's4', 's5'];

	function evaluationsFor(uid: string, value: number, displayName?: string): Evaluation[] {
		return stanceIds.map((id) => evaluation(uid, id, value, displayName ?? uid));
	}

	it('is 0 for identical answers and 1 for opposite answers (≥ min overlap)', () => {
		const result = opinionDistanceEngine.participantDistances({
			uid: 'me',
			evaluations: [
				...evaluationsFor('me', 1),
				...evaluationsFor('twin', 1),
				...evaluationsFor('rival', -1),
			],
		});

		expect(result.find((entry) => entry.userId === 'twin')?.distance).toBe(0);
		expect(result.find((entry) => entry.userId === 'rival')?.distance).toBe(1);
	});

	it('returns null below the minimum shared stances, and never includes me', () => {
		const result = opinionDistanceEngine.participantDistances({
			uid: 'me',
			evaluations: [evaluation('me', 's1', 1), evaluation('other', 's1', 1)],
		});

		expect(result).toHaveLength(1);
		expect(result[0].userId).toBe('other');
		expect(result[0].sharedStances).toBe(1);
		expect(result[0].distance).toBeNull();
	});

	it('uses the evaluator first name for display', () => {
		const result = opinionDistanceEngine.participantDistances({
			uid: 'me',
			evaluations: [...evaluationsFor('me', 1), ...evaluationsFor('u2', 0.5, 'דנה כהן')],
		});

		expect(result[0].displayName).toBe('דנה');
	});
});
