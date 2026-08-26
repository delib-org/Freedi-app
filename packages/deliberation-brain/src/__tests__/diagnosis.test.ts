import { describe, expect, it } from 'vitest';
import { mergeDiagnosis, missingCriticalFields, sanitizeDiagnosis } from '../diagnosis';

describe('mergeDiagnosis', () => {
	it('next overrides prev field by field, undefined leaves prev', () => {
		const merged = mergeDiagnosis(
			{ decisionType: 'allocate', whoDecides: 'council', confidence: { decisionType: 0.9, whoDecides: 0.4 } },
			{ decisionType: 'choose', audienceSize: 'public', confidence: { decisionType: 0.7 } },
		);
		expect(merged).toEqual({
			decisionType: 'choose',
			whoDecides: 'council',
			audienceSize: 'public',
			confidence: { decisionType: 0.7, whoDecides: 0.4 },
		});
	});

	it('handles undefined on either side', () => {
		expect(mergeDiagnosis(undefined, undefined)).toEqual({});
		expect(mergeDiagnosis(undefined, { polarization: 'low' })).toEqual({ polarization: 'low' });
		expect(mergeDiagnosis({ polarization: 'low' }, undefined)).toEqual({ polarization: 'low' });
	});
});

describe('sanitizeDiagnosis', () => {
	it('drops unknown fields and out-of-vocabulary values', () => {
		expect(
			sanitizeDiagnosis({
				decisionType: 'allocate',
				audienceSize: 'galaxy',
				timeHorizonDays: '10',
				hardDeadline: 'soon',
				existingOptions: ['a', 2, 'b'],
				confidence: { decisionType: 1.4, audienceSize: 'high' },
				extra: true,
			}),
		).toEqual({ decisionType: 'allocate', existingOptions: ['a', 'b'], confidence: { decisionType: 1 } });
	});

	it('returns undefined for nothing usable', () => {
		expect(sanitizeDiagnosis(null)).toBeUndefined();
		expect(sanitizeDiagnosis({ nope: 1 })).toBeUndefined();
	});
});

describe('missingCriticalFields', () => {
	it('treats hardDeadline as answering the time question', () => {
		const missing = missingCriticalFields({ hardDeadline: '2030-01-01' });
		expect(missing).not.toContain('timeHorizonDays');
		expect(missing[0]).toBe('decisionType');
	});
});
