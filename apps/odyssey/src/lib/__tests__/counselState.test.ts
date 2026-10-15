import { describe, expect, it } from 'vitest';
import {
	isShoreRowOpen,
	openIslandSailor,
	openShoreSailor,
	toggleIslandSailor,
	toggleShoreRow,
	toggleShoreSailor,
	type CounselState,
} from '../counselState';

/**
 * One disclosure across the whole island panel, never two
 * (docs/design/odyssey-crew-counsel-ux.md §4).
 */
describe('counselState', () => {
	describe('toggleIslandSailor', () => {
		it('opens a sailor from nothing', () => {
			expect(toggleIslandSailor(null, 'bg')).toEqual({ scope: 'island', elderId: 'bg' });
		});

		it('closes the open sailor on a second tap', () => {
			expect(toggleIslandSailor({ scope: 'island', elderId: 'bg' }, 'bg')).toBeNull();
		});

		it('swaps to another sailor in place', () => {
			expect(toggleIslandSailor({ scope: 'island', elderId: 'bg' }, 'golda')).toEqual({
				scope: 'island',
				elderId: 'golda',
			});
		});

		it('collapses any open shore row', () => {
			const state: CounselState = { scope: 'shore', stanceId: 's2', elderId: 'golda' };
			expect(toggleIslandSailor(state, 'bg')).toEqual({ scope: 'island', elderId: 'bg' });
		});
	});

	describe('toggleShoreRow', () => {
		it('opens a shore row with no sailor yet', () => {
			expect(toggleShoreRow(null, 's1')).toEqual({ scope: 'shore', stanceId: 's1', elderId: null });
		});

		it('folds the row on a second tap, even with a sailor open in it', () => {
			expect(toggleShoreRow({ scope: 'shore', stanceId: 's1', elderId: 'bg' }, 's1')).toBeNull();
		});

		it('closes the island card and any other shore row', () => {
			expect(toggleShoreRow({ scope: 'island', elderId: 'bg' }, 's1')).toEqual({
				scope: 'shore',
				stanceId: 's1',
				elderId: null,
			});
			expect(toggleShoreRow({ scope: 'shore', stanceId: 's1', elderId: 'bg' }, 's2')).toEqual({
				scope: 'shore',
				stanceId: 's2',
				elderId: null,
			});
		});
	});

	describe('toggleShoreSailor', () => {
		it('opens a sailor in the row', () => {
			expect(
				toggleShoreSailor({ scope: 'shore', stanceId: 's1', elderId: null }, 's1', 'bg'),
			).toEqual({ scope: 'shore', stanceId: 's1', elderId: 'bg' });
		});

		it('closes the sailor but keeps the row open on a second tap', () => {
			expect(
				toggleShoreSailor({ scope: 'shore', stanceId: 's1', elderId: 'bg' }, 's1', 'bg'),
			).toEqual({ scope: 'shore', stanceId: 's1', elderId: null });
		});

		it('swaps sailors in place', () => {
			expect(
				toggleShoreSailor({ scope: 'shore', stanceId: 's1', elderId: 'bg' }, 's1', 'golda'),
			).toEqual({ scope: 'shore', stanceId: 's1', elderId: 'golda' });
		});
	});

	describe('selectors', () => {
		const islandOpen: CounselState = { scope: 'island', elderId: 'bg' };
		const shoreOpen: CounselState = { scope: 'shore', stanceId: 's2', elderId: 'golda' };
		const shoreRowOnly: CounselState = { scope: 'shore', stanceId: 's2', elderId: null };

		it('reports the island sailor only in island scope', () => {
			expect(openIslandSailor(islandOpen)).toBe('bg');
			expect(openIslandSailor(shoreOpen)).toBeNull();
			expect(openIslandSailor(null)).toBeNull();
		});

		it('reports a shore row as open only for its own shore', () => {
			expect(isShoreRowOpen(shoreOpen, 's2')).toBe(true);
			expect(isShoreRowOpen(shoreOpen, 's1')).toBe(false);
			expect(isShoreRowOpen(islandOpen, 's2')).toBe(false);
			expect(isShoreRowOpen(null, 's2')).toBe(false);
		});

		it('reports the shore sailor only for the open row', () => {
			expect(openShoreSailor(shoreOpen, 's2')).toBe('golda');
			expect(openShoreSailor(shoreOpen, 's1')).toBeNull();
			expect(openShoreSailor(shoreRowOnly, 's2')).toBeNull();
			expect(openShoreSailor(islandOpen, 's2')).toBeNull();
		});
	});
});
