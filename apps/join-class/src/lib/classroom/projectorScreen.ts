/**
 * Projector modes (IA 15, UX 15.I). Pure, no framework import, so it tests in
 * plain vitest. The mode lives in the URL: `?mode=window` is the projector's
 * own window, anything else is `here` (this tab; always has a way back).
 */

const MS_PER_SECOND = 1000;

/** The control hides after this long with no input on that device. */
export const PROJECTOR_CONTROLS_IDLE_MS = 3 * MS_PER_SECOND;
/** The first-open hint of the own window leaves after this long. */
export const PROJECTOR_HINT_MS = 10 * MS_PER_SECOND;
/** A pointer must move this far to wake the control (drops synthetic moves on re-render). */
export const POINTER_WAKE_PX = 4;
export const PROJECTOR_WINDOW_SIZE = { width: 1280, height: 720 } as const;

export type ProjectorMode = 'window' | 'here';

export function projectorMode(param: unknown): ProjectorMode {
	return param === 'window' ? 'window' : 'here';
}

export function projectorWindowName(mid: string): string {
	return `projector-${mid}`;
}

export function projectorPath(mid: string, mode: ProjectorMode): string {
	return mode === 'window' ? `/t/${mid}/screen?mode=window` : `/t/${mid}/screen`;
}

export function windowFeatures(): string {
	return `popup,width=${PROJECTOR_WINDOW_SIZE.width},height=${PROJECTOR_WINDOW_SIZE.height}`;
}

/** True when the pointer moved at least POINTER_WAKE_PX from the last position. */
export function movedFarEnough(
	from: { x: number; y: number } | null,
	to: { x: number; y: number },
): boolean {
	if (!from) return true;

	return Math.hypot(to.x - from.x, to.y - from.y) >= POINTER_WAKE_PX;
}

/** The slice of Window the opener needs, so a test can fake it. */
export interface OpenerHost {
	open: (url: string, name: string, features: string) => OpenedWindow | null;
	origin: string;
}

export interface OpenedWindow {
	closed: boolean;
	location: { href: string; assign: (url: string) => void };
	focus: () => void;
}

let openedWindow: OpenedWindow | null = null;

/**
 * Opens the projector window, or brings the one already open forward without
 * reloading it (its full screen would be lost). Returns false when the browser
 * blocked the pop-up; nothing navigates then.
 */
export function openProjectorWindow(mid: string, host: OpenerHost): boolean {
	if (openedWindow && !openedWindow.closed) {
		openedWindow.focus();

		return true;
	}
	const win = host.open('', projectorWindowName(mid), windowFeatures());
	if (!win) {
		openedWindow = null;

		return false;
	}
	// A window with this name from an earlier click may already show the projector.
	const href = win.location.href;
	if (href === 'about:blank' || href === '') {
		win.location.assign(`${host.origin}${projectorPath(mid, 'window')}`);
	}
	openedWindow = win;
	win.focus();

	return true;
}

/** Test hook: forget the remembered window. */
export function resetProjectorWindow(): void {
	openedWindow = null;
}
