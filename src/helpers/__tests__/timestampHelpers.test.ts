/**
 * Comprehensive tests for timestampHelpers
 *
 * Tests: convertTimestampsToMillis, preprocessFirestoreData, normalizeStatementData
 */

import {
	convertTimestampsToMillis,
	preprocessFirestoreData,
	normalizeStatementData,
} from '../timestampHelpers';

// Helper to create a mock Firebase Timestamp object
function createMockTimestamp(millis: number) {
	return {
		toMillis: () => millis,
		seconds: Math.floor(millis / 1000),
		nanoseconds: (millis % 1000) * 1_000_000,
	};
}

// Helper to create a mock VectorValue (Firestore embedding)
function createMockVectorValue(values: number[]) {
	return {
		_values: values,
		toArray: () => values,
	};
}

describe('convertTimestampsToMillis', () => {
	// -----------------------------------------------------------------------
	// Null / Undefined / Primitives
	// -----------------------------------------------------------------------
	describe('primitives and nullish values', () => {
		it('should return null as-is', () => {
			expect(convertTimestampsToMillis(null)).toBeNull();
		});

		it('should return undefined as-is', () => {
			expect(convertTimestampsToMillis(undefined)).toBeUndefined();
		});

		it('should return string as-is', () => {
			expect(convertTimestampsToMillis('hello')).toBe('hello');
		});

		it('should return number as-is', () => {
			expect(convertTimestampsToMillis(42)).toBe(42);
		});

		it('should return boolean as-is', () => {
			expect(convertTimestampsToMillis(true)).toBe(true);
			expect(convertTimestampsToMillis(false)).toBe(false);
		});

		it('should return 0 as-is', () => {
			expect(convertTimestampsToMillis(0)).toBe(0);
		});

		it('should return empty string as-is', () => {
			expect(convertTimestampsToMillis('')).toBe('');
		});
	});

	// -----------------------------------------------------------------------
	// Timestamp objects
	// -----------------------------------------------------------------------
	describe('Firestore Timestamp objects', () => {
		it('should convert a top-level Timestamp to milliseconds', () => {
			const ts = createMockTimestamp(1704067200000);
			const result = convertTimestampsToMillis(ts);

			expect(result).toBe(1704067200000);
		});

		it('should convert nested Timestamp to milliseconds', () => {
			const obj = {
				name: 'test',
				createdAt: createMockTimestamp(1704067200000),
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;

			expect(result.createdAt).toBe(1704067200000);
			expect(result.name).toBe('test');
		});

		it('should convert multiple nested Timestamps', () => {
			const obj = {
				createdAt: createMockTimestamp(1000000),
				lastUpdate: createMockTimestamp(2000000),
				nested: {
					timestamp: createMockTimestamp(3000000),
				},
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;
			const nested = result.nested as Record<string, unknown>;

			expect(result.createdAt).toBe(1000000);
			expect(result.lastUpdate).toBe(2000000);
			expect(nested.timestamp).toBe(3000000);
		});
	});

	// -----------------------------------------------------------------------
	// Arrays
	// -----------------------------------------------------------------------
	describe('arrays', () => {
		it('should handle empty array', () => {
			expect(convertTimestampsToMillis([])).toEqual([]);
		});

		it('should convert Timestamps inside an array', () => {
			const arr = [createMockTimestamp(1000), createMockTimestamp(2000)];
			const result = convertTimestampsToMillis(arr) as number[];

			expect(result).toEqual([1000, 2000]);
		});

		it('should handle arrays of primitive values unchanged', () => {
			const arr = [1, 'hello', true, null];
			const result = convertTimestampsToMillis(arr);

			expect(result).toEqual([1, 'hello', true, null]);
		});

		it('should handle nested arrays recursively', () => {
			const arr = [[createMockTimestamp(100)], [createMockTimestamp(200)]];
			const result = convertTimestampsToMillis(arr) as number[][];

			expect(result[0][0]).toBe(100);
			expect(result[1][0]).toBe(200);
		});

		it('should handle array of objects with timestamps', () => {
			const arr = [
				{ id: 'a', ts: createMockTimestamp(1000) },
				{ id: 'b', ts: createMockTimestamp(2000) },
			];
			const result = convertTimestampsToMillis(arr) as Array<Record<string, unknown>>;

			expect(result[0].ts).toBe(1000);
			expect(result[1].ts).toBe(2000);
			expect(result[0].id).toBe('a');
		});
	});

	// -----------------------------------------------------------------------
	// VectorValue (embeddings) — should be excluded
	// -----------------------------------------------------------------------
	describe('VectorValue (Firestore embedding) exclusion', () => {
		it('should skip VectorValue fields (non-serializable)', () => {
			const obj = {
				id: 'doc-1',
				embedding: createMockVectorValue([0.1, 0.2, 0.3]),
				name: 'Test',
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;

			expect(result.id).toBe('doc-1');
			expect(result.name).toBe('Test');
			expect(result.embedding).toBeUndefined(); // VectorValue removed
		});

		it('should not remove non-VectorValue objects', () => {
			const obj = {
				metadata: { type: 'some-meta', value: 42 },
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;

			expect(result.metadata).toEqual({ type: 'some-meta', value: 42 });
		});
	});

	// -----------------------------------------------------------------------
	// Deep nesting
	// -----------------------------------------------------------------------
	describe('deep nesting', () => {
		it('should handle deeply nested objects', () => {
			const obj = {
				level1: {
					level2: {
						level3: {
							ts: createMockTimestamp(999),
						},
					},
				},
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;
			const l1 = result.level1 as Record<string, unknown>;
			const l2 = l1.level2 as Record<string, unknown>;
			const l3 = l2.level3 as Record<string, unknown>;

			expect(l3.ts).toBe(999);
		});

		it('should handle mixed primitives and timestamps at depth', () => {
			const obj = {
				text: 'hello',
				count: 5,
				ts: createMockTimestamp(1234567890),
				tags: ['a', 'b'],
			};
			const result = convertTimestampsToMillis(obj) as Record<string, unknown>;

			expect(result.text).toBe('hello');
			expect(result.count).toBe(5);
			expect(result.ts).toBe(1234567890);
			expect(result.tags).toEqual(['a', 'b']);
		});
	});

	// -----------------------------------------------------------------------
	// Edge cases with object keys
	// -----------------------------------------------------------------------
	describe('edge cases with object properties', () => {
		it('should not modify objects without toMillis', () => {
			const obj = { a: 1, b: 'hello', c: true };
			const result = convertTimestampsToMillis(obj);

			expect(result).toEqual({ a: 1, b: 'hello', c: true });
		});

		it('should handle empty object', () => {
			const result = convertTimestampsToMillis({});

			expect(result).toEqual({});
		});
	});
});

// -----------------------------------------------------------------------
// preprocessFirestoreData (alias for convertTimestampsToMillis)
// -----------------------------------------------------------------------
describe('preprocessFirestoreData', () => {
	it('should behave identically to convertTimestampsToMillis', () => {
		const ts = createMockTimestamp(12345678);
		const result = preprocessFirestoreData(ts);

		expect(result).toBe(12345678);
	});

	it('should convert nested timestamps', () => {
		const obj = { createdAt: createMockTimestamp(100) };
		const result = preprocessFirestoreData(obj) as Record<string, unknown>;

		expect(result.createdAt).toBe(100);
	});
});

// -----------------------------------------------------------------------
// normalizeStatementData
// -----------------------------------------------------------------------
describe('normalizeStatementData', () => {
	// -----------------------------------------------------------------------
	// Passthrough cases
	// -----------------------------------------------------------------------
	describe('passthrough cases', () => {
		it('should return null as-is', () => {
			expect(normalizeStatementData(null)).toBeNull();
		});

		it('should return undefined as-is', () => {
			expect(normalizeStatementData(undefined)).toBeUndefined();
		});

		it('should return primitives as-is', () => {
			expect(normalizeStatementData('string')).toBe('string');
			expect(normalizeStatementData(42)).toBe(42);
		});
	});

	// -----------------------------------------------------------------------
	// topParentId normalization
	// -----------------------------------------------------------------------
	describe('topParentId normalization', () => {
		it('should set topParentId to statementId when parentId equals statementId', () => {
			const data = {
				statementId: 'stmt-1',
				parentId: 'stmt-1', // same as statementId → top-level
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			expect(result.topParentId).toBe('stmt-1');
		});

		it('should set topParentId to statementId when parentId is "top"', () => {
			const data = {
				statementId: 'stmt-1',
				parentId: 'top',
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			expect(result.topParentId).toBe('stmt-1');
		});

		it('should set topParentId to statementId when parentId is missing', () => {
			const data = {
				statementId: 'stmt-1',
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			expect(result.topParentId).toBe('stmt-1');
		});

		it('should set topParentId to parentId for nested statements', () => {
			const data = {
				statementId: 'child-1',
				parentId: 'parent-1',
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			// Fallback: uses parentId for deeply nested (not accurate but avoids failure)
			expect(result.topParentId).toBe('parent-1');
		});

		it('should not overwrite existing topParentId', () => {
			const data = {
				statementId: 'stmt-1',
				parentId: 'parent-1',
				topParentId: 'existing-top',
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			expect(result.topParentId).toBe('existing-top');
		});
	});

	// -----------------------------------------------------------------------
	// Timestamp conversion + topParentId in one pass
	// -----------------------------------------------------------------------
	describe('combined timestamp conversion and normalization', () => {
		it('should convert timestamps AND normalize topParentId', () => {
			const data = {
				statementId: 'stmt-1',
				parentId: 'top',
				createdAt: createMockTimestamp(1000),
				lastUpdate: createMockTimestamp(2000),
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;

			expect(result.createdAt).toBe(1000);
			expect(result.lastUpdate).toBe(2000);
			expect(result.topParentId).toBe('stmt-1');
		});

		it('should handle data with no statement fields (no normalization needed)', () => {
			const data = {
				someOtherField: 'value',
				nested: { ts: createMockTimestamp(500) },
			};
			const result = normalizeStatementData(data) as Record<string, unknown>;
			const nested = result.nested as Record<string, unknown>;

			expect(nested.ts).toBe(500);
			expect(result.topParentId).toBeUndefined();
		});
	});
});
