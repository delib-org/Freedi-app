import { useCallback, useEffect, useState } from 'react';
import type { MapDetailLevel, MapSettings } from '@freedi/shared-types';
import { resolveDefaultDetail } from './detailLevel';
import { loadLocalDetail, saveLocalDetail } from './mapLocalDetail';

export interface MapDetailState {
	level: MapDetailLevel;
	setLevel: (level: MapDetailLevel) => void;
	/** Nodes the viewer opened one level past the global depth. */
	expandedIds: ReadonlySet<string>;
	/** Nodes the viewer folded although the level would open them. */
	foldedIds: ReadonlySet<string>;
	/**
	 * Open or fold a node by hand. Pass the wanted state; without it the call
	 * flips the node's own override, which is only right for a node the level
	 * folds (callers that know `collapsed` should pass `!collapsed`).
	 */
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
	const [foldedIds, setFoldedIds] = useState<ReadonlySet<string>>(() => new Set());

	// Remembered choice wins over the admin default; a viewer who may not
	// expand is held at the admin default so the setting means something.
	useEffect(() => {
		const remembered = statementId ? loadLocalDetail(statementId, uid) : null;
		setLevelState(remembered && allowExpand ? remembered : adminDefault);
		setExpandedIds(new Set());
		setFoldedIds(new Set());
	}, [statementId, uid, adminDefault, allowExpand]);

	const setLevel = useCallback(
		(next: MapDetailLevel) => {
			setLevelState(next);
			setExpandedIds(new Set());
			setFoldedIds(new Set());
			if (statementId) saveLocalDetail(statementId, uid, next);
		},
		[statementId, uid],
	);

	const toggleExpanded = useCallback(
		(id: string, expanded?: boolean) => {
			if (!allowExpand) return;
			// Opening records an expand override and clears any fold; folding does
			// the reverse. Each node carries at most one of the two.
			const shouldOpen = expanded ?? !expandedIds.has(id);
			setExpandedIds((prev) => {
				if (prev.has(id) === shouldOpen) return prev;
				const next = new Set(prev);
				if (shouldOpen) next.add(id);
				else next.delete(id);

				return next;
			});
			setFoldedIds((prev) => {
				if (prev.has(id) === !shouldOpen) return prev;
				const next = new Set(prev);
				if (shouldOpen) next.delete(id);
				else next.add(id);

				return next;
			});
		},
		[allowExpand, expandedIds],
	);

	const expandMany = useCallback((ids: Iterable<string>) => {
		const list = Array.from(ids);
		setExpandedIds((prev) => {
			const next = new Set(prev);
			for (const id of list) next.add(id);

			return next.size === prev.size ? prev : next;
		});
		setFoldedIds((prev) => {
			if (!list.some((id) => prev.has(id))) return prev;
			const next = new Set(prev);
			for (const id of list) next.delete(id);

			return next;
		});
	}, []);

	const resetExpanded = useCallback(() => {
		setExpandedIds(new Set());
		setFoldedIds(new Set());
	}, []);

	return {
		level,
		setLevel,
		expandedIds,
		foldedIds,
		toggleExpanded,
		expandMany,
		resetExpanded,
		allowExpand,
	};
}
