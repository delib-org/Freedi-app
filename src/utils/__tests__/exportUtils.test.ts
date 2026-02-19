/**
 * Tests for exportUtils
 *
 * Tests JSON/CSV export formatting, object flattening, and CSV escaping.
 */

jest.mock('@freedi/shared-types', () => ({
	StatementType: {
		option: 'option',
		question: 'question',
		statement: 'statement',
	},
}));

jest.mock('@/types/export', () => ({
	extractExportableData: jest.fn((statement: Record<string, unknown>) => {
		const {
			statement: text,
			statementId,
			parentId,
			topParentId,
			createdAt,
			lastUpdate,
			consensus,
			pro,
			con,
		} = statement;

		return {
			statement: text,
			statementId,
			parentId,
			topParentId,
			createdAt,
			lastUpdate,
			consensus,
			pro,
			con,
		};
	}),
}));

jest.mock('@/utils/errorHandling', () => ({
	logError: jest.fn(),
}));

import { flattenObject, createJSONExport, createCSVExport } from '../exportUtils';

interface MockStatement {
	statement: string;
	statementId: string;
	parentId: string;
	topParentId: string;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	pro: number;
	con: number;
}

describe('exportUtils', () => {
	describe('flattenObject', () => {
		it('should flatten a simple object', () => {
			const result = flattenObject({ name: 'test', value: 42 });
			expect(result).toEqual({ name: 'test', value: 42 });
		});

		it('should flatten nested objects with dot notation', () => {
			const result = flattenObject({
				user: { name: 'Alice', age: 30 },
			});
			expect(result).toEqual({
				'user.name': 'Alice',
				'user.age': 30,
			});
		});

		it('should serialize arrays as JSON strings', () => {
			const result = flattenObject({ tags: ['a', 'b', 'c'] });
			expect(result).toEqual({ tags: '["a","b","c"]' });
		});

		it('should handle null values', () => {
			const result = flattenObject({ key: null });
			expect(result).toEqual({ key: null });
		});

		it('should handle undefined values', () => {
			const result = flattenObject({ key: undefined });
			expect(result).toEqual({ key: null });
		});

		it('should handle deeply nested objects', () => {
			const result = flattenObject({
				level1: { level2: { level3: 'deep' } },
			});
			expect(result).toEqual({ 'level1.level2.level3': 'deep' });
		});

		it('should handle boolean values', () => {
			const result = flattenObject({ active: true, deleted: false });
			expect(result).toEqual({ active: true, deleted: false });
		});

		it('should use prefix when provided', () => {
			const result = flattenObject({ name: 'test' }, 'root');
			expect(result).toEqual({ 'root.name': 'test' });
		});

		it('should handle empty object', () => {
			const result = flattenObject({});
			expect(result).toEqual({});
		});
	});

	describe('createJSONExport', () => {
		const mainStatement: MockStatement = {
			statement: 'Main question',
			statementId: 'main-1',
			parentId: 'root',
			topParentId: 'root',
			createdAt: 1700000000000,
			lastUpdate: 1700000001000,
			consensus: 0.5,
			pro: 10,
			con: 3,
		};

		const subStatements: MockStatement[] = [
			{
				statement: 'Option A',
				statementId: 'opt-a',
				parentId: 'main-1',
				topParentId: 'root',
				createdAt: 1700000002000,
				lastUpdate: 1700000003000,
				consensus: 0.8,
				pro: 8,
				con: 1,
			},
		];

		it('should return valid JSON string', () => {
			const result = createJSONExport(
				mainStatement as unknown as Parameters<typeof createJSONExport>[0],
				subStatements as unknown as Parameters<typeof createJSONExport>[1],
			);
			const parsed = JSON.parse(result);
			expect(parsed).toBeDefined();
		});

		it('should include _schema documentation', () => {
			const result = createJSONExport(
				mainStatement as unknown as Parameters<typeof createJSONExport>[0],
				subStatements as unknown as Parameters<typeof createJSONExport>[1],
			);
			const parsed = JSON.parse(result);
			expect(parsed._schema).toBeDefined();
		});

		it('should include exportMetadata with correct record count', () => {
			const result = createJSONExport(
				mainStatement as unknown as Parameters<typeof createJSONExport>[0],
				subStatements as unknown as Parameters<typeof createJSONExport>[1],
			);
			const parsed = JSON.parse(result);
			expect(parsed.exportMetadata.totalRecords).toBe(2);
			expect(parsed.exportMetadata.exportFormat).toBe('json');
		});

		it('should include mainStatement and subStatements', () => {
			const result = createJSONExport(
				mainStatement as unknown as Parameters<typeof createJSONExport>[0],
				subStatements as unknown as Parameters<typeof createJSONExport>[1],
			);
			const parsed = JSON.parse(result);
			expect(parsed.mainStatement).toBeDefined();
			expect(parsed.subStatements).toHaveLength(1);
		});
	});

	describe('createCSVExport', () => {
		const mainStatement: MockStatement = {
			statement: 'Test question',
			statementId: 'stmt-1',
			parentId: 'root',
			topParentId: 'root',
			createdAt: 1700000000000,
			lastUpdate: 1700000001000,
			consensus: 0.5,
			pro: 5,
			con: 2,
		};

		it('should include comment header starting with #', () => {
			const result = createCSVExport(
				mainStatement as unknown as Parameters<typeof createCSVExport>[0],
				[],
			);
			expect(result).toContain('# FREEDI DATA EXPORT');
		});

		it('should include CSV header row with column names', () => {
			const result = createCSVExport(
				mainStatement as unknown as Parameters<typeof createCSVExport>[0],
				[],
			);
			const lines = result.split('\n');
			// Find the first non-comment line (header row)
			const headerLine = lines.find((line) => !line.startsWith('#') && line.trim().length > 0);
			expect(headerLine).toBeDefined();
			expect(headerLine).toContain('statementId');
		});

		it('should handle statements with comma in text', () => {
			const stmtWithComma: MockStatement = {
				...mainStatement,
				statement: 'Hello, world',
			};
			const result = createCSVExport(
				stmtWithComma as unknown as Parameters<typeof createCSVExport>[0],
				[],
			);
			// Commas in values should be enclosed in quotes
			expect(result).toContain('"Hello, world"');
		});

		it('should handle statements with quotes in text', () => {
			const stmtWithQuotes: MockStatement = {
				...mainStatement,
				statement: 'He said "hello"',
			};
			const result = createCSVExport(
				stmtWithQuotes as unknown as Parameters<typeof createCSVExport>[0],
				[],
			);
			// Quotes should be escaped as double quotes
			expect(result).toContain('""hello""');
		});
	});
});
