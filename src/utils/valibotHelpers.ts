/**
 * Valibot Helper Utilities
 *
 * Provides better error messages and debugging tools for Valibot validation failures.
 * Use these helpers instead of raw parse() for better developer experience.
 */

import type { BaseIssue, BaseSchema, InferOutput } from 'valibot';
import { parse, safeParse } from 'valibot';
import { logError } from './errorHandling';

/**
 * Detailed information about a validation failure
 */
interface ValidationIssueDetail {
	path: string;
	expected: string;
	received: string;
	message: string;
	value?: unknown;
}

/**
 * Enhanced validation error with detailed information
 */
export class DetailedValidationError extends Error {
	constructor(
		message: string,
		public readonly issues: ValidationIssueDetail[],
		public readonly rawData?: unknown
	) {
		super(message);
		this.name = 'DetailedValidationError';
	}

	/**
	 * Get a formatted error message with all issues
	 */
	getFormattedMessage(): string {
		const issuesText = this.issues
			.map((issue, index) => {
				let msg = `\n  ${index + 1}. Path: ${issue.path || 'root'}`;
				msg += `\n     Expected: ${issue.expected}`;
				msg += `\n     Received: ${issue.received}`;
				if (issue.value !== undefined) {
					const valueStr = typeof issue.value === 'object'
						? JSON.stringify(issue.value, null, 2).split('\n').slice(0, 3).join('\n')
						: String(issue.value);
					msg += `\n     Value: ${valueStr}`;
				}
				msg += `\n     Message: ${issue.message}`;
				
return msg;
			})
			.join('\n');

		return `${this.message}${issuesText}`;
	}

	/**
	 * Get a summary for logging
	 */
	getSummary(): string {
		return `Validation failed with ${this.issues.length} issue(s): ${this.issues.map(i => i.path).join(', ')}`;
	}
}

/**
 * Parse with enhanced error messages
 *
 * @example
 * ```typescript
 * const result = safeParse(StatementSchema, data, {
 *   documentId: 'stmt-123',
 *   context: 'listenToStatements'
 * });
 * ```
 */
export function safeParseWithDetails<
	TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>
>(
	schema: TSchema,
	data: unknown,
	context?: {
		documentId?: string;
		operation?: string;
		logErrors?: boolean;
	}
): { success: true; data: InferOutput<TSchema> } | { success: false; error: DetailedValidationError } {
	const result = safeParse(schema, data);

	if (result.success) {
		return { success: true, data: result.output };
	}

	// Extract detailed issues from the result.issues array
	const issues = result.issues.map((issue: BaseIssue<unknown>) => {
		// Build path string from issue.path
		const pathParts: string[] = [];
		if (issue.path) {
			for (const pathItem of issue.path) {
				if ('key' in pathItem && pathItem.key !== undefined) {
					pathParts.push(String(pathItem.key));
				}
			}
		}
		const path = pathParts.join('.') || 'root';

		// Extract type information from issue
		const expected = ('expected' in issue && issue.expected) ? String(issue.expected) : 'unknown';
		const received = ('received' in issue && issue.received) ? String(issue.received) : String(typeof issue.input);

		return {
			path,
			expected,
			received,
			message: issue.message || 'Validation failed',
			value: issue.input,
		};
	});

	// Create detailed error
	const detailedError = new DetailedValidationError(
		`Schema validation failed${context?.documentId ? ` for document ${context.documentId}` : ''}`,
		issues,
		data
	);

	// Optionally log the error
	if (context?.logErrors !== false) {
		logError(detailedError, {
			operation: context?.operation || 'validation',
			metadata: {
				documentId: context?.documentId,
				issueCount: issues.length,
				issuePaths: issues.map(i => i.path),
			},
		});
	}

	return { success: false, error: detailedError };
}

/**
 * Parse and throw with enhanced error messages
 *
 * Use this when you want to throw on validation failure with detailed information.
 *
 * @example
 * ```typescript
 * try {
 *   const statement = parseWithDetails(StatementSchema, doc.data(), {
 *     documentId: doc.id,
 *     operation: 'listenToStatements'
 *   });
 * } catch (error) {
 *   if (error instanceof DetailedValidationError) {
 *     console.error(error.getFormattedMessage());
 *   }
 * }
 * ```
 */
export function parseWithDetails<
	TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>
>(
	schema: TSchema,
	data: unknown,
	context?: {
		documentId?: string;
		operation?: string;
	}
): InferOutput<TSchema> {
	try {
		return parse(schema, data);
	} catch (error) {
		if (error && typeof error === 'object' && 'issues' in error) {
			const valibotError = error as { issues: BaseIssue<unknown>[] };

			// Extract issues from the error.issues array
			const issues = valibotError.issues.map((issue: BaseIssue<unknown>) => {
				// Build path string from issue.path
				const pathParts: string[] = [];
				if (issue.path) {
					for (const pathItem of issue.path) {
						if ('key' in pathItem && pathItem.key !== undefined) {
							pathParts.push(String(pathItem.key));
						}
					}
				}
				const path = pathParts.join('.') || 'root';

				// Extract type information from issue
				const expected = ('expected' in issue && issue.expected) ? String(issue.expected) : 'unknown';
				const received = ('received' in issue && issue.received) ? String(issue.received) : String(typeof issue.input);

				return {
					path,
					expected,
					received,
					message: issue.message || 'Validation failed',
					value: issue.input,
				};
			});

			const detailedError = new DetailedValidationError(
				`Schema validation failed${context?.documentId ? ` for document ${context.documentId}` : ''}`,
				issues,
				data
			);

			// Log with full formatted message in development
			if (process.env.NODE_ENV !== 'production') {
				console.error('\n' + detailedError.getFormattedMessage());
			}

			// Log to error handling system
			logError(detailedError, {
				operation: context?.operation || 'validation',
				metadata: {
					documentId: context?.documentId,
					issueCount: issues.length,
					issuePaths: issues.map(i => i.path),
				},
			});

			throw detailedError;
		}

		throw error;
	}
}

/**
 * Format validation issues for console output
 *
 * Useful for debugging validation issues
 */
export function formatValidationIssues(issues: ValidationIssueDetail[]): string {
	if (issues.length === 0) {
		return 'No validation issues';
	}

	const lines = ['Validation Issues:'];

	issues.forEach((issue, index) => {
		lines.push(`\n${index + 1}. ${issue.path}`);
		lines.push(`   Expected: ${issue.expected}`);
		lines.push(`   Received: ${issue.received}`);
		if (issue.value !== undefined) {
			const valueStr = typeof issue.value === 'object'
				? JSON.stringify(issue.value, null, 2)
				: String(issue.value);
			lines.push(`   Value: ${valueStr}`);
		}
	});

	return lines.join('\n');
}

/**
 * Quick validation check without throwing
 *
 * Returns boolean for simple validation checks
 */
export function isValid<
	TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>
>(
	schema: TSchema,
	data: unknown
): boolean {
	const result = safeParse(schema, data);
	
return result.success;
}

/**
 * Get validation issues without throwing
 *
 * Useful for showing validation errors in UI
 */
export function getValidationIssues<
	TSchema extends BaseSchema<unknown, unknown, BaseIssue<unknown>>
>(
	schema: TSchema,
	data: unknown
): ValidationIssueDetail[] {
	const result = safeParse(schema, data);

	if (result.success) {
		return [];
	}

	// Extract issues from the result.issues array
	return result.issues.map((issue: BaseIssue<unknown>) => {
		// Build path string from issue.path
		const pathParts: string[] = [];
		if (issue.path) {
			for (const pathItem of issue.path) {
				if ('key' in pathItem && pathItem.key !== undefined) {
					pathParts.push(String(pathItem.key));
				}
			}
		}
		const path = pathParts.join('.') || 'root';

		// Extract type information from issue
		const expected = ('expected' in issue && issue.expected) ? String(issue.expected) : 'unknown';
		const received = ('received' in issue && issue.received) ? String(issue.received) : String(typeof issue.input);

		return {
			path,
			expected,
			received,
			message: issue.message || 'Validation failed',
			value: issue.input,
		};
	});
}
