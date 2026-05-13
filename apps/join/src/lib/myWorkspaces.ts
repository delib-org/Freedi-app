/** ID-parsing helper for the "Open question" form on the join Main page.
 *
 *  Historically this module also held the localStorage-backed "My Questions"
 *  list. That has been replaced by `joinSubscriptions.ts`, which queries
 *  Firestore for top-level statements the user has created or opened in
 *  join — see `subscribeToJoinMain`. Only the input-parsing helper survives
 *  here because the form accepts pasted URLs and bare IDs and that logic
 *  isn't tied to where the list lives.
 */

/** Extract a Firestore-style statement ID from raw user input. Accepts:
 *   - bare IDs (alphanumeric + - and _)
 *   - join-app URLs:    .../m/<id>  or  .../m/<id>/q/...
 *   - main-app URLs:    .../statement/<id>/...  (any segment after the last slash that looks like an ID)
 *   - leading/trailing whitespace and query strings
 *  Returns null if no plausible ID is found. */
export function parseWorkspaceId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Bare ID — typical Firestore IDs are 16+ chars of [A-Za-z0-9_-]; we accept
	// anything ≥ 8 to stay forgiving without matching obvious junk like words.
	const bareIdMatch = /^[A-Za-z0-9_-]{8,}$/.exec(trimmed);
	if (bareIdMatch) return trimmed;

	// URL — strip query string then take the last non-empty path segment that
	// looks ID-shaped. Falls back to the segment after `/m/` or `/statement/`
	// when the trailing segment isn't an ID (e.g. URL ends in `/q/...`).
	const noQuery = trimmed.split('?')[0].split('#')[0];
	const segments = noQuery.split('/').filter(Boolean);

	const idShape = /^[A-Za-z0-9_-]{8,}$/;

	// 1. Prefer the segment immediately following a known prefix.
	for (const prefix of ['m', 'statement', 'main']) {
		const i = segments.indexOf(prefix);
		if (i >= 0 && segments[i + 1] && idShape.test(segments[i + 1])) {
			return segments[i + 1];
		}
	}

	// 2. Otherwise pick the last ID-shaped segment.
	for (let i = segments.length - 1; i >= 0; i--) {
		if (idShape.test(segments[i])) return segments[i];
	}

	return null;
}
