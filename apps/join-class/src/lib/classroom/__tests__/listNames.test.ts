import { describe, expect, it } from 'vitest';
import { joinAll, joinNames } from '../listNames';

describe('joinAll (who the table waits for)', () => {
	it('names one tablemate as they are', () => {
		expect(joinAll(['Noa'], 'en')).toBe('Noa');
	});

	it('joins several with the language\'s own "and"', () => {
		expect(joinAll(['Noa', 'Avi'], 'en')).toBe('Noa and Avi');
		expect(joinAll(['Noa', 'Avi', 'Dana'], 'en')).toBe('Noa, Avi, and Dana');
		expect(joinAll(['Noa', 'Avi'], 'de')).toBe('Noa und Avi');
	});

	it('is not the "or" list of joinNames', () => {
		expect(joinNames(['Noa', 'Avi'], 'en')).toBe('Noa or Avi');
	});
});
