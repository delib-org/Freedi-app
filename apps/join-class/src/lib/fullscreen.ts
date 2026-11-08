/**
 * Fullscreen API with the WebKit fallbacks (iPad, older Safari). Teacher-only:
 * only the lazy projector and console chunks import it.
 */

interface FullscreenDocument extends Document {
	webkitFullscreenEnabled?: boolean;
	webkitFullscreenElement?: Element | null;
	webkitExitFullscreen?: () => void;
}

interface FullscreenElement extends HTMLElement {
	webkitRequestFullscreen?: () => void;
}

const CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

function doc(): FullscreenDocument {
	return document as FullscreenDocument;
}

/** False on iPhone Safari and some kiosk browsers: the button is then not shown. */
export function fullscreenSupported(): boolean {
	const d = doc();

	return Boolean(d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? false);
}

export function isFullscreen(): boolean {
	const d = doc();

	return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

/** Asks for full screen. Must run inside a click handler. A refusal is expected, so it is info, not an error. */
export async function enterFullscreen(
	element: HTMLElement = document.documentElement,
): Promise<boolean> {
	const el = element as FullscreenElement;
	try {
		if (el.requestFullscreen) {
			await el.requestFullscreen({ navigationUI: 'hide' });
		} else if (el.webkitRequestFullscreen) {
			// the webkit call returns undefined, not a promise
			await Promise.resolve(el.webkitRequestFullscreen());
		} else {
			return false;
		}

		return true;
	} catch (err) {
		console.info('[Fullscreen] request refused:', err);

		return false;
	}
}

export async function exitFullscreen(): Promise<void> {
	const d = doc();
	try {
		if (!isFullscreen()) return;
		if (d.exitFullscreen) await d.exitFullscreen();
		else if (d.webkitExitFullscreen) await Promise.resolve(d.webkitExitFullscreen());
	} catch (err) {
		console.info('[Fullscreen] exit refused:', err);
	}
}

/** Subscribes to both change events; returns the unsubscribe. */
export function onFullscreenChange(listener: () => void): () => void {
	for (const name of CHANGE_EVENTS) document.addEventListener(name, listener);

	return () => {
		for (const name of CHANGE_EVENTS) document.removeEventListener(name, listener);
	};
}
