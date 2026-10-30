import m from 'mithril';
import { t } from '@/lib/i18n';

/**
 * Bottom band of the projector (UX section 6): step name at the start corner,
 * the join code and its QR at the end corner, on every step, so a late joiner
 * always has the code. Nothing here is interactive.
 */

const QR_BAND_SIZE = 56;
export const QR_WAITING_SIZE = 320;

// `qrcode` is only needed here; load it on first use like QRShare does.
type QRCodeApi = typeof import('qrcode');
let encoderPromise: Promise<QRCodeApi> | null = null;
const svgCache = new Map<string, string>();
const svgPending = new Set<string>();

function loadEncoder(): Promise<QRCodeApi> {
	if (!encoderPromise) {
		encoderPromise = import('qrcode').then((mod) => {
			const wrapped = mod as QRCodeApi & { default?: QRCodeApi };

			return wrapped.default ?? wrapped;
		});
	}

	return encoderPromise;
}

async function buildSvg(url: string, size: number): Promise<void> {
	const key = `${size}::${url}`;
	if (svgCache.has(key) || svgPending.has(key)) return;
	svgPending.add(key);
	try {
		const QRCode = await loadEncoder();
		const svg = await QRCode.toString(url, {
			type: 'svg',
			errorCorrectionLevel: 'M',
			margin: 1,
			width: size,
			color: { dark: '#000000', light: '#ffffff' },
		});
		svgCache.set(key, svg);
		m.redraw();
	} catch (err) {
		console.error('[Projector] QR generation failed:', err);
	} finally {
		svgPending.delete(key);
	}
}

interface QrAttrs {
	url: string;
	size: number;
}

/** QR code as inline SVG (white tile so a projector scan works on any theme). */
export const ProjectorQr: m.Component<QrAttrs> = {
	view(vnode) {
		const { url, size } = vnode.attrs;
		void buildSvg(url, size);
		const svg = svgCache.get(`${size}::${url}`);

		return m(
			size === QR_WAITING_SIZE ? '.projector-qr.projector-qr--waiting' : '.projector-qr',
			{ role: 'img', 'aria-label': t('projector.qrAria') },
			svg ? m.trust(svg) : null,
		);
	},
};

interface BandAttrs {
	stepName: string;
	code: string | undefined;
	joinUrl: string | undefined;
	/** The name the teacher gave the lesson; shown before the step name. Absent on old lessons. */
	lessonName?: string;
}

export const ProjectorBand: m.Component<BandAttrs> = {
	view(vnode) {
		const { stepName, code, joinUrl, lessonName } = vnode.attrs;

		return m('footer.projector-band', [
			m(
				'p.projector-band__step',
				lessonName ? [m('bdi', { dir: 'auto' }, lessonName), ' · ', stepName] : stepName,
			),
			code
				? m('.projector-band__join', [
						m('span.projector-band__label', t('projector.code')),
						m('span.projector-band__code', { dir: 'ltr' }, code),
						joinUrl ? m(ProjectorQr, { url: joinUrl, size: QR_BAND_SIZE }) : null,
					])
				: null,
		]);
	},
};
