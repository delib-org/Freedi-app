import { DeliberativeElement, Statement } from '@freedi/shared-types';
import {
	getRandomColor,
	getSiblingOptionsByParentId,
	getExistingOptionColors,
} from '../colorUtils';

describe('colorUtils', () => {
	describe('getRandomColor', () => {
		it('should return a CSS variable string', () => {
			const color = getRandomColor([]);
			expect(color).toMatch(/^var\(--voting-palette-pair-\d+-(?:light|dark)\)$/);
		});

		it('should return a color not in the existing list', () => {
			const existing = ['var(--voting-palette-pair-1-light)', 'var(--voting-palette-pair-1-dark)'];
			const color = getRandomColor(existing);
			expect(existing).not.toContain(color);
		});

		it('should return a valid color with empty existing list', () => {
			const color = getRandomColor([]);
			expect(color).toBeTruthy();
			expect(typeof color).toBe('string');
		});
	});

	describe('getSiblingOptionsByParentId', () => {
		const mockStatements = [
			{
				statementId: 'opt1',
				parentId: 'parent1',
				deliberativeElement: DeliberativeElement.option,
			},
			{
				statementId: 'opt2',
				parentId: 'parent1',
				deliberativeElement: DeliberativeElement.option,
			},
			{
				statementId: 'stmt1',
				parentId: 'parent1',
				deliberativeElement: DeliberativeElement.research,
			},
			{
				statementId: 'opt3',
				parentId: 'parent2',
				deliberativeElement: DeliberativeElement.option,
			},
		] as Statement[];

		it('should return only options with matching parentId', () => {
			const result = getSiblingOptionsByParentId('parent1', mockStatements);
			expect(result).toHaveLength(2);
			expect(result.map((s) => s.statementId)).toEqual(['opt1', 'opt2']);
		});

		it('should return empty array when no options match', () => {
			const result = getSiblingOptionsByParentId('nonexistent', mockStatements);
			expect(result).toHaveLength(0);
		});

		it('should not return non-option statements', () => {
			const result = getSiblingOptionsByParentId('parent1', mockStatements);
			const ids = result.map((s) => s.statementId);
			expect(ids).not.toContain('stmt1');
		});

		it('should return empty array for empty statements list', () => {
			const result = getSiblingOptionsByParentId('parent1', []);
			expect(result).toHaveLength(0);
		});
	});

	describe('getExistingOptionColors', () => {
		it('should extract colors from options', () => {
			const options = [
				{ color: 'var(--voting-palette-pair-1-light)' },
				{ color: 'var(--voting-palette-pair-2-dark)' },
			] as Statement[];

			const result = getExistingOptionColors(options);
			expect(result).toEqual([
				'var(--voting-palette-pair-1-light)',
				'var(--voting-palette-pair-2-dark)',
			]);
		});

		it('should return empty array when options have no colors', () => {
			const options = [{}, {}] as Statement[];
			const result = getExistingOptionColors(options);
			expect(result).toEqual([]);
		});

		it('should return empty array for empty options list', () => {
			const result = getExistingOptionColors([]);
			expect(result).toEqual([]);
		});

		it('should skip options without color property', () => {
			const options = [
				{ color: 'var(--voting-palette-pair-1-light)' },
				{},
				{ color: 'var(--voting-palette-pair-3-dark)' },
			] as Statement[];

			const result = getExistingOptionColors(options);
			expect(result).toEqual([
				'var(--voting-palette-pair-1-light)',
				'var(--voting-palette-pair-3-dark)',
			]);
		});
	});
});
