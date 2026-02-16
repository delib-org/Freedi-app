import { Request } from 'firebase-functions/v1';

export interface ValidationError {
	field: string;
	message: string;
}

export class RequestValidator {
	private errors: ValidationError[] = [];

	/**
	 * Validate required string parameter
	 */
	requireString(value: unknown, fieldName: string): this {
		if (!value || typeof value !== 'string') {
			this.errors.push({
				field: fieldName,
				message: `${fieldName} is required and must be a string`,
			});
		}

		return this;
	}

	/**
	 * Validate optional number with max value
	 */
	optionalNumber(value: unknown, fieldName: string, defaultValue: number, max?: number): number {
		if (value === undefined || value === null) {
			return defaultValue;
		}

		const num = Number(value);
		if (isNaN(num)) {
			this.errors.push({
				field: fieldName,
				message: `${fieldName} must be a valid number`,
			});

			return defaultValue;
		}

		if (max !== undefined && num > max) {
			return max;
		}

		return num;
	}

	/**
	 * Check if validation passed
	 */
	isValid(): boolean {
		return this.errors.length === 0;
	}

	/**
	 * Get validation errors
	 */
	getErrors(): ValidationError[] {
		return this.errors;
	}

	/**
	 * Get error message
	 */
	getErrorMessage(): string {
		return this.errors.map((e) => e.message).join(', ');
	}
}

/**
 * Extract and validate query parameters
 */
export function extractQueryParams(req: Request): { [key: string]: unknown } {
	return req.query || {};
}
