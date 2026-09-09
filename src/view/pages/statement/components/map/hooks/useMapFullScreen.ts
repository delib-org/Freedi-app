import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

/** Marks the element that the map control should present in native full screen. */
export const MAP_ROOT_ATTRIBUTE = 'data-map-root';

/** Applied while the same element is the browser's native full-screen element. */
export const MAP_FULL_SCREEN_CLASS = 'is-map-fullscreen';

export function findMapRoot(from: Element | null | undefined): HTMLElement | null {
	return from?.closest<HTMLElement>(`[${MAP_ROOT_ATTRIBUTE}]`) ?? null;
}

export interface MapFullScreenState {
	isFullScreen: boolean;
	/** False when the control has no map root or native full screen is unavailable. */
	available: boolean;
	toggle: () => void;
}

/**
 * Presents the nearest map root with the browser's Fullscreen API. State follows
 * `document.fullscreenElement`, so a rejected request never leaves a CSS-only
 * imitation of full screen behind.
 */
export function useMapFullScreen(anchorRef: RefObject<HTMLElement | null>): MapFullScreenState {
	const [isFullScreen, setIsFullScreen] = useState(false);
	const [available, setAvailable] = useState(false);
	const rootRef = useRef<HTMLElement | null>(null);

	const clear = useCallback(() => {
		rootRef.current?.classList.remove(MAP_FULL_SCREEN_CLASS);
		rootRef.current = null;
		setIsFullScreen(false);
	}, []);

	useEffect(() => {
		const root = findMapRoot(anchorRef.current);
		setAvailable(!!root && typeof root.requestFullscreen === 'function');
	}, [anchorRef]);

	useEffect(() => {
		function onFullScreenChange() {
			const root = rootRef.current;
			if (root && document.fullscreenElement === root) {
				root.classList.add(MAP_FULL_SCREEN_CLASS);
				setIsFullScreen(true);

				return;
			}

			clear();
		}

		document.addEventListener('fullscreenchange', onFullScreenChange);

		return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
	}, [clear]);

	const enter = useCallback(async () => {
		const root = findMapRoot(anchorRef.current);
		if (!root?.requestFullscreen) return;

		rootRef.current = root;
		try {
			await root.requestFullscreen();
			// Some embedded implementations do not dispatch the event.
			if (document.fullscreenElement === root) {
				root.classList.add(MAP_FULL_SCREEN_CLASS);
				setIsFullScreen(true);
			} else {
				clear();
			}
		} catch {
			clear();
		}
	}, [anchorRef, clear]);

	const exit = useCallback(async () => {
		if (document.fullscreenElement === rootRef.current && document.exitFullscreen) {
			try {
				await document.exitFullscreen();
			} catch {
				// The fullscreenchange listener remains authoritative when exit fails.
			}
		}

		if (document.fullscreenElement !== rootRef.current) clear();
	}, [clear]);

	const toggle = useCallback(() => {
		void (isFullScreen ? exit() : enter());
	}, [isFullScreen, enter, exit]);

	useEffect(() => clear, [clear]);

	return { isFullScreen, available, toggle };
}

export default useMapFullScreen;
