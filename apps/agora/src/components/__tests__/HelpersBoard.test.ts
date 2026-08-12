import { describe, expect, it } from 'vitest';
import type { AgoraParticipant } from '@freedi/shared-types';
import { buildRows, hueOf, initialsOf } from '../HelpersBoard';

function participant(
	userId: string,
	helping: number,
	joinedAt: number,
	anonName = userId,
): AgoraParticipant {
	return {
		participantId: `s--${userId}`,
		sessionId: 's',
		userId,
		anonName,
		points: { valueAccuracy: 0, proposals: 0, helping, total: helping },
		joinedAt,
		lastActive: joinedAt,
	};
}

describe('HelpersBoard', () => {
	describe('buildRows', () => {
		it('ranks by thank-yous, most first', () => {
			const rows = buildRows({
				participants: [participant('a', 1, 1), participant('b', 3, 2), participant('c', 2, 3)],
			});

			expect(rows.map((row) => row.participant.userId)).toEqual(['b', 'c', 'a']);
			expect(rows.map((row) => row.rank)).toEqual([1, 2, 3]);
		});

		it('gives tied helpers the SAME rank and skips the one below', () => {
			const rows = buildRows({
				participants: [
					participant('a', 3, 1),
					participant('b', 2, 2),
					participant('c', 2, 3),
					participant('d', 1, 4),
				],
			});

			// Standard competition ranking: two seconds, no third
			expect(rows.map((row) => row.rank)).toEqual([1, 2, 2, 4]);
		});

		it('keeps everyone, including the classmates on zero', () => {
			const rows = buildRows({
				participants: [participant('a', 0, 1), participant('b', 0, 2), participant('c', 1, 3)],
			});

			expect(rows).toHaveLength(3);
			expect(rows.map((row) => row.rank)).toEqual([1, 2, 2]);
		});

		it('breaks ties in roster order, so the list never reshuffles', () => {
			const rows = buildRows({
				participants: [participant('late', 2, 99), participant('early', 2, 1)],
			});

			expect(rows.map((row) => row.participant.userId)).toEqual(['early', 'late']);
		});

		it('marks my own row', () => {
			const rows = buildRows({
				participants: [participant('a', 1, 1), participant('me', 2, 2)],
				userId: 'me',
			});

			expect(rows[0].isMine).toBe(true);
			expect(rows[1].isMine).toBe(false);
		});
	});

	describe('hueOf', () => {
		it('stays inside the ramp', () => {
			for (const uid of ['a', 'zz', 'user-42', '', 'משתמש']) {
				expect(hueOf(uid)).toBeGreaterThanOrEqual(1);
				expect(hueOf(uid)).toBeLessThanOrEqual(8);
			}
		});

		it('is the same hue every time — identity, not decoration', () => {
			expect(hueOf('abc123')).toBe(hueOf('abc123'));
		});
	});

	describe('initialsOf', () => {
		it('takes both words, because either one can be the varying one', () => {
			// Hebrew names are <noun> <adjective>, and the adjective varies first
			expect(initialsOf('פנס אמיץ')).toBe('פא');
			expect(initialsOf('פנס חכם')).toBe('פח');
			// English names are <adjective> <noun>
			expect(initialsOf('Brave Lantern')).toBe('BL');
			expect(initialsOf('Wise Lantern')).toBe('WL');
		});

		it('handles one word, extra words and stray spacing', () => {
			expect(initialsOf('Lantern')).toBe('L');
			expect(initialsOf('  Deep   Bridge  2 ')).toBe('DB');
		});

		it('never returns an empty circle', () => {
			expect(initialsOf('')).toBe('?');
			expect(initialsOf('   ')).toBe('?');
		});
	});
});
