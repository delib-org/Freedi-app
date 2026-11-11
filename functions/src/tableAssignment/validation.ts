import { safeParse } from 'valibot';
import {
	TABLE_ASSIGNMENT_POSITION_STOPS,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
	TableAssignmentSettingsSchema,
} from '@freedi/shared-types';
import type { TableAssignmentSettings } from '@freedi/shared-types';
import { TablesError } from './tablesErrors';

/** Input checks shared by the callables. All throw TablesError('invalid-argument'). */

/** Line breaks and tabs would otherwise glue two words together when removed. */
const CONTROL_WHITESPACE = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
/**
 * Control characters, bidi overrides and marks, and invisible characters. They
 * can reorder how a name displays or make two different names look identical.
 * ZWJ and ZWNJ stay: some scripts spell with them.
 */
const INVISIBLE_CHARACTERS =
	/[\p{Cc}\u00AD\u061C\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu;

/** The text with what must never reach another person's screen taken out. */
export function cleanText(value: string): string {
	return value.replace(CONTROL_WHITESPACE, ' ').replace(INVISIBLE_CHARACTERS, '').trim();
}

export function requireText(value: unknown, name: string, min: number, max: number): string {
	if (typeof value !== 'string') {
		throw new TablesError('invalid-argument', `${name} is required`);
	}
	const text = cleanText(value);
	if (text.length < min || text.length > max) {
		throw new TablesError('invalid-argument', `${name} must be ${min} to ${max} characters`);
	}

	return text;
}

export function requireTitle(value: unknown, name: string): string {
	return requireText(value, name, 1, TABLE_ASSIGNMENT_TITLE_MAX_LENGTH);
}

/** One of the five stops, or undefined when the participant gave none ("not specified"). */
export function parsePosition(value: unknown): number | undefined {
	if (value === undefined || value === null) return undefined;
	if (!(TABLE_ASSIGNMENT_POSITION_STOPS as readonly unknown[]).includes(value)) {
		throw new TablesError(
			'invalid-argument',
			`position must be one of ${TABLE_ASSIGNMENT_POSITION_STOPS.join(', ')}`,
		);
	}

	return value as number;
}

/** A table size a host may set now. The shared schema also accepts the smaller sizes of older sessions. */
export function assertChoosableTableSize(tableSize: number): void {
	if (tableSize < TABLE_ASSIGNMENT_TABLE_SIZE_MIN) {
		throw new TablesError(
			'invalid-argument',
			`tableSize must be at least ${TABLE_ASSIGNMENT_TABLE_SIZE_MIN}`,
		);
	}
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
