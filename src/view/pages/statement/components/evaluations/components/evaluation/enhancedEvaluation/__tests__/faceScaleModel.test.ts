import { buildFaceScale, getFaceTone, getSelectedThumbId, orderLowToHigh } from '../faceScaleModel';
import { enhancedEvaluationsThumbs, reactionEvaluationsThumbs } from '../EnhancedEvaluationModel';

describe('faceScaleModel', () => {
	describe('orderLowToHigh', () => {
		it('puts strong dislike first regardless of the source array order', () => {
			const ordered = orderLowToHigh(enhancedEvaluationsThumbs);

			expect(ordered.map((t) => t.evaluation)).toEqual([-1, -0.5, 0, 0.5, 1]);
			expect(ordered.map((t) => t.face)).toEqual([
				'strong-dislike',
				'dislike',
				'neutral',
				'like',
				'strong-like',
			]);
		});

		it('does not mutate the shared thumbs array', () => {
			const before = enhancedEvaluationsThumbs.map((t) => t.id);
			orderLowToHigh(enhancedEvaluationsThumbs);

			expect(enhancedEvaluationsThumbs.map((t) => t.id)).toEqual(before);
		});

		it('orders reaction mode low to high as well', () => {
			expect(orderLowToHigh(reactionEvaluationsThumbs).map((t) => t.evaluation)).toEqual([
				0, 0.25, 0.5, 0.75, 1,
			]);
		});
	});

	describe('labels', () => {
		it('carries the short visible label for every face, low to high', () => {
			expect(buildFaceScale(enhancedEvaluationsThumbs, undefined).map((o) => o.labelKey)).toEqual([
				'Strongly dislike',
				'Dislike',
				'Not sure',
				'Like',
				'Strongly like',
			]);
		});

		it('falls back to alt when a thumb has no label (reaction mode)', () => {
			expect(buildFaceScale(reactionEvaluationsThumbs, undefined)[0].labelKey).toBe('Not for me');
		});
	});

	describe('getSelectedThumbId', () => {
		it('returns undefined when the user has not rated', () => {
			expect(getSelectedThumbId(undefined, enhancedEvaluationsThumbs)).toBeUndefined();
		});

		it('matches exact values, including 0 (a real rating, not "unrated")', () => {
			expect(getSelectedThumbId(0, enhancedEvaluationsThumbs)).toBe('c');
			expect(getSelectedThumbId(-1, enhancedEvaluationsThumbs)).toBe('e');
			expect(getSelectedThumbId(1, enhancedEvaluationsThumbs)).toBe('a');
		});

		it('snaps an in-between score to the nearest face', () => {
			expect(getSelectedThumbId(0.7, enhancedEvaluationsThumbs)).toBe('b');
		});

		it('returns undefined for an empty scale', () => {
			expect(getSelectedThumbId(1, [])).toBeUndefined();
		});
	});

	describe('tones', () => {
		it('paints every face in its own colour before rating', () => {
			const scale = buildFaceScale(enhancedEvaluationsThumbs, undefined);

			expect(scale.every((o) => o.tone === 'own' && !o.isSelected)).toBe(true);
		});

		it('fills the rated face and greys out the others', () => {
			const scale = buildFaceScale(enhancedEvaluationsThumbs, 0.5);

			expect(scale.filter((o) => o.isSelected).map((o) => o.thumb.face)).toEqual(['like']);
			expect(scale.map((o) => o.tone)).toEqual(['idle', 'idle', 'idle', 'selected', 'idle']);
		});

		it('getFaceTone covers each state', () => {
			expect(getFaceTone(true, true)).toBe('selected');
			expect(getFaceTone(false, true)).toBe('idle');
			expect(getFaceTone(false, false)).toBe('own');
		});
	});
});
