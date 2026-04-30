import m from 'mithril';
import QRCode from 'qrcode';
import { t } from '@/lib/i18n';

// Module-level cache: re-rendering the same URL is the common case (Mithril
// redraws the hub on every store change), so we memoise the SVG markup keyed
// by the URL+pixel-size pair. `qrcode.toString` is synchronous-feeling but
// returns a Promise, so caching also avoids flashing an empty box on each
// redraw while the next promise resolves.
const svgCache = new Map<string, string>();

function cacheKey(url: string, size: number): string {
	return `${size}::${url}`;
}

async function buildSvg(url: string, size: number): Promise<string> {
	const key = cacheKey(url, size);
	const cached = svgCache.get(key);
	if (cached) return cached;
	const svg = await QRCode.toString(url, {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 1,
		width: size,
		color: {
			dark: '#000000',
			light: '#ffffff',
		},
	});
	svgCache.set(key, svg);

	return svg;
}

let presenterOpen = false;
let escListenerAttached = false;
let copyFeedbackTimer: number | null = null;
let copyFeedbackVisible = false;

function ensureEscListener(): void {
	if (escListenerAttached) return;
	escListenerAttached = true;
	window.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape' && presenterOpen) {
			closePresenter();
		}
	});
}

function openPresenter(): void {
	presenterOpen = true;
	m.redraw();
}

function closePresenter(): void {
	if (!presenterOpen) return;
	presenterOpen = false;
	m.redraw();
}

function flashCopyFeedback(): void {
	copyFeedbackVisible = true;
	if (copyFeedbackTimer !== null) window.clearTimeout(copyFeedbackTimer);
	copyFeedbackTimer = window.setTimeout(() => {
		copyFeedbackVisible = false;
		copyFeedbackTimer = null;
		m.redraw();
	}, 2000);
	m.redraw();
}

async function copyLink(url: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(url);
		flashCopyFeedback();
	} catch (err) {
		// Some browsers (older Safari, embedded webviews) reject the async API.
		// Fall back to the legacy textarea trick before giving up so the user
		// still gets a clipboard hit instead of a silent dead button.
		try {
			const ta = document.createElement('textarea');
			ta.value = url;
			ta.setAttribute('readonly', '');
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			flashCopyFeedback();
		} catch (fallbackErr) {
			console.error('[QRShare] Copy failed:', err, fallbackErr);
		}
	}
}

async function shareLink(url: string, title: string): Promise<void> {
	if (typeof navigator.share !== 'function') {
		await copyLink(url);

		return;
	}
	try {
		await navigator.share({ title, url });
	} catch (err) {
		// AbortError happens when the user dismisses the native sheet — that's
		// not a failure, so don't log it. Anything else is real and worth a
		// console.error.
		if ((err as DOMException)?.name !== 'AbortError') {
			console.error('[QRShare] Share failed:', err);
		}
	}
}

interface QRShareAttrs {
	/** The full URL to encode + share. Caller passes `window.location.href`
	 *  or a canonical hub URL — the component never builds it itself. */
	url: string;
	/** Used in the Web Share API title and as the heading shown above the QR
	 *  in the fullscreen presenter overlay. Falls back to a generic label. */
	title?: string;
}

// `m.trust(svg)` requires re-running on every URL change. Each render computes
// the current cached SVG (if any) and kicks off the build for whatever isn't
// cached yet. The "loading" placeholder is only visible for one frame on first
// paint with a brand-new URL, so we keep it minimal.
function getCachedSvg(url: string, size: number): string | null {
	return svgCache.get(cacheKey(url, size)) ?? null;
}

function ensureSvgBuilt(url: string, size: number): void {
	const key = cacheKey(url, size);
	if (svgCache.has(key)) return;
	void buildSvg(url, size)
		.then(() => m.redraw())
		.catch((err) => {
			console.error('[QRShare] QR generation failed:', err);
		});
}

export const QRShare: m.Component<QRShareAttrs> = {
	oninit() {
		ensureEscListener();
	},

	view(vnode) {
		const { url } = vnode.attrs;
		const title = vnode.attrs.title ?? t('qrShare.defaultTitle');
		const compactSize = 144;
		const presenterSize = 720;

		ensureSvgBuilt(url, compactSize);
		if (presenterOpen) ensureSvgBuilt(url, presenterSize);

		const compactSvg = getCachedSvg(url, compactSize);
		const presenterSvg = getCachedSvg(url, presenterSize);
		const canShare = typeof navigator.share === 'function';

		return m('section.main-hub__qr', { 'aria-labelledby': 'main-hub-qr-label' }, [
			m(
				'button.main-hub__qr-canvas',
				{
					type: 'button',
					'aria-label': t('qrShare.expandAria'),
					onclick: openPresenter,
				},
				compactSvg ? m.trust(compactSvg) : null,
			),
			m('.main-hub__qr-body', [
				m('p.main-hub__qr-label', { id: 'main-hub-qr-label' }, t('qrShare.label')),
				m('.main-hub__qr-actions', [
					canShare
						? m(
								'button.btn.btn--primary.btn--small.main-hub__qr-action',
								{
									type: 'button',
									onclick: () => void shareLink(url, title),
								},
								t('qrShare.share'),
							)
						: null,
					m(
						'button.btn.btn--secondary.btn--small.main-hub__qr-action',
						{
							type: 'button',
							onclick: () => void copyLink(url),
							'aria-live': 'polite',
						},
						copyFeedbackVisible ? t('qrShare.copied') : t('qrShare.copy'),
					),
				]),
			]),
			presenterOpen
				? m(
						'.main-hub__qr-presenter',
						{
							role: 'dialog',
							'aria-modal': 'true',
							'aria-label': t('qrShare.presenterAria'),
							onclick: (e: MouseEvent) => {
								// Click on the scrim closes; clicks on inner content
								// stop propagation so they don't.
								if (e.target === e.currentTarget) closePresenter();
							},
						},
						[
							m(
								'button.main-hub__qr-presenter-close',
								{
									type: 'button',
									'aria-label': t('qrShare.close'),
									onclick: closePresenter,
								},
								'×',
							),
							m('h2.main-hub__qr-presenter-title', title),
							m('.main-hub__qr-presenter-canvas', presenterSvg ? m.trust(presenterSvg) : null),
							m('p.main-hub__qr-presenter-url', { dir: 'ltr' }, url),
						],
					)
				: null,
		]);
	},
};
