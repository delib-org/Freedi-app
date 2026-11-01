import { fillPlaceholders } from '../fillPlaceholders';

describe('fillPlaceholders', () => {
	it('replaces every named placeholder', () => {
		expect(fillPlaceholders('{{shown}} of {{total}}', { shown: 10, total: 42 })).toBe('10 of 42');
	});

	it('replaces a placeholder that appears twice', () => {
		expect(fillPlaceholders('{{name}} and {{name}}', { name: 'Dana' })).toBe('Dana and Dana');
	});

	it('leaves a placeholder without a value as written', () => {
		expect(fillPlaceholders('Block {{name}}?', {})).toBe('Block {{name}}?');
	});

	it('returns a string without placeholders unchanged', () => {
		expect(fillPlaceholders('Undo', { count: 1 })).toBe('Undo');
	});
});
