/**
 * Where "back" goes on the teacher screens that can be reached from several
 * places. The editor is opened from the home, from my scenarios, from a
 * library copy and from a link; its arrow used to be wired to one of them. It
 * now returns to the teacher screen they came from, and falls back to the
 * screen the editor belongs to when they arrived by a bookmark.
 *
 * Mithril keeps no history of its own, so the trail is two paths: the one on
 * screen and the one before it.
 */

let current = '';
let previous = '';

/** "#!/teach/scenarios?x=1" → "/teach/scenarios?x=1" */
export function routeFromHash(hash: string): string {
	return hash.replace(/^#!?/, '') || '/';
}

/** Start following the address bar. Called once, before the router starts. */
export function trackRoutes(): void {
	current = routeFromHash(window.location.hash);
	window.addEventListener('hashchange', () => {
		const next = routeFromHash(window.location.hash);
		if (next === current) return;
		previous = current;
		current = next;
	});
}

/**
 * The screen to return to: where the teacher just was, when that was another
 * teacher screen — otherwise `fallback`. Screens that make no sense to return
 * to (the form that created what is on screen) are named in `skip`.
 */
export function backTarget(
	fallback: string,
	skip: readonly string[] = [],
	from: string = previous,
	here: string = current,
): string {
	const path = from.split('?')[0];
	const herePath = here.split('?')[0];
	if (
		from === '' ||
		!path.startsWith('/teach') ||
		path === herePath ||
		skip.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
	) {
		return fallback;
	}

	return from;
}
