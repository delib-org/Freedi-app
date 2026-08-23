import { useCallback, useEffect, useState } from 'react';
import type { MapDetailLevel, MapSettings } from '@freedi/shared-types';
import { resolveDefaultDetail } from './detailLevel';
import { loadLocalDetail, saveLocalDetail } from './mapLocalDetail';

export interface MapDetailState {
	level: MapDetailLevel;
	setLevel: (level: MapDetailLevel) => void;
	/** Nodes the viewer opened one level past the global depth. */
	expandedIds: ReadonlySet<string>;
	toggleExpanded: (id: string, expanded?: boolean) => void;
	expandMany: (ids: Iterable<string>) => void;
	resetExpanded: () => void;
	/** Whether this viewer may open nodes past the admin's default depth. */
	allowExpand: boolean;
}

/**
 * One altitude for both maps. The level starts at the admin's default for the
 * question (or the viewer's remembered choice on this device); changing it
 * clears any hand-expanded nodes so the map reads as one consistent depth.
 */
export function useMapDetailLevel(
	statementId: string | undefined,
	mapSettings: MapSettings | undefined,
	uid: string | undefined,
	isAdmin: boolean,
): MapDetailState {
	const adminDefault = resolveDefaultDetail(mapSettings);
	const allowExpand = isAdmin || (mapSettings?.allowViewerExpand ?? true);

	const [level, setLevelState] = useState<MapDetailLevel>(adminDefault);
	const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());

	// Remembered choice wins over the admin default; a viewer who may not
	// expand is held at the admin default so the setting means something.
	useEffect(() => {
		const remembered = statementId ? loadLocalDetail(statementId, uid) : null;
		setLevelState(remembered && allowExpand ? remembered : adminDefault);
		setExpandedIds(new Set());
	}, [statementId, uid, adminDefault, allowExpand]);

	const setLevel = useCallback(
		(next: MapDetailLevel) => {
			setLevelState(next);
			setExpandedIds(new Set());
			if (statementId) saveLocalDetail(statementId, uid, next);
		},
		[statementId, uid],
	);

	const toggleExpanded = useCallback(
		(id: string, expanded?: boolean) => {
			if (!allowExpand) return;
			setExpandedIds((prev) => {
				const isOpen = prev.has(id);
				const shouldOpen = expanded ?? !isOpen;
				if (shouldOpen === isOpen) return prev;
				const next = new Set(prev);
				if (shouldOpen) next.add(id);
				else next.delete(id);

				return next;
			});
		},
		[allowExpand],
	);

	const expandMany = useCallback((ids: Iterable<string>) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			for (const id of ids) next.add(id);

			return next.size === prev.size ? prev : next;
		});
	}, []);

	const resetExpanded = useCallback(() => setExpandedIds(new Set()), []);

	return { level, setLevel, expandedIds, toggleExpanded, expandMany, resetExpanded, allowExpand };
}
