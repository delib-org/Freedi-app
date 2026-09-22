import { describe, it, expect } from 'vitest';
import { labelKeysFor, type IndicatorScope } from '@freedi/shared-charts';
import { INDICATOR_KEYS, indicatorSentence } from '../indicatorLabels';

const SCOPES: IndicatorScope[] = ['class', 'student', 'teacher', 'school', 'system'];

describe('INDICATOR_KEYS', () => {
	it.each(SCOPES)('maps every label key the %s indicators ask for', (scope) => {
		const missing = labelKeysFor(scope).filter((key) => !(key in INDICATOR_KEYS));
		expect(missing).toEqual([]);
	});

	it('maps every indicator title', () => {
		const untitled = SCOPES.flatMap((scope) =>
			labelKeysFor(scope)
				.filter((key) => /^indicator\.(class|student|teacher|school|system)\./.test(key))
				.filter((key) => !(key in INDICATOR_KEYS)),
		);
		expect(untitled).toEqual([]);
	});

	it('falls back to the key itself when unmapped', () => {
		expect(indicatorSentence('indicator.nope')).toBe('indicator.nope');
		expect(indicatorSentence('indicator.class.lessons')).toBe('Lessons');
	});
});
