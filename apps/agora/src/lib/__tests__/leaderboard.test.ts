import { describe, expect, it } from 'vitest';
import type { AgoraParticipant, AgoraPoints } from '@freedi/shared-types';
import {
	buildLeaderboard,
	classPointsTotal,
	podiumRows,
	strongestRole,
	wearsMedal,
} from '../leaderboard';

function points(partial: Partial<AgoraPoints> = {}): AgoraPoints {
	const base: AgoraPoints = { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 };
	const merged = { ...base, ...partial };
	if (partial.total === undefined) {
		merged.total =
			merged.valueAccuracy +
			merged.proposals +
			merged.helping +
			(merged.rating ?? 0) +
			(merged.revising ?? 0) +
			(merged.appreciation ?? 0);
	}

	return merged;
}

function participant(
	userId: string,
	pts: Partial<AgoraPoints>,
	joinedAt: number,
	extra: Partial<AgoraParticipant> = {},
): AgoraParticipant {
	return {
		participantId: `s--${userId}`,
		sessionId: 's',
		userId,
		anonName: userId,
		points: points(pts),
		joinedAt,
		lastActive: joinedAt,
		...extra,
	};
}

describe('leaderboard', () => {
	describe('buildLeaderboard', () => {
		it('orders by total, most first', () => {
			const rows = buildLeaderboard([
				participant('a', { helping: 1 }, 1),
				participant('b', { helping: 3 }, 2),
				participant('c', { helping: 2 }, 3),
			]);

			expect(rows.map((row) => row.participant.userId)).toEqual(['b', 'c', 'a']);
			expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
		});

		it('gives tied students the SAME rank and skips the one below', () => {
			const rows = buildLeaderboard([
				participant('a', { helping: 3 }, 1),
				participant('b', { helping: 2 }, 2),
				participant('c', { rating: 2 }, 3),
				participant('d', { helping: 1 }, 4),
			]);

			expect(rows.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
		});

		it('keeps everyone, including the classmates on zero', () => {
			const rows = buildLeaderboard([
				participant('a', {}, 1),
				participant('b', {}, 2),
				participant('c', { proposals: 3 }, 3),
			]);

			expect(rows).toHaveLength(3);
			expect(rows.map((row) => row.rank)).toEqual([1, 2, 2]);
		});

		it('breaks ties in roster order, so the list never reshuffles', () => {
			const rows = buildLeaderboard([
				participant('late', { helping: 2 }, 99),
				participant('early', { helping: 2 }, 1),
			]);

			expect(rows.map((row) => row.participant.userId)).toEqual(['early', 'late']);
		});

		it('marks my own row', () => {
			const rows = buildLeaderboard(
				[participant('a', { helping: 1 }, 1), participant('me', { helping: 2 }, 2)],
				'me',
			);

			expect(rows[0].isMine).toBe(true);
			expect(rows[1].isMine).toBe(false);
		});

		it('leaves AI raters off the board', () => {
			const rows = buildLeaderboard([
				participant('human', { helping: 1 }, 1),
				participant('bot', { helping: 9 }, 2, { isAI: true }),
			]);

			expect(rows.map((row) => row.participant.userId)).toEqual(['human']);
		});

		it('reads the server total, not a client sum — penalties already taken', () => {
			const rows = buildLeaderboard([participant('a', { helping: 5, penalties: 2, total: 3 }, 1)]);

			expect(rows[0].points).toBe(3);
		});
	});

	describe('strongestRole', () => {
		it('names the column with the most points', () => {
			expect(strongestRole(points({ rating: 4, proposals: 3 }))).toBe('rating');
		});

		it('prefers the collaborative role on a tie', () => {
			expect(strongestRole(points({ helping: 3, proposals: 3 }))).toBe('helping');
		});

		it('has no role for a student on zero', () => {
			expect(strongestRole(points())).toBeUndefined();
		});

		it('tolerates legacy docs without the optional columns', () => {
			expect(strongestRole({ valueAccuracy: 0, proposals: 2, helping: 0, total: 2 })).toBe(
				'proposals',
			);
		});
	});

	describe('classPointsTotal', () => {
		it('adds every balance up', () => {
			const rows = buildLeaderboard([
				participant('a', { helping: 1.5 }, 1),
				participant('b', { rating: 2 }, 2),
			]);

			expect(classPointsTotal(rows)).toBe(3.5);
		});
	});

	describe('medals and podium', () => {
		it('never awards a medal for zero points', () => {
			const rows = buildLeaderboard([participant('a', {}, 1), participant('b', {}, 2)]);

			expect(rows.every((row) => !wearsMedal(row))).toBe(true);
			expect(podiumRows(rows)).toEqual([]);
		});

		it('puts at most three earners on the podium, ties included', () => {
			const rows = buildLeaderboard([
				participant('a', { helping: 3 }, 1),
				participant('b', { helping: 2 }, 2),
				participant('c', { helping: 2 }, 3),
				participant('d', { helping: 1 }, 4),
			]);

			const podium = podiumRows(rows);
			expect(podium.map((row) => row.participant.userId)).toEqual(['a', 'b', 'c']);
			expect(podium.map((row) => row.rank)).toEqual([1, 2, 2]);
			expect(wearsMedal(rows[3])).toBe(false);
		});
	});
});
