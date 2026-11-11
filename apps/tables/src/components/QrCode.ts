import m from 'mithril';
import { t } from '@/lib/i18n';
import { qrDataUrl } from '@/lib/qr';

/** The QR code of a link. The link carries only the assignment's id. */
export interface QrCodeAttrs {
	url: string;
	/** Pixels of the drawn image; the size on screen comes from the style. */
	widthPx: number;
	className: string;
}

export const QrCode: m.ClosureComponent<QrCodeAttrs> = () => {
	let image: string | null = null;
	let failed = false;
	let drawnFor = '';

	function draw(url: string, widthPx: number): void {
		drawnFor = url;
		void qrDataUrl(url, widthPx).then((dataUrl) => {
			if (url !== drawnFor) return;
			image = dataUrl;
			failed = dataUrl === null;
			m.redraw();
		});
	}

	return {
		oninit({ attrs }) {
			draw(attrs.url, attrs.widthPx);
		},
		onbeforeupdate({ attrs }) {
			if (attrs.url !== drawnFor) draw(attrs.url, attrs.widthPx);
		},
		view({ attrs }) {
			if (image) {
				return m('img', {
					class: attrs.className,
					src: image,
					alt: t('tableAssignment.link.qrAlt'),
				});
			}

			return failed ? null : m('p.qr-loading', t('tableAssignment.state.loading'));
		},
	};
};
