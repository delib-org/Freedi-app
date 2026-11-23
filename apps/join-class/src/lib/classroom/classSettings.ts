import { DEFAULT_GATE, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * One reader per lesson setting, so the console, projector, student screens and
 * the engine's callable all mean the same field:
 *   - gate          -> votingSettings.threshold (challenge question, else the main statement)
 *   - side names    -> always "Side A" / "Side B" (saved character names are ignored)
 *   - side question -> statementSettings.sideQuestion, else the i18n default
 *   - side claims   -> statementSettings.sideClaims {a, b}, empty = no claim line
 */

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

/** The two sides are only ever "Side A" and "Side B". Lessons saved with character
 *  names keep them in their data (statementSettings.sideNames) but nothing reads them. */
export function sideNamesOf(_main?: Statement | null): SideNames {
	return { a: t('console.side_a'), b: t('console.side_b') };
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
