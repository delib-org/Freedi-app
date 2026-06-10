/**
 * PWA install helpers. Captures the Android/desktop `beforeinstallprompt` event
 * so we can trigger the native install at an intent moment, and detects the iOS
 * case (which has no programmatic prompt — the user must use Share → Add to Home
 * Screen). Snooze bookkeeping lives in localStorage so we never nag.
 *
 * Import `isIOS` / `isStandalone` from `push.ts` to avoid duplicating detection.
 */
import { isIOS, isStandalone } from './push';

interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const SNOOZE_KEY = 'chat.installSnoozeUntil';
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 7; // a week

/** Begin listening for the install prompt event. Call once on mount. */
export function initInstallCapture(): () => void {
	if (typeof window === 'undefined') return () => {};
	const handler = (e: Event) => {
		e.preventDefault(); // stash it; we trigger at an intent moment
		deferredPrompt = e as BeforeInstallPromptEvent;
	};
	window.addEventListener('beforeinstallprompt', handler);

	return () => window.removeEventListener('beforeinstallprompt', handler);
}

/** True if already installed (home-screen / standalone) — nothing to prompt. */
export function isInstalled(): boolean {
	return isStandalone();
}

/** Whether the user has snoozed the install prompt recently. */
export function isInstallSnoozed(): boolean {
	if (typeof window === 'undefined') return true;
	try {
		const until = Number(window.localStorage.getItem(SNOOZE_KEY) ?? '0');

		return Date.now() < until;
	} catch {
		return false;
	}
}

/** Snooze the install prompt for a week. */
export function snoozeInstall(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
	} catch {
		/* storage disabled — best effort */
	}
}

export type InstallAffordance = 'none' | 'ios-instructions' | 'native-prompt';

/**
 * What install affordance (if any) to offer right now. `none` when already
 * installed or recently snoozed; `ios-instructions` when on iOS Safari and not
 * installed; `native-prompt` when a `beforeinstallprompt` is available.
 */
export function getInstallAffordance(): InstallAffordance {
	if (isInstalled() || isInstallSnoozed()) return 'none';
	if (isIOS()) return 'ios-instructions';
	if (deferredPrompt) return 'native-prompt';

	return 'none';
}

/** Trigger the captured native install prompt (Android/desktop). */
export async function promptNativeInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
	if (!deferredPrompt) return 'unavailable';
	try {
		await deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		deferredPrompt = null;

		return outcome;
	} catch {
		return 'dismissed';
	}
}
