import { useSyncExternalStore } from 'react';

/** "מצב ישיר" — plain questionnaire mode without sea animations. */
export type GameMode = 'game' | 'direct';

const STORAGE_KEY = 'odyssey_mode';
const listeners = new Set<() => void>();

function current(): GameMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'direct') return 'direct';
		if (stored === 'game') return 'game';

		// No stored preference: reduced-motion users get the plain
		// questionnaire by default — the direct flow IS the accessible path.
		// The topnav toggle still lets them opt into game mode explicitly.
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'direct' : 'game';
	} catch {
		return 'game';
	}
}

export function toggleMode(): void {
	try {
		localStorage.setItem(STORAGE_KEY, current() === 'direct' ? 'game' : 'direct');
	} catch {
		// storage unavailable — stay in game mode
	}
	for (const listener of listeners) listener();
}

export function useMode(): GameMode {
	return useSyncExternalStore((listener) => {
		listeners.add(listener);

		return () => listeners.delete(listener);
	}, current);
}
