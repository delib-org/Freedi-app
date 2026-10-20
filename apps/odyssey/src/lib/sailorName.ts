import { t } from '../i18n/i18n';

/**
 * What a fellow sailor is called in the lists other players see.
 *
 * A player is shown by first name only when they signed in with a real name.
 * Anonymous players, players with no name, legacy "מפליג/ה" ratings and
 * anything that looks like an email are all shown as a guest — one
 * gender-neutral word, in the viewer's language, for every nameless sailor.
 * Emails are never shown.
 */

/**
 * The token STORED for a nameless sailor (lib/user.ts writes it onto
 * evaluations and the users profile). Deliberately the Hebrew word and not a
 * translation: records written before the app had other languages carry
 * exactly this string, and a token that changed with the writer's language
 * would show an Arabic reader an English "Guest". Display goes through
 * `publicSailorName`, which turns every guest token into `t('sailor.guest')`.
 */
export const GUEST_NAME = 'אורח/ת';

const LEGACY_GUEST_NAMES = new Set(['מפליג/ה', 'מפליג', 'מפליגה', GUEST_NAME]);

export function publicSailorName(
	displayName: string | null | undefined,
	isAnonymous?: boolean,
): string {
	if (isAnonymous) return t('sailor.guest');
	const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
	if (!first || first.includes('@') || LEGACY_GUEST_NAMES.has(first)) return t('sailor.guest');

	return first;
}
