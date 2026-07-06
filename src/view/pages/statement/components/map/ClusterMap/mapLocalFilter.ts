import type { MapFilterMetric } from '@freedi/shared-types';

/**
 * A per-viewer, per-question filter override for the cluster map.
 *
 * The map's shared filter lives on `statementSettings.map` and changes what
 * EVERYONE sees. This local override lets a viewer (and an admin who chooses
 * "only me") filter their OWN view without touching the shared setting. It is
 * persisted to localStorage, keyed by (statementId, uid), so it survives a
 * reload but never leaves the device.
 *
 * A present override always supplies all three fields (so it fully replaces the
 * shared filter, including a deliberate `filterMetric: 'none'` = "show all to
 * me even though the admin set a filter"). `null` means "no override — inherit
 * the shared filter".
 */
export interface LocalMapFilter {
	filterMetric: MapFilterMetric;
	minConsensus: number;
	minAverageEvaluation: number;
}

const KEY_PREFIX = 'freedi_map_local_filter';

function storageKey(statementId: string, uid: string | undefined): string {
	return `${KEY_PREFIX}:${statementId}:${uid ?? 'anon'}`;
}

export function loadLocalFilter(
	statementId: string,
	uid: string | undefined,
): LocalMapFilter | null {
	try {
		const raw = localStorage.getItem(storageKey(statementId, uid));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<LocalMapFilter>;
		const metric = parsed.filterMetric;
		if (metric !== 'none' && metric !== 'consensus' && metric !== 'average') return null;

		return {
			filterMetric: metric,
			minConsensus: typeof parsed.minConsensus === 'number' ? parsed.minConsensus : -1,
			minAverageEvaluation:
				typeof parsed.minAverageEvaluation === 'number' ? parsed.minAverageEvaluation : -1,
		};
	} catch {
		return null;
	}
}

export function saveLocalFilter(
	statementId: string,
	uid: string | undefined,
	filter: LocalMapFilter | null,
): void {
	try {
		if (!filter) {
			localStorage.removeItem(storageKey(statementId, uid));

			return;
		}
		localStorage.setItem(storageKey(statementId, uid), JSON.stringify(filter));
	} catch {
		/* ignore persistence failure — the in-memory state still drives the view */
	}
}
