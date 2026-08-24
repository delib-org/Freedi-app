import type { AgoraCharacter } from '@freedi/shared-types';
import { MAX_SCORE_STEP_PER_ASK, clampToStep, fixtureReview } from '../fn_agoraCharacterReview';

const elder: AgoraCharacter = {
	characterId: 'elder--bg',
	name: 'דוד בן-גוריון',
	role: 'ראש הממשלה הראשון',
	arguments: ['ממלכתיות'],
	needs: ['ממלכתיות ומוסדות חזקים'],
	values: [{ valueId: 'v1', label: 'ממלכתיות', description: 'מוסדות המדינה קודמים לכל מגזר' }],
	isElder: true,
};

describe('character review persuadability', () => {
	describe('clampToStep', () => {
		it('passes scores through with no previous verdict', () => {
			expect(clampToStep(90, null)).toBe(90);
		});

		it('caps movement in both directions', () => {
			const previous = { acceptanceScore: 50, verdictText: '' };
			expect(clampToStep(100, previous)).toBe(50 + MAX_SCORE_STEP_PER_ASK);
			expect(clampToStep(0, previous)).toBe(50 - MAX_SCORE_STEP_PER_ASK);
			expect(clampToStep(55, previous)).toBe(55);
		});

		it('stays inside 0-100 near the edges', () => {
			expect(clampToStep(100, { acceptanceScore: 95, verdictText: '' })).toBe(100);
			expect(clampToStep(0, { acceptanceScore: 5, verdictText: '' })).toBe(0);
		});
	});

	describe('fixtureReview', () => {
		it('is deterministic for the same input', () => {
			const a = fixtureReview('הצעה קצרה', elder, null);
			const b = fixtureReview('הצעה קצרה', elder, null);
			expect(a.acceptanceScore).toBe(b.acceptanceScore);
		});

		it('never scores a re-ask below the previous verdict plus the bump', () => {
			const first = fixtureReview('הצעה קצרה', elder, null);
			const second = fixtureReview('הצעה קצרה', elder, {
				acceptanceScore: first.acceptanceScore,
				verdictText: first.verdictText,
			});
			expect(second.acceptanceScore).toBeGreaterThanOrEqual(
				Math.min(100, first.acceptanceScore + 10),
			);
		});

		it('re-ask then clamp yields monotone persuasion inside the step limit', () => {
			let previous: { acceptanceScore: number; verdictText: string } | null = null;
			let last = -1;
			for (let ask = 0; ask < 3; ask++) {
				const review = fixtureReview('הצעה שמכבדת ממלכתיות ומוסדות חזקים', elder, previous);
				const clamped = clampToStep(review.acceptanceScore, previous);
				expect(clamped).toBeGreaterThanOrEqual(last);
				if (previous) {
					expect(Math.abs(clamped - previous.acceptanceScore)).toBeLessThanOrEqual(
						MAX_SCORE_STEP_PER_ASK,
					);
				}
				previous = { acceptanceScore: clamped, verdictText: review.verdictText };
				last = clamped;
			}
			expect(last).toBeGreaterThan(0);
		});
	});
});
