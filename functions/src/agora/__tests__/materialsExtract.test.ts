import { AGORA_MATERIALS } from '@freedi/shared-types';
import { extractPdfText, fetchLinkText } from '../materialsExtract';
import { readFileSync } from 'fs';
import { join } from 'path';

const fixture = (name: string): Buffer => readFileSync(join(__dirname, 'fixtures', name));

describe('extractPdfText', () => {
	it('reads the text layer of a PDF', async () => {
		const pdf = fixture('harbour.pdf');
		const result = await extractPdfText(pdf, 1000);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.text).toContain('harbour opened in 1912');
		expect(result.value.pageCount).toBe(1);
		expect(result.value.truncated).toBe(false);
	});

	it('cuts a long PDF at the cap and says so', async () => {
		const pdf = fixture('harbour.pdf');
		const result = await extractPdfText(pdf, 60);
		expect(result.ok && result.value.truncated).toBe(true);
		expect(result.ok && result.value.text.length).toBeLessThanOrEqual(60);
	});

	it('reports unreadable bytes and a PDF with no text', async () => {
		expect(await extractPdfText(Buffer.from('this is not a pdf'), 1000)).toEqual({
			ok: false,
			reason: 'pdf_unreadable',
		});
		expect(await extractPdfText(fixture('almost-empty.pdf'), 1000)).toEqual({
			ok: false,
			reason: 'pdf_no_text',
		});
		expect(await extractPdfText(Buffer.alloc(0), 1000)).toEqual({
			ok: false,
			reason: 'pdf_unreadable',
		});
		expect(await extractPdfText(Buffer.alloc(AGORA_MATERIALS.MAX_PDF_BYTES + 1), 1000)).toEqual({
			ok: false,
			reason: 'too_big',
		});
	});
});

describe('fetchLinkText', () => {
	it('refuses links that are not fetchable web pages, without any network', async () => {
		expect(await fetchLinkText('file:///etc/passwd', 1000)).toEqual({
			ok: false,
			reason: 'link_invalid',
		});
		expect(await fetchLinkText('', 1000)).toEqual({ ok: false, reason: 'link_invalid' });
		expect(await fetchLinkText('http://localhost:8080/x', 1000)).toEqual({
			ok: false,
			reason: 'link_invalid',
		});
	});

	it('will not fetch a host that resolves to a private address', async () => {
		expect(await fetchLinkText('http://127.0.0.1/admin', 1000)).toEqual({
			ok: false,
			reason: 'link_unreachable',
		});
		expect(await fetchLinkText('http://169.254.169.254/latest/meta-data', 1000)).toEqual({
			ok: false,
			reason: 'link_unreachable',
		});
	});
});
