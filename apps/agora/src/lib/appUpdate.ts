/**
 * Ask the service worker to look for a newer deploy. `registerSW` in
 * `index.ts` reloads the page the moment a new worker takes control, so this
 * is all a stale tab needs to become a current one — called on entry, when
 * the tab comes back to the front, and when the session holds a stage this
 * bundle does not know (`lib/session.ts`).
 */
export function checkForAppUpdate(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	navigator.serviceWorker
		.getRegistration()
		.then((registration) => registration?.update())
		.catch((error: unknown) => console.info('[Agora] Update check failed', error));
}
