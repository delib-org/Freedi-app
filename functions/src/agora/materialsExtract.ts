import { lookup } from 'dns/promises';
import { AGORA_MATERIALS } from '@freedi/shared-types';
import type { SceneMaterialsFailure } from '@freedi/shared-types';
// The package root runs a debug read on import; the lib file is the parser.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import {
	clampText,
	htmlTitle,
	htmlToText,
	isPrivateAddress,
	normalizeText,
	parseFetchableUrl,
} from './materialsText';

export interface Extracted {
	text: string;
	truncated: boolean;
	title?: string;
	pageCount?: number;
}

export type ExtractResult =
	| { ok: true; value: Extracted }
	| { ok: false; reason: SceneMaterialsFailure };

/** Characters of extracted text below which a source is treated as "no text" (a scan, an app shell) */
const MIN_USEFUL_CHARS = 40;
const MAX_REDIRECTS = 4;
/**
 * The Functions emulator runs on the developer's machine, where the only page
 * worth fetching in a test is a local one. Never true in production.
 */
const LOCAL_FETCH_ALLOWED = process.env.FUNCTIONS_EMULATOR === 'true';
const USER_AGENT = 'Mozilla/5.0 (compatible; AgoraReader/1.0; classroom materials)';

export async function extractPdfText(buffer: Buffer, maxChars: number): Promise<ExtractResult> {
	if (buffer.length === 0 || buffer.length > AGORA_MATERIALS.MAX_PDF_BYTES) {
		return { ok: false, reason: buffer.length === 0 ? 'pdf_unreadable' : 'too_big' };
	}
	let parsed: { text: string; numpages: number };
	try {
		parsed = await pdfParse(buffer);
	} catch {
		return { ok: false, reason: 'pdf_unreadable' };
	}
	const text = normalizeText(parsed.text ?? '');
	if (text.length < MIN_USEFUL_CHARS) return { ok: false, reason: 'pdf_no_text' };
	const clamped = clampText(text, maxChars);

	return { ok: true, value: { ...clamped, pageCount: parsed.numpages } };
}

async function assertPublicHost(hostname: string): Promise<boolean> {
	try {
		const addresses = await lookup(hostname, { all: true });

		return addresses.length > 0 && addresses.every((entry) => !isPrivateAddress(entry.address));
	} catch {
		return false;
	}
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
	if (!response.body) return Buffer.alloc(0);
	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		if (total > maxBytes) {
			await reader.cancel();
			// A page longer than the cap still yields its beginning
			chunks.push(Buffer.from(value.subarray(0, value.length - (total - maxBytes))));
			break;
		}
		chunks.push(Buffer.from(value));
	}

	return Buffer.concat(chunks);
}

/** Fetch one web page (or PDF) and return its readable text. Never touches private networks. */
export async function fetchLinkText(rawUrl: string, maxChars: number): Promise<ExtractResult> {
	const first = parseFetchableUrl(rawUrl, LOCAL_FETCH_ALLOWED);
	if (!first) return { ok: false, reason: 'link_invalid' };
	let url: URL = first;

	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		if (!LOCAL_FETCH_ALLOWED && !(await assertPublicHost(url.hostname)))
			return { ok: false, reason: 'link_unreachable' };
		let response: Response;
		try {
			response = await fetch(url, {
				redirect: 'manual',
				signal: AbortSignal.timeout(AGORA_MATERIALS.LINK_TIMEOUT_MS),
				headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain,application/pdf;q=0.9' },
			});
		} catch {
			return { ok: false, reason: 'link_unreachable' };
		}

		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location');
			const next: URL | null = location
				? parseFetchableUrl(new URL(location, url).toString(), LOCAL_FETCH_ALLOWED)
				: null;
			if (!next) return { ok: false, reason: 'link_unreachable' };
			url = next;
			continue;
		}
		if (!response.ok) return { ok: false, reason: 'link_unreachable' };

		const type = (response.headers.get('content-type') ?? '').toLowerCase();
		const isPdf = type.includes('application/pdf') || url.pathname.toLowerCase().endsWith('.pdf');
		const isHtml = type.includes('html') || type.includes('xml');
		const isPlain = type.includes('text/plain');
		if (!isPdf && !isHtml && !isPlain) return { ok: false, reason: 'link_not_text' };

		let body: Buffer | null;
		try {
			body = await readBodyCapped(
				response,
				isPdf ? AGORA_MATERIALS.MAX_PDF_BYTES : AGORA_MATERIALS.MAX_LINK_BYTES,
			);
		} catch {
			return { ok: false, reason: 'link_unreachable' };
		}
		if (!body) return { ok: false, reason: 'link_unreachable' };

		if (isPdf) {
			const pdf = await extractPdfText(body, maxChars);

			return pdf.ok
				? pdf
				: { ok: false, reason: pdf.reason === 'pdf_no_text' ? 'link_no_text' : 'link_not_text' };
		}

		const raw = body.toString('utf8');
		const text = isHtml ? htmlToText(raw) : normalizeText(raw);
		if (text.length < MIN_USEFUL_CHARS) return { ok: false, reason: 'link_no_text' };

		return {
			ok: true,
			value: { ...clampText(text, maxChars), title: isHtml ? htmlTitle(raw) : undefined },
		};
	}

	return { ok: false, reason: 'link_unreachable' };
}
