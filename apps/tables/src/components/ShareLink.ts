import m from 'mithril';
import QRCode from 'qrcode';
import { logError } from '@freedi/shared-utils';
import { t } from '@/lib/i18n';

/**
 * The participant link with a copy button and a QR code. The link carries
 * nothing but the session id: positions and rankings never go in a URL.
 */
export interface ShareLinkAttrs {
	url: string;
}

const QR_WIDTH_PX = 224;
const QR_MARGIN_MODULES = 2;
const COPIED_RESET_MS = 2_000;

const qrCache = new Map<string, string>();

async function qrFor(url: string): Promise<string | null> {
	const cached = qrCache.get(url);

	if (cached) return cached;

	try {
		const dataUrl = await QRCode.toDataURL(url, { width: QR_WIDTH_PX, margin: QR_MARGIN_MODULES });

		qrCache.set(url, dataUrl);

		return dataUrl;
	} catch (error) {
		logError(error, { operation: 'tables.shareLink.qr', metadata: { url } });

		return null;
	}
}

export const ShareLink: m.ClosureComponent<ShareLinkAttrs> = (initial) => {
	let qr: string | null = qrCache.get(initial.attrs.url) ?? null;
	let qrFailed = false;
	let copied = false;
	let copyFailed = false;
	let lastUrl = '';

	function loadQr(url: string): void {
		lastUrl = url;
		void qrFor(url).then((dataUrl) => {
			if (url !== lastUrl) return;
			qr = dataUrl;
			qrFailed = dataUrl === null;
			m.redraw();
		});
	}

	async function copy(url: string): Promise<void> {
		copyFailed = false;

		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => {
				copied = false;
				m.redraw();
			}, COPIED_RESET_MS);
		} catch (error) {
			logError(error, { operation: 'tables.shareLink.copy' });
			copyFailed = true;
		}
		m.redraw();
	}

	return {
		oninit({ attrs }) {
			loadQr(attrs.url);
		},
		onbeforeupdate({ attrs }) {
			if (attrs.url !== lastUrl) loadQr(attrs.url);
		},
		view({ attrs }) {
			return m('.share-link', [
				m('label.field', [
					m('span.field__label', t('tableAssignment.link.label')),
					m('input.field__input.share-link__input', {
						type: 'text',
						readonly: true,
						dir: 'ltr',
						value: attrs.url,
						onfocus: (event: Event) => (event.target as HTMLInputElement).select(),
					}),
				]),
				m('.share-link__actions', [
					m(
						'button.btn.btn--secondary',
						{ type: 'button', onclick: () => void copy(attrs.url) },
						copied ? t('tableAssignment.link.copied') : t('tableAssignment.link.copy'),
					),
				]),
				copyFailed
					? m('p.notice.notice--error', { role: 'alert' }, t('tableAssignment.link.copyFailed'))
					: null,
				qr
					? m('img.share-link__qr', {
							src: qr,
							alt: t('tableAssignment.link.qrAlt'),
							width: QR_WIDTH_PX,
							height: QR_WIDTH_PX,
						})
					: qrFailed
						? null
						: m('p.share-link__qr-loading', t('tableAssignment.state.loading')),
			]);
		},
	};
};
