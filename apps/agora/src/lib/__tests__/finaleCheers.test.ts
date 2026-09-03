import { describe, expect, it } from 'vitest';
import { finaleCheers, type CheerablePoint } from '../finaleCheers';

function point(
	overrides: Partial<CheerablePoint> & { id: string },
): CheerablePoint & { id: string } {
	return {
		isMine: false,
		isLead: false,
		scored: false,
		rank: 9,
		consensus: {},
		...overrides,
	};
}

describe('finaleCheers', () => {
	describe('finaleCheers', () => {
		it('cheers a GOAL for the class when the winner is in the net', () => {
			const cheers = finaleCheers([
				point({ id: 'winner', isLead: true, scored: true, rank: 1 }),
				point({ id: 'mine', isMine: true, rank: 5 }),
			]);

			expect(cheers.map((cheer) => [cheer.kind, cheer.point.id])).toEqual([['goal', 'winner']]);
		});

		it('cheers the goal AND the podium when both are owed to different proposals', () => {
			const cheers = finaleCheers([
				point({ id: 'winner', isLead: true, scored: true, rank: 1 }),
				point({ id: 'mine', isMine: true, rank: 2 }),
			]);

			expect(cheers.map((cheer) => [cheer.kind, cheer.point.id])).toEqual([
				['goal', 'winner'],
				['podium', 'mine'],
			]);
		});

		it('drops the podium cheer when the goal is mine — one moment, one popup', () => {
			const cheers = finaleCheers([
				point({ id: 'mine', isMine: true, isLead: true, scored: true, rank: 1 }),
			]);

			expect(cheers.map((cheer) => cheer.kind)).toEqual(['goal']);
			expect(cheers[0].point.isMine).toBe(true);
		});

		it('keeps the podium cheer when the winner is on top but NOT in the net', () => {
			const cheers = finaleCheers([
				point({ id: 'winner', isLead: true, rank: 1 }),
				point({ id: 'mine', isMine: true, rank: 3 }),
			]);

			expect(cheers.map((cheer) => [cheer.kind, cheer.point.id])).toEqual([['podium', 'mine']]);
		});

		it('says nothing for a proposal off the podium and a winner outside the net', () => {
			expect(
				finaleCheers([
					point({ id: 'winner', isLead: true, rank: 1 }),
					point({ id: 'mine', isMine: true, rank: 4 }),
				]),
			).toEqual([]);
		});

		it('never cheers an unrated proposal, whatever its flags say', () => {
			expect(
				finaleCheers([
					point({
						id: 'ghost',
						isMine: true,
						isLead: true,
						scored: true,
						rank: 1,
						consensus: undefined,
					}),
				]),
			).toEqual([]);
		});
	});
});
