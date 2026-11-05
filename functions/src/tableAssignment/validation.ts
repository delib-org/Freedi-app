import { safeParse } from 'valibot';
import {
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
	TableAssignmentSettingsSchema,
} from '@freedi/shared-types';
import type { TableAssignmentSettings } from '@freedi/shared-types';
import { POSITION_MAX, POSITION_MIN } from './constants';
import { TablesError } from './tablesErrors';

/** Input checks shared by the callables. All throw TablesError('invalid-argument'). */

export function requireText(value: unknown, name: string, min: number, max: number): string {
	if (typeof value !== 'string') {
		throw new TablesError('invalid-argument', `${name} is required`);
	}
	const text = value.trim();
	if (text.length < min || text.length > max) {
		throw new TablesError('invalid-argument', `${name} must be ${min} to ${max} characters`);
	}

	return text;
}

export function requireTitle(value: unknown, name: string): string {
	return requireText(value, name, 1, TABLE_ASSIGNMENT_TITLE_MAX_LENGTH);
}

/** A 0..100 position, or undefined when the participant gave none ("not specified"). */
export function parsePosition(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (
		typeof value !== 'number' ||
		!Number.isFinite(value) ||
		value < POSITION_MIN ||
		value > POSITION_MAX
	) {
		throw new TablesError(
			'invalid-argument',
			`position must be a number from ${POSITION_MIN} to ${POSITION_MAX}`,
		);
	}

	return value;
}

/** Validate settings with the shared schema; missing fields get the contract defaults. */
export function parseSettings(raw: unknown): TableAssignmentSettings {
	const result = safeParse(TableAssignmentSettingsSchema, raw ?? {});
	if (!result.success) {
		const first = result.issues[0];
		const path = first.path?.map((p) => String(p.key)).join('.') ?? 'settings';
		throw new TablesError('invalid-argument', `Invalid settings: ${path}`);
	}
	if (!Number.isFinite(result.output.balanceTolerance)) {
		throw new TablesError('invalid-argument', 'Invalid settings: balanceTolerance');
	}

	return result.output;
}

/** Firestore rejects `undefined` values; drop them from a plain object. */
export function withoutUndefined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
