import {
	AGREE_DISAGREE_SCALE,
	REACTIONS_SCALE,
	THREE_POINT_SCALE,
	resolveEvaluationScaleKey,
	getEvaluationScale,
	getEvaluationRange,
	isValidEvaluationValue,
	getEvaluationEntry,
} from '../models/statement/evaluationScale';

describe('evaluationScale', () => {
	describe('getEvaluationScale', () => {
		it('defaults to the agree-disagree scale when mode is undefined', () => {
			expect(getEvaluationScale()).toBe(AGREE_DISAGREE_SCALE);
			expect(getEvaluationScale(undefined)).toBe(AGREE_DISAGREE_SCALE);
		});

		it('returns the agree-disagree scale explicitly', () => {
			expect(getEvaluationScale('agree-disagree')).toBe(AGREE_DISAGREE_SCALE);
		});

		it('returns the reactions scale', () => {
			expect(getEvaluationScale('reactions')).toBe(REACTIONS_SCALE);
		});

		it('returns the three-point scale', () => {
			expect(getEvaluationScale('three-point')).toBe(THREE_POINT_SCALE);
		});
	});

	describe('resolveEvaluationScaleKey', () => {
		it('defaults to agree-disagree when nothing is set', () => {
			expect(resolveEvaluationScaleKey()).toBe('agree-disagree');
			expect(resolveEvaluationScaleKey(null)).toBe('agree-disagree');
			expect(resolveEvaluationScaleKey({})).toBe('agree-disagree');
		});

		it('picks three-point when ratingSteps is 3', () => {
			expect(resolveEvaluationScaleKey({ ratingSteps: 3 })).toBe('three-point');
			expect(resolveEvaluationScaleKey({ ratingMode: 'agree-disagree', ratingSteps: 3 })).toBe(
				'three-point',
			);
		});

		it('keeps the five-step scale for 5 or an unknown step count', () => {
			expect(resolveEvaluationScaleKey({ ratingSteps: 5 })).toBe('agree-disagree');
			expect(resolveEvaluationScaleKey({ ratingSteps: 7 })).toBe('agree-disagree');
		});

		it('lets reactions win over ratingSteps', () => {
			expect(resolveEvaluationScaleKey({ ratingMode: 'reactions', ratingSteps: 3 })).toBe(
				'reactions',
			);
		});
	});

	describe('scale shapes', () => {
		it('agree-disagree covers the signed 5-point scale, ordered low→high', () => {
			expect(AGREE_DISAGREE_SCALE.map((e) => e.value)).toEqual([-1, -0.5, 0, 0.5, 1]);
			expect(AGREE_DISAGREE_SCALE.map((e) => e.zoneIndex)).toEqual([0, 1, 2, 3, 4]);
		});

		it('reactions covers the positive 0→1 scale, ordered low→high', () => {
			expect(REACTIONS_SCALE.map((e) => e.value)).toEqual([0, 0.25, 0.5, 0.75, 1]);
			expect(REACTIONS_SCALE.map((e) => e.zoneIndex)).toEqual([0, 1, 2, 3, 4]);
		});

		it('three-point covers -1 · 0 · +1, ordered low→high', () => {
			expect(THREE_POINT_SCALE.map((e) => e.value)).toEqual([-1, 0, 1]);
			expect(THREE_POINT_SCALE.map((e) => e.zoneIndex)).toEqual([0, 1, 2]);
			expect(THREE_POINT_SCALE.map((e) => e.direction)).toEqual(['left', 'up', 'right']);
		});

		it('three-point values are all valid five-step values', () => {
			for (const entry of THREE_POINT_SCALE) {
				expect(isValidEvaluationValue(entry.value, 'agree-disagree')).toBe(true);
			}
		});

		it('every entry has an emoji, labels, variant and direction', () => {
			for (const entry of [...AGREE_DISAGREE_SCALE, ...REACTIONS_SCALE, ...THREE_POINT_SCALE]) {
				expect(entry.emoji).toBeTruthy();
				expect(entry.labelKey).toBeTruthy();
				expect(entry.shortLabelKey).toBeTruthy();
				expect(entry.variant).toBeTruthy();
				expect(['left', 'up', 'right']).toContain(entry.direction);
			}
		});

		it('reactions are strictly non-negative (no disagree)', () => {
			expect(REACTIONS_SCALE.every((e) => e.value >= 0)).toBe(true);
		});
	});

	describe('getEvaluationRange', () => {
		it('agree-disagree spans -1..1', () => {
			expect(getEvaluationRange('agree-disagree')).toEqual({ min: -1, max: 1 });
			expect(getEvaluationRange()).toEqual({ min: -1, max: 1 });
		});

		it('reactions span 0..1', () => {
			expect(getEvaluationRange('reactions')).toEqual({ min: 0, max: 1 });
		});
	});

	describe('isValidEvaluationValue', () => {
		it('accepts exact steps of the active mode', () => {
			expect(isValidEvaluationValue(-0.5, 'agree-disagree')).toBe(true);
			expect(isValidEvaluationValue(0.75, 'reactions')).toBe(true);
		});

		it('rejects values from the other mode', () => {
			// 0.75 is only a reaction step, not an agree-disagree step
			expect(isValidEvaluationValue(0.75, 'agree-disagree')).toBe(false);
			// -0.5 is disagree — never valid for positive-only reactions
			expect(isValidEvaluationValue(-0.5, 'reactions')).toBe(false);
		});

		it('rejects the half steps on the three-point scale', () => {
			expect(isValidEvaluationValue(1, 'three-point')).toBe(true);
			expect(isValidEvaluationValue(0.5, 'three-point')).toBe(false);
			expect(isValidEvaluationValue(-0.5, 'three-point')).toBe(false);
		});

		it('rejects off-grid values', () => {
			expect(isValidEvaluationValue(0.3, 'reactions')).toBe(false);
			expect(isValidEvaluationValue(2, 'agree-disagree')).toBe(false);
		});
	});

	describe('getEvaluationEntry', () => {
		it('looks up the entry for a stored value in the active mode', () => {
			expect(getEvaluationEntry(1, 'reactions')?.emoji).toBe('❤️');
			expect(getEvaluationEntry(-1, 'agree-disagree')?.variant).toBe('strongly-disagree');
		});

		it('labels the three-point ends without "Strongly"', () => {
			expect(getEvaluationEntry(-1, 'three-point')?.labelKey).toBe('Disagree');
			expect(getEvaluationEntry(1, 'three-point')?.labelKey).toBe('Agree');
		});

		it('returns undefined for a value outside the mode', () => {
			expect(getEvaluationEntry(-1, 'reactions')).toBeUndefined();
		});
	});
});
