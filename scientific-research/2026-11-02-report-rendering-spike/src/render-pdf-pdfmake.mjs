// Usage: node src/render-pdf-pdfmake.mjs <fixture.json> <out.pdf> [logical|visual]
// pdfmake (pdfkit + fontkit) shapes Arabic via GSUB but has NO bidi algorithm.
// "logical": feed the logical string (glyphs join, but run order is LTR -> wrong).
// "visual":  pre-reorder with bidi-js (order right, but fontkit then shapes the reversed string -> joins break,
//            and line wrapping of a paragraph reordered as one line is wrong).
import { createRequire } from 'node:module';
import { createWriteStream, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const [, , fixturePath, outPath, mode = 'logical'] = process.argv;
const t0 = performance.now();
const PdfPrinter = require('pdfmake');
const bidi = require('bidi-js')();
const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const fx = JSON.parse(readFileSync(fixturePath, 'utf8'));
const file = fx.lang === 'he' ? 'NotoSansHebrew.ttf' : 'NotoNaskhArabic.ttf';
const f = join(fontsDir, file);
const printer = new PdfPrinter({ Report: { normal: f, bold: f, italics: f, bolditalics: f } });

const vis = (s) => (mode === 'visual' ? bidi.getReorderedString(s, bidi.getEmbeddingLevels(s, 'rtl')) : s);
const T = (s, o = {}) => ({ text: vis(s), alignment: 'right', ...o });
const content = [T(fx.title, { fontSize: 20, bold: true }), T(fx.subtitle, { margin: [0, 0, 0, 12] })];
for (const s of fx.sections) {
	content.push(T(s.heading, { fontSize: 14, bold: true, margin: [0, 10, 0, 4] }));
	s.paragraphs.forEach((p) => content.push(T(p, { margin: [0, 0, 0, 6] })));
	content.push(T(s.table.caption, { fontSize: 9, bold: true }));
	// No bidiVisual in pdfmake: reverse columns by hand to get first column on the right.
	const row = (r, hdr) => [...r].reverse().map((c) => ({ text: vis(c), alignment: hdr || r.indexOf(c) ? 'center' : 'right', bold: hdr, fillColor: hdr ? '#dce6f7' : undefined }));
	content.push({ table: { headerRows: 1, widths: ['auto', 'auto', 'auto', 'auto', '*'], body: [row(s.table.headers, true), ...s.table.rows.map((r) => row(r, false))] }, fontSize: 9, margin: [0, 4, 0, 4] });
	content.push(T(s.footnote, { fontSize: 8 }));
}
const doc = printer.createPdfKitDocument({
	pageSize: 'A4', defaultStyle: { font: 'Report', fontSize: 11 }, content,
	footer: (cur, total) => ({ text: `${cur} / ${total}`, alignment: 'center', fontSize: 8 }),
});
const ws = createWriteStream(outPath);
doc.pipe(ws);
doc.end();
await new Promise((r) => ws.on('finish', r));
console.info(JSON.stringify({ out: outPath, mode, ms: Math.round(performance.now() - t0), rssMB: Math.round(process.memoryUsage().rss / 1048576) }));
