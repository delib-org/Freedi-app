/**
 * Tests for Valibot Helper Utilities
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { object, string, number, boolean } from 'valibot';
import {
	safeParseWithDetails,
	parseWithDetails,
	DetailedValidationError,
	isValid,
	getValidationIssues,
	formatValidationIssues,
} from '../valibotHelpers';
import * as errorHandling from '../errorHandling';

// Mock the logError function
jest.mock('../errorHandling', () => ({
	logError: jest.fn(),
}));

describe('valibotHelpers', () => {
	const TestSchema = object({
		name: string(),
		age: number(),
		active: boolean(),
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('safeParseWithDetails', () => {
		it('should return success for valid data', () => {
			const validData = {
				name: 'John',
				age: 30,
				active: true,
			};

			const result = safeParseWithDetails(TestSchema, validData);

			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data).toEqual(validData);
			}
		});

		it('should return detailed error for invalid data', () => {
			const invalidData = {
				name: 'John',
				age: 'thirty', // Should be number
				active: true,
			};

			const result = safeParseWithDetails(TestSchema, invalidData, {
				documentId: 'test-123',
				operation: 'test',
			});

			expect(result.success).toBe(false);
			if (result.success === false) {
				expect(result.error).toBeInstanceOf(DetailedValidationError);
				expect(result.error.issues.length).toBeGreaterThan(0);
				expect(result.error.issues[0].path).toBe('age');
			}
		});

		it('should log errors by default', () => {
			const invalidData = {
				name: 'John',
				age: 'thirty',
				active: true,
			};

			safeParseWithDetails(TestSchema, invalidData, {
				operation: 'test',
			});

			expect(errorHandling.logError).toHaveBeenCalled();
		});

		it('should not log errors when logErrors is false', () => {
			const invalidData = {
				name: 'John',
				age: 'thirty',
				active: true,
			};

			safeParseWithDetails(TestSchema, invalidData, {
				operation: 'test',
				logErrors: false,
			});

			expect(errorHandling.logError).not.toHaveBeenCalled();
		});

		it('should include document ID in error message', () => {
			const invalidData = {
				name: 'John',
				age: 'thirty',
				active: true,
			};

			const result = safeParseWithDetails(TestSchema, invalidData, {
				documentId: 'doc-456',
			});

			if (result.success === false) {
				expect(result.error.message).toContain('doc-456');
			}
		});
	});

	describe('parseWithDetails', () => {
		it('should return parsed data for valid input', () => {
			const validData = {
				name: 'Jane',
				age: 25,
				active: false,
			};

			const result = parseWithDetails(TestSchema, validData);

			expect(result).toEqual(validData);
		});

		it('should throw DetailedValidationError for invalid input', () => {
			const invalidData = {
				name: 'Jane',
				age: 'twenty-five',
				active: false,
			};

			expect(() => {
				parseWithDetails(TestSchema, invalidData, {
					documentId: 'test-789',
					operation: 'parseTest',
				});
			}).toThrow(DetailedValidationError);
		});

		it('should include detailed issues in thrown error', () => {
			const invalidData = {
				name: 123, // Should be string
				age: 'thirty', // Should be number
				active: 'yes', // Should be boolean
			};

			try {
				parseWithDetails(TestSchema, invalidData);
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(DetailedValidationError);
				const detailedError = error as DetailedValidationError;
				expect(detailedError.issues.length).toBe(3);
			}
		});
	});

	describe('DetailedValidationError', () => {
		it('should format message with all issues', () => {
			const issues = [
				{
					path: 'age',
					expected: 'number',
					received: 'string',
					message: 'Invalid type: Expected number but received string',
					value: 'thirty',
				},
			];

			const error = new DetailedValidationError('Validation failed', issues);
			const formatted = error.getFormattedMessage();

			expect(formatted).toContain('age');
			expect(formatted).toContain('number');
			expect(formatted).toContain('string');
			expect(formatted).toContain('thirty');
		});

		it('should provide a summary', () => {
			const issues = [
				{
					path: 'age',
					expected: 'number',
					received: 'string',
					message: 'Invalid type',
					value: 'thirty',
				},
				{
					path: 'active',
					expected: 'boolean',
					received: 'string',
					message: 'Invalid type',
					value: 'yes',
				},
			];

			const error = new DetailedValidationError('Validation failed', issues);
			const summary = error.getSummary();

			expect(summary).toContain('2 issue(s)');
			expect(summary).toContain('age');
			expect(summary).toContain('active');
		});
	});

	describe('isValid', () => {
		it('should return true for valid data', () => {
			const validData = {
				name: 'Test',
				age: 20,
				active: true,
			};

			expect(isValid(TestSchema, validData)).toBe(true);
		});

		it('should return false for invalid data', () => {
			const invalidData = {
				name: 'Test',
				age: 'twenty',
				active: true,
			};

			expect(isValid(TestSchema, invalidData)).toBe(false);
		});
	});

	describe('getValidationIssues', () => {
		it('should return empty array for valid data', () => {
			const validData = {
				name: 'Test',
				age: 20,
				active: true,
			};

			const issues = getValidationIssues(TestSchema, validData);

			expect(issues).toEqual([]);
		});

		it('should return issues for invalid data', () => {
			const invalidData = {
				name: 'Test',
				age: 'twenty',
				active: true,
			};

			const issues = getValidationIssues(TestSchema, invalidData);

			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0].path).toBe('age');
			expect(issues[0].expected).toContain('number');
		});

		it('should include actual values in issues', () => {
			const invalidData = {
				name: 'Test',
				age: 'twenty',
				active: true,
			};

			const issues = getValidationIssues(TestSchema, invalidData);

			expect(issues[0].value).toBe('twenty');
		});
	});

	describe('formatValidationIssues', () => {
		it('should format empty issues array', () => {
			const formatted = formatValidationIssues([]);

			expect(formatted).toContain('No validation issues');
		});

		it('should format single issue', () => {
			const issues = [
				{
					path: 'age',
					expected: 'number',
					received: 'string',
					message: 'Invalid type',
					value: 'thirty',
				},
			];

			const formatted = formatValidationIssues(issues);

			expect(formatted).toContain('age');
			expect(formatted).toContain('number');
			expect(formatted).toContain('string');
		});

		it('should format multiple issues', () => {
			const issues = [
				{
					path: 'age',
					expected: 'number',
					received: 'string',
					message: 'Invalid type',
					value: 'thirty',
				},
				{
					path: 'name',
					expected: 'string',
					received: 'number',
					message: 'Invalid type',
					value: 123,
				},
			];

			const formatted = formatValidationIssues(issues);

			expect(formatted).toContain('1. age');
			expect(formatted).toContain('2. name');
		});
	});

	describe('Nested object validation', () => {
		const NestedSchema = object({
			user: object({
				name: string(),
				profile: object({
					age: number(),
				}),
			}),
		});

		it('should show correct path for nested validation errors', () => {
			const invalidData = {
				user: {
					name: 'John',
					profile: {
						age: 'thirty', // Should be number
					},
				},
			};

			const result = safeParseWithDetails(NestedSchema, invalidData, {
				logErrors: false,
			});

			if (result.success === false) {
				expect(result.error.issues[0].path).toBe('user.profile.age');
			}
		});
	});
});
