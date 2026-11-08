import m from 'mithril';
import { logError } from '@freedi/shared-utils';
import { t } from './i18n';

/**
 * The runtime half of the boot guard in index.html.
 *
 * The inline script there catches what happens BEFORE this module exists — a
 * module that fails to parse, a chunk that never arrives — and paints a
 * fallback screen. Once the app is up, this module takes over: it reports what
 * the inline guard stashed, and from then on every uncaught error and every
 * unhandled rejection is logged with context (Sentry in production, the
 * console locally) and shown as a banner with a reload — instead of a
 * half-dead screen nobody in the room can explain.
 */

export interface EarlyError {
	message: string;
	source: string;
	line: number;
	stack: string;
	at: number;
}

interface BootWindow extends Window {
	__agoraEarlyErrors?: EarlyError[];
	__agoraBooted?: boolean;
}

const bootWindow = window as BootWindow;

/** Noise no one can act on — a resize loop, an extension's script */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/];

let bannerMessage: string | null = null;
let bannerShownAt = 0;
const BANNER_DEDUPE_MS = 5000;

/** The banner's current message, for the view that renders it */
export function bootBannerMessage(): string | null {
	return bannerMessage;
}

export function dismissBootBanner(): void {
	bannerMessage = null;
	m.redraw();
}

function messageOf(reason: unknown): string {
	if (reason instanceof Error) return reason.message;
	if (typeof reason === 'string') return reason;
	try {
		return JSON.stringify(reason);
	} catch {
		return String(reason);
	}
}

function showBanner(message: string): void {
	const now = Date.now();
	if (bannerMessage === message && now - bannerShownAt < BANNER_DEDUPE_MS) return;
	bannerMessage = message;
	bannerShownAt = now;
	m.redraw();
}

function report(reason: unknown, operation: string, extra: Record<string, unknown> = {}): void {
	const message = messageOf(reason);
	if (IGNORED.some((pattern) => pattern.test(message))) return;
	logError(reason instanceof Error ? reason : new Error(message), {
		operation,
		metadata: { ...extra, href: location.href },
	});
	showBanner(message);
}

/** Every uncaught error and unhandled rejection from here on is reported and shown */
export function installRuntimeGuards(): void {
	window.addEventListener('error', (event) => {
		report(event.error ?? event.message, 'agora.uncaught', {
			source: event.filename,
			line: event.lineno,
		});
	});
	window.addEventListener('unhandledrejection', (event) => {
		report(event.reason, 'agora.unhandledRejection');
	});
}

/** What the inline guard caught before this module loaded */
export function flushEarlyErrors(): void {
	const early = bootWindow.__agoraEarlyErrors ?? [];
	early.splice(0).forEach((entry) => {
		logError(new Error(entry.message), {
			operation: 'agora.boot',
			metadata: { source: entry.source, line: entry.line, stack: entry.stack, at: entry.at },
		});
	});
}

/** The app is on screen: retire the fallback and the watchdog */
export function markBooted(): void {
	bootWindow.__agoraBooted = true;
	document.getElementById('agora-boot-fallback')?.remove();
}

/** The banner, mounted once above the router's root */
export const BootBanner: m.Component = {
	view() {
		if (!bannerMessage) return null;

		return m('.boot-banner', { role: 'alert' }, [
			m('.boot-banner__text', [
				m('strong', t('boot.error_title')),
				m('span.boot-banner__detail', bannerMessage),
			]),
			m('.boot-banner__actions', [
				m(
					'button.btn.btn--sm.btn--primary',
					{ type: 'button', onclick: () => location.reload() },
					t('boot.reload'),
				),
				m(
					'button.btn.btn--sm.btn--ghost',
					{ type: 'button', onclick: dismissBootBanner },
					t('boot.dismiss'),
				),
			]),
		]);
	},
};
