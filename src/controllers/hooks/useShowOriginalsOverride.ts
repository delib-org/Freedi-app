import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'freedi:showOriginalsOverride:';

function storageKey(parentId: string): string {
	return `${STORAGE_PREFIX}${parentId}`;
}

function readFromStorage(parentId: string): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return window.localStorage.getItem(storageKey(parentId)) === '1';
	} catch {
		return false;
	}
}

function writeToStorage(parentId: string, value: boolean): void {
	if (typeof window === 'undefined') return;
	try {
		if (value) {
			window.localStorage.setItem(storageKey(parentId), '1');
		} else {
			window.localStorage.removeItem(storageKey(parentId));
		}
	} catch {
		// Storage may be unavailable (private mode, quota); ignore — the toggle
		// still works for the current session via component state.
	}
}

interface UseShowOriginalsOverrideResult {
	showOriginals: boolean;
	setShowOriginals: (value: boolean) => void;
}

/**
 * Per-user, per-parent override for the admin's `clusters-only` surface mode.
 * When enabled, the suggestions view also renders originals inline so the user
 * can see the full pool alongside the clusters.
 *
 * Persisted to localStorage so the choice survives navigation and reload but
 * does not sync across devices — by design (it's a viewing preference, not a
 * data setting).
 */
export function useShowOriginalsOverride(
	parentId: string | undefined,
): UseShowOriginalsOverrideResult {
	const [value, setValue] = useState<boolean>(() => (parentId ? readFromStorage(parentId) : false));

	useEffect(() => {
		setValue(parentId ? readFromStorage(parentId) : false);
	}, [parentId]);

	const setShowOriginals = useCallback(
		(next: boolean) => {
			setValue(next);
			if (parentId) writeToStorage(parentId, next);
		},
		[parentId],
	);

	return { showOriginals: value, setShowOriginals };
}
