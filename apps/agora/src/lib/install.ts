import m from 'mithril';

/**
 * Home-screen install offer, made at the END of the game — never on page load
 * and never mid-play.
 *
 * It used to pop up on two "smart moments" (news landing in the post box,
 * an email cadence being saved), which in practice meant a modal over the
 * square while a student was still writing. The results screen is where the
 * ask belongs: the game has just shown what the icon is for — classmates
 * responding to your idea, a proposal you can keep improving, a next game —
 * and nothing is interrupted any more.
 *
 * The offer respects a two-week cooldown after a dismissal, disappears for
 * the sitting once answered either way, and never appears inside an
 * already-installed app.
 */

/** Chrome's install prompt, stashed until the results screen asks for it */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let answeredThisSitting = false;

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
		answeredThisSitting = true;
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

/**
 * Whether the results screen should carry the offer right now. Pure read —
 * the card renders inline, so there is no "show" state to flip; the screen
 * simply asks on every draw.
 */
export function installOfferAvailable(): boolean {
	if (answeredThisSitting) return false;
	if (isStandalone() || recentlyDismissed()) return false;
	// Nothing to offer: Chrome never volunteered its prompt and this is not
	// an iOS browser where manual instructions are the only road anyway

	return deferredPrompt !== null || isIOS();
}

/** Whether the native browser prompt is available (vs. iOS instructions) */
export function canPromptInstall(): boolean {
	return deferredPrompt !== null;
}

export function dismissInstallOffer(): void {
	answeredThisSitting = true;
	try {
		localStorage.setItem(DISMISS_KEY, String(Date.now()));
	} catch {
		// Storage blocked — the sitting flag still keeps it quiet for now
	}
}

/** Run the native install prompt. The offer closes either way — the browser's
 *  own dialog has taken over, and re-asking after a refusal is nagging. */
export async function promptInstall(): Promise<void> {
	const prompt = deferredPrompt;
	deferredPrompt = null;
	answeredThisSitting = true;
	if (!prompt) return;
	try {
		await prompt.prompt();
		await prompt.userChoice;
	} catch {
		// The browser refused (already prompted this load, etc.) — nothing to do
	}
	m.redraw();
}
