/**
 * The pure parts of publishing: which tag counters move, and whether a cover
 * URL is one the owner could have uploaded for this scenario.
 */

export interface TagDelta {
	add: string[];
	remove: string[];
}

/**
 * Tag usage counters follow PUBLIC scenarios. Going public adds every tag;
 * staying public changes only the difference; going private removes them all.
 */
export function tagDelta(previous: readonly string[], next: readonly string[]): TagDelta {
	const before = new Set(previous);
	const after = new Set(next);

	return {
		add: [...after].filter((id) => !before.has(id)),
		remove: [...before].filter((id) => !after.has(id)),
	};
}

/**
 * Covers are uploaded by the teacher's browser into `agora/{scenarioId}/…`
 * (the same folder as the scenario's other media) and the URL handed to the
 * publish callable. It must be a Storage download URL for exactly that folder.
 */
export function isScenarioCoverUrl(url: string, scenarioId: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'https:' && !isLocalEmulator(parsed)) return false;
	const trusted =
		parsed.hostname === 'firebasestorage.googleapis.com' ||
		parsed.hostname === 'storage.googleapis.com' ||
		parsed.hostname.endsWith('.firebasestorage.app') ||
		isLocalEmulator(parsed);
	if (!trusted) return false;
	const path = decodeURIComponent(parsed.pathname);

	return path.includes(`/agora/${scenarioId}/`);
}

function isLocalEmulator(url: URL): boolean {
	return (
		process.env.FUNCTIONS_EMULATOR === 'true' &&
		(url.hostname === 'localhost' || url.hostname === '127.0.0.1')
	);
}
