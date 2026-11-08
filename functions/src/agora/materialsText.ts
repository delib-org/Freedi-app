import { AGORA_MATERIALS } from '@freedi/shared-types';

/**
 * Plain-text helpers for scene materials. Pure — no network, no Firestore —
 * so the limits and the HTML clean-up are testable on their own.
 */

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ndash: '–',
	mdash: '—',
	hellip: '…',
	laquo: '«',
	raquo: '»',
	rlm: '',
	lrm: '',
};

function decodeEntities(input: string): string {
	return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body: string) => {
		if (body[0] === '#') {
			const code =
				body[1] === 'x' || body[1] === 'X'
					? parseInt(body.slice(2), 16)
					: parseInt(body.slice(1), 10);

			return Number.isFinite(code) && code > 0 && code < 0x110000
				? String.fromCodePoint(code)
				: ' ';
		}
		const named = NAMED_ENTITIES[body.toLowerCase()];

		return named === undefined ? match : named;
	});
}

/** Collapse runs of spaces, keep paragraph breaks, trim */
export function normalizeText(input: string): string {
	return input
		.replace(/\r\n?/g, '\n')
		.replace(/[\t\f\v\u00a0]+/g, ' ')
		.replace(/[ ]{2,}/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/**
 * The readable text of an HTML page. Scripts, styles, navigation and other
 * chrome are dropped; the article/main region is preferred when there is one.
 */
export function htmlToText(html: string): string {
	let body = html;
	const region = body.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i);
	if (region && region[2].length > 400) body = region[2];

	body = body
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(
			/<(script|style|noscript|template|svg|canvas|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi,
			' ',
		)
		.replace(/<(br|hr)\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|pre|table|ul|ol)>/gi, '\n')
		.replace(/<(li)\b[^>]*>/gi, '\n• ')
		.replace(/<[^>]+>/g, ' ');

	return normalizeText(decodeEntities(body));
}

/** The page's <title>, if it has one */
export function htmlTitle(html: string): string {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

	return match
		? normalizeText(decodeEntities(match[1])).slice(0, AGORA_MATERIALS.MAX_TITLE_CHARS)
		: '';
}

export interface ClampedText {
	text: string;
	truncated: boolean;
}

/** Cut to `max` characters on a word boundary when it has to be cut */
export function clampText(input: string, max: number): ClampedText {
	if (input.length <= max) return { text: input, truncated: false };
	const cut = input.slice(0, max);
	const lastBreak = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf(' '));

	return { text: (lastBreak > max * 0.8 ? cut.slice(0, lastBreak) : cut).trim(), truncated: true };
}

/** The characters still free on a scene that already holds `usedChars` */
export function remainingChars(usedChars: number): number {
	return Math.max(0, AGORA_MATERIALS.MAX_TOTAL_CHARS - usedChars);
}

/** First characters for the teacher's "it worked" preview */
export function previewOf(text: string, max = 280): string {
	const flat = text.replace(/\s+/g, ' ').trim();

	return flat.length <= max ? flat : `${flat.slice(0, max).trim()}…`;
}

export function cleanTitle(raw: string | undefined, fallback: string): string {
	const title = normalizeText((raw ?? '').replace(/\s+/g, ' '));

	return (title || fallback).slice(0, AGORA_MATERIALS.MAX_TITLE_CHARS);
}

/* ---------- link safety ---------- */

/** True for an address a server must never fetch on a user's behalf */
export function isPrivateAddress(address: string): boolean {
	const v4 = address.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];

		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224
		);
	}
	const v6 = address.toLowerCase();
	if (v6 === '::1' || v6 === '::') return true;
	if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));

	return (
		v6.startsWith('fc') ||
		v6.startsWith('fd') ||
		v6.startsWith('fe8') ||
		v6.startsWith('fe9') ||
		v6.startsWith('fea') ||
		v6.startsWith('feb')
	);
}

/** A web link we are willing to fetch: http(s), no credentials, a real host */
export function parseFetchableUrl(raw: string, allowLocal = false): URL | null {
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > 2000) return null;
	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return null;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
	if (url.username || url.password) return null;
	if (allowLocal) return url;
	const host = url.hostname.toLowerCase();
	if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal'))
		return null;
	if (!host.includes('.') && !host.includes(':')) return null;

	return url;
}

/* ---------- storage paths ---------- */

const BUCKET_NAME = /^[a-z0-9._-]+$/;

/** `agora/{pkg}/materials/{file}` under the package's own folder, nothing else */
export function isMaterialStoragePath(topicPackageId: string, path: string): boolean {
	const prefix = `agora/${topicPackageId}/materials/`;

	return (
		path.startsWith(prefix) &&
		path.length > prefix.length &&
		!path.includes('..') &&
		path.length < 400
	);
}

/** The bucket a Firebase download URL names, and the object path inside it */
export function parseDownloadUrl(fileUrl: string): { bucket: string; path: string } | null {
	try {
		const url = new URL(fileUrl);
		const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
		if (!match || !BUCKET_NAME.test(match[1])) return null;

		return { bucket: match[1], path: decodeURIComponent(match[2]) };
	} catch {
		return null;
	}
}
