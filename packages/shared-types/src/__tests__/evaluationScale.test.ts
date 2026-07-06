import {
	AGREE_DISAGREE_SCALE,
	REACTIONS_SCALE,
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

		it('every entry has an emoji, labels, variant and direction', () => {
			for (const entry of [...AGREE_DISAGREE_SCALE, ...REACTIONS_SCALE]) {
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

		it('returns undefined for a value outside the mode', () => {
			expect(getEvaluationEntry(-1, 'reactions')).toBeUndefined();
		});
	});
});
