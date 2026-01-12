/**
 * Tests for translator - core translation functions
 */

import {
	translate,
	translateWithParams,
	createTranslator,
	TranslationDictionary,
} from '../core/translator';

describe('translator', () => {
	const mockDictionary: TranslationDictionary = {
		greeting: 'Hello',
		farewell: 'Goodbye',
		welcome: 'Welcome, {{name}}!',
		count: 'You have {{count}} items',
		multiple: '{{name}} has {{count}} {{items}}',
		doubleParam: '{{name}} and {{name}} again',
	};

	describe('translate', () => {
		it('should return translated value for existing key', () => {
			expect(translate('greeting', mockDictionary)).toBe('Hello');
			expect(translate('farewell', mockDictionary)).toBe('Goodbye');
		});

		it('should return key itself when key is not found', () => {
			expect(translate('nonexistent', mockDictionary)).toBe('nonexistent');
		});

		it('should return key for empty dictionary', () => {
			expect(translate('anyKey', {})).toBe('anyKey');
		});

		it('should handle empty string key', () => {
			const dict = { '': 'empty key value' };
			expect(translate('', dict)).toBe('empty key value');
		});

		it('should handle key with special characters', () => {
			const dict = { 'key.with.dots': 'dotted value' };
			expect(translate('key.with.dots', dict)).toBe('dotted value');
		});

		it('should preserve the exact key as fallback', () => {
			expect(translate('Some Missing Key', mockDictionary)).toBe(
				'Some Missing Key'
			);
		});
	});

	describe('translateWithParams', () => {
		it('should replace single parameter', () => {
			const result = translateWithParams('welcome', mockDictionary, {
				name: 'John',
			});
			expect(result).toBe('Welcome, John!');
		});

		it('should replace multiple parameters', () => {
			const result = translateWithParams('multiple', mockDictionary, {
				name: 'Alice',
				count: 5,
				items: 'apples',
			});
			expect(result).toBe('Alice has 5 apples');
		});

		it('should replace numeric parameters', () => {
			const result = translateWithParams('count', mockDictionary, { count: 42 });
			expect(result).toBe('You have 42 items');
		});

		it('should handle zero as parameter value', () => {
			const result = translateWithParams('count', mockDictionary, { count: 0 });
			expect(result).toBe('You have 0 items');
		});

		it('should handle negative numbers as parameter value', () => {
			const result = translateWithParams('count', mockDictionary, { count: -5 });
			expect(result).toBe('You have -5 items');
		});

		it('should replace all occurrences of same parameter', () => {
			const result = translateWithParams('doubleParam', mockDictionary, {
				name: 'Bob',
			});
			expect(result).toBe('Bob and Bob again');
		});

		it('should leave unreplaced params as-is when not provided', () => {
			const result = translateWithParams('welcome', mockDictionary, {});
			expect(result).toBe('Welcome, {{name}}!');
		});

		it('should handle missing key by returning key with replaced params', () => {
			const result = translateWithParams(
				'Hello {{name}}',
				{},
				{ name: 'World' }
			);
			expect(result).toBe('Hello World');
		});

		it('should handle empty params object', () => {
			const result = translateWithParams('greeting', mockDictionary, {});
			expect(result).toBe('Hello');
		});

		it('should handle special characters in param values', () => {
			const result = translateWithParams('welcome', mockDictionary, {
				name: '<script>alert("xss")</script>',
			});
			expect(result).toBe('Welcome, <script>alert("xss")</script>!');
		});

		it('should handle param value with curly braces', () => {
			const result = translateWithParams('welcome', mockDictionary, {
				name: '{{nested}}',
			});
			expect(result).toBe('Welcome, {{nested}}!');
		});
	});

	describe('createTranslator', () => {
		it('should return an object with t and tWithParams methods', () => {
			const translator = createTranslator(mockDictionary);

			expect(translator).toHaveProperty('t');
			expect(translator).toHaveProperty('tWithParams');
			expect(typeof translator.t).toBe('function');
			expect(typeof translator.tWithParams).toBe('function');
		});

		it('should translate using t method', () => {
			const translator = createTranslator(mockDictionary);

			expect(translator.t('greeting')).toBe('Hello');
			expect(translator.t('farewell')).toBe('Goodbye');
		});

		it('should return key for missing translations using t method', () => {
			const translator = createTranslator(mockDictionary);

			expect(translator.t('missing')).toBe('missing');
		});

		it('should translate with params using tWithParams method', () => {
			const translator = createTranslator(mockDictionary);

			expect(translator.tWithParams('welcome', { name: 'Alice' })).toBe(
				'Welcome, Alice!'
			);
		});

		it('should handle multiple params using tWithParams method', () => {
			const translator = createTranslator(mockDictionary);

			expect(
				translator.tWithParams('multiple', {
					name: 'Bob',
					count: 3,
					items: 'cats',
				})
			).toBe('Bob has 3 cats');
		});

		it('should create independent translators for different dictionaries', () => {
			const dict1 = { key: 'value1' };
			const dict2 = { key: 'value2' };

			const translator1 = createTranslator(dict1);
			const translator2 = createTranslator(dict2);

			expect(translator1.t('key')).toBe('value1');
			expect(translator2.t('key')).toBe('value2');
		});
	});
});
