/**
 * Hosts that Firebase Hosting serves Odyssey from (site `wizcol-od`).
 *
 * Firebase Hosting answers `/__/auth/handler` on every site of the project, so
 * on these hosts the sign-in popup can stay on Odyssey's own site. With the
 * project's default authDomain (wizcol-app.firebaseapp.com) the handler is a
 * different site, and iOS Safari loses the popup's sessionStorage: the player
 * lands on "missing initial state" and is never signed in.
 *
 * Each host here must also be an authorized redirect URI on the Google OAuth
 * web client (https://<host>/__/auth/handler) and an authorized domain in
 * Firebase Auth.
 */
export const ODYSSEY_HOSTS: readonly string[] = [
	'wizcol-od.web.app',
	'wizcol-od.firebaseapp.com',
	'odyssey.democracynowanew.com',
];

/**
 * authDomain for this page: its own host when that is a known Odyssey host,
 * otherwise the configured one (localhost/emulator, test project, previews).
 */
export function resolveAuthDomain(
	hostname: string,
	fallback: string | undefined,
): string | undefined {
	const host = hostname.toLowerCase();

	return ODYSSEY_HOSTS.includes(host) ? host : fallback;
}
