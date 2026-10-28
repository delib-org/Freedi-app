import { DEFAULT_GATE, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * One reader per lesson setting, so the console, projector, student screens and
 * the engine's callable all mean the same field:
 *   - gate          -> votingSettings.threshold (challenge question, else the main statement)
 *   - side names    -> statementSettings.sideNames {a, b}, else the i18n defaults
 *   - side question -> statementSettings.sideQuestion, else the i18n default
 *   - side claims   -> statementSettings.sideClaims {a, b}, empty = no claim line
 */

export const SIDE_NAME_MAX_LENGTH = 24;
export const SIDE_QUESTION_MAX_LENGTH = 140;
export const SIDE_CLAIM_MAX_LENGTH = 120;

export interface SideNames {
	a: string;
	b: string;
}

function finiteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The lesson's gate: the challenge's own threshold, else the workspace's, else DEFAULT_GATE. */
export function gateOf(challenge: Statement | null | undefined, main?: Statement | null): number {
	return (
		finiteNumber(challenge?.votingSettings?.threshold) ??
		finiteNumber(main?.votingSettings?.threshold) ??
		DEFAULT_GATE
	);
}

function cleanText(value: string | undefined, max: number): string | null {
	const text = value?.trim();

	return text ? text.slice(0, max) : null;
}

function cleanName(value: string | undefined): string | null {
	return cleanText(value, SIDE_NAME_MAX_LENGTH);
}

/** Character names of the two sides: the lesson's own, else the translated defaults. */
export function sideNamesOf(main: Statement | null | undefined): SideNames {
	const own = main?.statementSettings?.sideNames;

	return {
		a: cleanName(own?.a) ?? t('side.name_a'),
		b: cleanName(own?.b) ?? t('side.name_b'),
	};
}

/** The question on the side slider: the lesson's own, else the translated default. */
export function sideQuestionOf(main: Statement | null | undefined): string {
	return (
		cleanText(main?.statementSettings?.sideQuestion, SIDE_QUESTION_MAX_LENGTH) ?? t('side.title')
	);
}

export interface SideClaims {
	a: string | null;
	b: string | null;
}

/** What each side claims, null when the teacher left it empty. */
export function sideClaimsOf(main: Statement | null | undefined): SideClaims {
	const own = main?.statementSettings?.sideClaims;

	return {
		a: cleanText(own?.a, SIDE_CLAIM_MAX_LENGTH),
		b: cleanText(own?.b, SIDE_CLAIM_MAX_LENGTH),
	};
}
