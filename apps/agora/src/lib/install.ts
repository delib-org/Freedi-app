import m from 'mithril';

/**
 * Home-screen install suggestion, made at a SMART time — never on page load.
 *
 * A cold install banner is furniture; the moment the game has just proven why
 * an icon on the home screen is worth having is when the ask lands. Two such
 * moments call maybeSuggestInstall(): news arriving in the post box (the
 * installed icon will carry that count as a badge), and saving an email
 * cadence (a player arranging to be told about updates plainly intends to
 * come back).
 *
 * The suggestion shows at most once a sitting, respects a two-week cooldown
 * after a dismissal, and never appears inside an already-installed app.
 */

/** Chrome's install prompt, stashed until the smart moment asks for it */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let hintVisible = false;
let suggestedThisSitting = false;

const DISMISS_KEY = 'agora_install_hint_dismissed';
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Must run at app start: the browser fires beforeinstallprompt once, early,
 * and a listener registered later has simply missed it.
 */
export function initInstallCapture(): void {
	window.addEventListener('beforeinstallprompt', (event) => {
		event.preventDefault();
		deferredPrompt = event as BeforeInstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		deferredPrompt = null;
		hintVisible = false;
		m.redraw();
	});
}

export function isStandalone(): boolean {
	return (
		window.matchMedia?.('(display-mode: standalone)').matches === true ||
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

/** iPadOS reports MacIntel + touch — the UA alone misses modern iPads */
export function isIOS(): boolean {
	return (
		/iphone|ipad|ipod/i.test(navigator.userAgent) ||
		(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
	);
}

function recentlyDismissed(): boolean {
	try {
		const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);

		return Date.now() - at < DISMISS_COOLDOWN_MS;
	} catch {
		return false;
	}
}

/** A smart moment happened — surface the hint if the ground is right. */
export function maybeSuggestInstall(): void {
	if (hintVisible || suggestedThisSitting) return;
	if (isStandalone() || recentlyDismissed()) return;
	// Nothing to offer: Chrome never volunteered its prompt and this is not
	// an iOS browser where manual instructions are the only road anyway
	if (!deferredPrompt && !isIOS()) return;
	hintVisible = true;
	suggestedThisSitting = true;
	m.redraw();
}

export function installHintVisible(): boolean {
	return hintVisible;
}

/** Whether the native browser prompt is available (vs. iOS instructions) */
export function canPromptInstall(): boolean {
	return deferredPrompt !== null;
}

export function dismissInstallHint(): void {
	hintVisible = false;
	try {
		localStorage.setItem(DISMISS_KEY, String(Date.now()));
	} catch {
		// Storage blocked — the sitting flag still keeps it quiet for now
	}
}

/** Run the native install prompt. The hint closes either way — the browser's
 *  own dialog has taken over, and re-asking after a refusal is nagging. */
export async function promptInstall(): Promise<void> {
	const prompt = deferredPrompt;
	deferredPrompt = null;
	hintVisible = false;
	if (!prompt) return;
	try {
		await prompt.prompt();
		await prompt.userChoice;
	} catch {
		// The browser refused (already prompted this load, etc.) — nothing to do
	}
	m.redraw();
}
