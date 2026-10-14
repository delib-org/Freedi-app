import { describe, expect, it } from 'vitest';
import { nextCardBelow, notesBelowFold } from '../boardFold';

const card = (top: number, height = 200) => ({ top, bottom: top + height });

describe('boardFold', () => {
	describe('notesBelowFold', () => {
		it('counts only the cards that have not started above the fold', () => {
			const cards = [card(100), card(320), card(540), card(760), card(980)];
			// A phone: the fold at 700 shows cards 1–3 (the third cut), hides two
			expect(notesBelowFold(cards, 700)).toBe(2);
		});

		it('is zero when the whole board fits', () => {
			expect(notesBelowFold([card(0), card(220)], 800)).toBe(0);
			expect(notesBelowFold([], 800)).toBe(0);
		});

		it('treats a card sitting exactly on the fold as hidden', () => {
			expect(notesBelowFold([card(700)], 700)).toBe(1);
			expect(notesBelowFold([card(699)], 700)).toBe(0);
		});

		it('counts every card when the board is scrolled above them all', () => {
			expect(notesBelowFold([card(900), card(1120), card(1340)], 700)).toBe(3);
		});
	});

	describe('nextCardBelow', () => {
		it('picks the first card the fold cuts', () => {
			const cards = [card(100), card(320), card(540), card(760)];
			expect(nextCardBelow(cards, 700)).toBe(2);
		});

		it('picks the first hidden card when none is cut', () => {
			expect(nextCardBelow([card(100), card(720)], 700)).toBe(1);
		});

		it('is -1 when every card is in view', () => {
			expect(nextCardBelow([card(100), card(320)], 700)).toBe(-1);
			expect(nextCardBelow([], 700)).toBe(-1);
		});
	});
});
