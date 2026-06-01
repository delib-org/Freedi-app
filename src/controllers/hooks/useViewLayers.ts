import { useCallback, useEffect, useState } from 'react';
import type { ViewLayers } from '@freedi/shared-types';

const STORAGE_PREFIX = 'freedi:viewLayers:';
const ALL_ON: ViewLayers = { raw: true, synth: true, cluster: true };

function storageKey(parentId: string): string {
	return `${STORAGE_PREFIX}${parentId}`;
}

function isViewLayers(value: unknown): value is ViewLayers {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as ViewLayers).raw === 'boolean' &&
		typeof (value as ViewLayers).synth === 'boolean' &&
		typeof (value as ViewLayers).cluster === 'boolean'
	);
}

function readFromStorage(parentId: string): ViewLayers | null {
	if (typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(storageKey(parentId));
		if (!raw) return null;
		const parsed: unknown = JSON.parse(raw);

		return isViewLayers(parsed)
			? { raw: parsed.raw, synth: parsed.synth, cluster: parsed.cluster }
			: null;
	} catch {
		return null;
	}
}

function writeToStorage(parentId: string, value: ViewLayers): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(storageKey(parentId), JSON.stringify(value));
	} catch {
		// Storage unavailable (private mode, quota); the toggle still works for the
		// current session via component state.
	}
}

/** Never let all three layers be off — the list would render blank. */
function ensureNonEmpty(layers: ViewLayers): ViewLayers {
	return layers.raw || layers.synth || layers.cluster
		? layers
		: { raw: true, synth: false, cluster: false };
}

interface UseViewLayersResult {
	layers: ViewLayers;
	setLayers: (next: ViewLayers) => void;
	/** True when the value comes from a saved per-user override, not the admin default. */
	hasUserOverride: boolean;
	/** Clear the local override and fall back to the admin default. */
	resetToDefault: () => void;
}

/**
 * Per-user, per-parent state for the Solutions "View layers" toggles (Raw /
 * Synth / Cluster). Falls back to the admin-set default (passed in) when the
 * user has not chosen locally, and to all-on ("All") when neither exists.
 *
 * Persisted to localStorage so the choice survives navigation/reload without
 * syncing across devices — it's a viewing preference, not a data setting.
 */
export function useViewLayers(
	parentId: string | undefined,
	adminDefault?: ViewLayers,
): UseViewLayersResult {
	const fallback = ensureNonEmpty(adminDefault ?? ALL_ON);
	const [stored, setStored] = useState<ViewLayers | null>(() =>
		parentId ? readFromStorage(parentId) : null,
	);

	useEffect(() => {
		setStored(parentId ? readFromStorage(parentId) : null);
	}, [parentId]);

	const setLayers = useCallback(
		(next: ViewLayers) => {
			const safe = ensureNonEmpty(next);
			setStored(safe);
			if (parentId) writeToStorage(parentId, safe);
		},
		[parentId],
	);

	const resetToDefault = useCallback(() => {
		setStored(null);
		if (parentId && typeof window !== 'undefined') {
			try {
				window.localStorage.removeItem(storageKey(parentId));
			} catch {
				// ignore
			}
		}
	}, [parentId]);

	return {
		layers: ensureNonEmpty(stored ?? fallback),
		setLayers,
		hasUserOverride: stored !== null,
		resetToDefault,
	};
}
