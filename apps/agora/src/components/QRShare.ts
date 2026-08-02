import m from 'mithril';
import QRCode from 'qrcode';

export interface QRShareAttrs {
	/** Full URL to encode */
	url: string;
	size?: number;
}

/** Renders a QR code on a parchment panel (teacher projector view) */
export function QRShare(): m.Component<QRShareAttrs> {
	let dataUrl = '';
	let renderedFor = '';

	function generate(url: string, size: number): void {
		QRCode.toDataURL(url, {
			width: size,
			margin: 1,
			color: { dark: '#253352', light: '#ffffff' },
		})
			.then((result) => {
				dataUrl = result;
				renderedFor = url;
				m.redraw();
			})
			.catch((error: unknown) => {
				console.error('[QRShare] QR generation failed:', error);
			});
	}

	return {
		view(vnode) {
			const { url, size = 220 } = vnode.attrs;
			if (url !== renderedFor) generate(url, size);

			return m('.teacher__qr', [
				dataUrl ? m('img', { src: dataUrl, width: size, height: size, alt: url }) : m('.spinner'),
			]);
		},
	};
}
