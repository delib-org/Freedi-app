/**
 * What a fellow sailor is called in the lists other players see.
 *
 * A player is shown by first name only when they signed in with a real name.
 * Anonymous players, players with no name, legacy "מפליג/ה" ratings and
 * anything that looks like an email are all "אורח/ת" — one gender-neutral
 * word for every nameless sailor. Emails are never shown.
 */
export const GUEST_NAME = 'אורח/ת';

const LEGACY_GUEST_NAMES = new Set(['מפליג/ה', 'מפליג', 'מפליגה']);

export function publicSailorName(
	displayName: string | null | undefined,
	isAnonymous?: boolean,
): string {
	if (isAnonymous) return GUEST_NAME;
	const first = (displayName ?? '').trim().split(/\s+/)[0] ?? '';
	if (!first || first.includes('@') || LEGACY_GUEST_NAMES.has(first)) return GUEST_NAME;

	return first;
}
