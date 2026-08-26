import type { MapDetailLevel } from '@freedi/shared-types';
import { STORAGE_KEYS } from '@/constants/common';
import { isDetailLevel } from './detailLevel';

/**
 * The viewer's chosen detail level for one question, remembered on this device
 * only. Shared by the mind map and the cluster board so switching between them
 * keeps the depth the viewer picked.
 */
function storageKey(statementId: string, uid: string | undefined): string {
	return `${STORAGE_KEYS.MAP_DETAIL_LEVEL}:${statementId}:${uid ?? 'anon'}`;
}

export function loadLocalDetail(
	statementId: string,
	uid: string | undefined,
): MapDetailLevel | null {
	try {
		const raw = localStorage.getItem(storageKey(statementId, uid));

		return isDetailLevel(raw) ? raw : null;
	} catch {
		return null;
	}
}

export function saveLocalDetail(
	statementId: string,
	uid: string | undefined,
	level: MapDetailLevel | null,
): void {
	try {
		if (!level) {
			localStorage.removeItem(storageKey(statementId, uid));

			return;
		}
		localStorage.setItem(storageKey(statementId, uid), level);
	} catch {
		/* ignore persistence failure — the in-memory state still drives the view */
	}
}
