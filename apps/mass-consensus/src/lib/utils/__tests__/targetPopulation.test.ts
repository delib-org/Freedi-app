import { parseTargetPopulation, toWireTargetPopulation, CLEAR_TARGET_POPULATION } from '../targetPopulation';
import { normalizeTargetPopulation } from '@/lib/firebase/surveys/normalizeTargetPopulation';
import { DEFAULT_SURVEY_SETTINGS } from '@/types/survey';

describe('parseTargetPopulation', () => {
	it('accepts positive whole numbers, typed or as strings', () => {
		expect(parseTargetPopulation('300')).toBe(300);
		expect(parseTargetPopulation(12)).toBe(12);
		expect(parseTargetPopulation('7.9')).toBe(7);
	});

	it('treats empty, 0, negative and junk as unknown', () => {
		for (const raw of ['', '0', 0, '-4', -4, 'abc', NaN, null, undefined, Infinity]) {
			expect(parseTargetPopulation(raw)).toBeUndefined();
		}
	});
});

describe('clear signal', () => {
	it('is 0 on the wire when no number is set', () => {
		expect(toWireTargetPopulation(undefined)).toBe(CLEAR_TARGET_POPULATION);
		expect(CLEAR_TARGET_POPULATION).toBe(0);
		expect(toWireTargetPopulation(250)).toBe(250);
	});

	it('the server drops the key for 0, null and negatives and keeps a number', () => {
		const withValue = (v: unknown) =>
			normalizeTargetPopulation({ ...DEFAULT_SURVEY_SETTINGS, targetPopulation: v as number });

		expect('targetPopulation' in withValue(0)).toBe(false);
		expect('targetPopulation' in withValue(null)).toBe(false);
		expect('targetPopulation' in withValue(-3)).toBe(false);
		expect(withValue(250).targetPopulation).toBe(250);
		expect('targetPopulation' in normalizeTargetPopulation(DEFAULT_SURVEY_SETTINGS)).toBe(false);
	});
});
