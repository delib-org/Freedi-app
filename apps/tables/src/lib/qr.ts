import QRCode from 'qrcode';
import { logError } from '@freedi/shared-utils';

const QR_MARGIN_MODULES = 2;

const cache = new Map<string, string>();

/** A QR image of the link as a data URL, or null when it cannot be drawn. */
export async function qrDataUrl(url: string, widthPx: number): Promise<string | null> {
	const key = `${widthPx}:${url}`;
	const cached = cache.get(key);

	if (cached) return cached;

	try {
		const dataUrl = await QRCode.toDataURL(url, { width: widthPx, margin: QR_MARGIN_MODULES });

		cache.set(key, dataUrl);

		return dataUrl;
	} catch (error) {
		logError(error, { operation: 'tables.qr.draw', metadata: { url } });

		return null;
	}
}
