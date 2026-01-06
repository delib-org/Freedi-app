/**
 * Tests for helpers - subscription and array utilities
 */

import { updateArray } from '../controllers/helpers';

describe('helpers', () => {
	describe('updateArray', () => {
		beforeEach(() => {
			jest.spyOn(console, 'error').mockImplementation(() => {});
		});

		afterEach(() => {
			jest.restoreAllMocks();
		});

		interface TestItem {
			id: string;
			name: string;
			value: number;
		}

		const createItem = (id: string, name: string, value: number): TestItem => ({
			id,
			name,
			value,
		});

		it('should add new item to empty array', () => {
			const currentArray: TestItem[] = [];
			const newItem = createItem('1', 'test', 10);

			const result = updateArray(currentArray, newItem, 'id');

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual(newItem);
		});

		it('should add new item to non-empty array', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const newItem = createItem('2', 'second', 20);

			const result = updateArray(currentArray, newItem, 'id');

			expect(result).toHaveLength(2);
			expect(result[1]).toEqual(newItem);
		});

		it('should update existing item when found', () => {
			const currentArray = [
				createItem('1', 'first', 10),
				createItem('2', 'second', 20),
			];
			const updatedItem = createItem('1', 'updated', 100);

			const result = updateArray(currentArray, updatedItem, 'id');

			expect(result).toHaveLength(2);
			expect(result[0].name).toBe('updated');
			expect(result[0].value).toBe(100);
		});

		it('should return same array reference when no update needed', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const sameItem = createItem('1', 'first', 10);

			const result = updateArray(currentArray, sameItem, 'id');

			// Should return the same reference when no changes
			expect(result).toBe(currentArray);
		});

		it('should return original array when property is undefined on new item', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const invalidItem = { name: 'invalid', value: 20 } as TestItem;

			const result = updateArray(currentArray, invalidItem, 'id');

			expect(result).toBe(currentArray);
			expect(console.error).toHaveBeenCalled();
		});

		it('should not mutate original array when adding', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const originalLength = currentArray.length;
			const newItem = createItem('2', 'second', 20);

			updateArray(currentArray, newItem, 'id');

			expect(currentArray).toHaveLength(originalLength);
		});

		it('should not mutate original array when updating', () => {
			const original = createItem('1', 'first', 10);
			const currentArray = [original];
			const updatedItem = createItem('1', 'updated', 100);

			updateArray(currentArray, updatedItem, 'id');

			expect(currentArray[0].name).toBe('first');
			expect(currentArray[0].value).toBe(10);
		});

		it('should handle partial updates correctly', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const partialUpdate = { id: '1', name: 'updated', value: 10 } as TestItem;

			const result = updateArray(currentArray, partialUpdate, 'id');

			expect(result[0].name).toBe('updated');
			expect(result[0].value).toBe(10);
		});

		it('should work with different property keys', () => {
			const currentArray = [createItem('1', 'first', 10)];
			const newItem = createItem('2', 'first', 20);

			// Using 'name' as the key instead of 'id'
			const result = updateArray(currentArray, newItem, 'name');

			// Should update since name 'first' already exists
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('2');
		});

		it('should handle array with many items', () => {
			const currentArray = Array.from({ length: 100 }, (_, i) =>
				createItem(`${i}`, `item-${i}`, i)
			);
			const updateItem = createItem('50', 'updated-50', 500);

			const result = updateArray(currentArray, updateItem, 'id');

			expect(result).toHaveLength(100);
			expect(result[50].name).toBe('updated-50');
			expect(result[50].value).toBe(500);
		});

		it('should preserve order when updating', () => {
			const currentArray = [
				createItem('1', 'first', 10),
				createItem('2', 'second', 20),
				createItem('3', 'third', 30),
			];
			const updateItem = createItem('2', 'updated', 200);

			const result = updateArray(currentArray, updateItem, 'id');

			expect(result[0].id).toBe('1');
			expect(result[1].id).toBe('2');
			expect(result[2].id).toBe('3');
		});
	});
});
