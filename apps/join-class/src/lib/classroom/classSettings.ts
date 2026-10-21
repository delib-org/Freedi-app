import { DEFAULT_GATE, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * One reader per lesson setting, so the console, projector, student screens and
 * the engine's callable all mean the same field:
 *   - gate          -> votingSettings.threshold (challenge question, else the main statement)
 *   - opening video -> statementSettings.videoUrl (https only)
 *   - side names    -> statementSettings.sideNames {a, b}, else the i18n defaults
 */

export const SIDE_NAME_MAX_LENGTH = 24;

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

export function isHttpsUrl(value: string): boolean {
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

/** https link of the opening video, or null (anything else is never rendered). */
export function videoUrlOf(main: Statement | null | undefined): string | null {
	const url = main?.statementSettings?.videoUrl?.trim();

	return url && isHttpsUrl(url) ? url : null;
}

function cleanName(value: string | undefined): string | null {
	const name = value?.trim();

	return name ? name.slice(0, SIDE_NAME_MAX_LENGTH) : null;
}

/** Character names of the two sides: the lesson's own, else the translated defaults. */
export function sideNamesOf(main: Statement | null | undefined): SideNames {
	const own = main?.statementSettings?.sideNames;

	return {
		a: cleanName(own?.a) ?? t('side.name_a'),
		b: cleanName(own?.b) ?? t('side.name_b'),
	};
}
