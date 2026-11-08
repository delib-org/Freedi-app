// JSON report -> RTL HTML for the Chromium PDF path.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const fontsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fonts');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Hebrew -> Noto Sans Hebrew. Arabic and Persian -> Noto Naskh Arabic (covers Persian letters).
const FACES = {
	he: [['Report', 'NotoSansHebrew.ttf'], ['Latin', 'NotoSans.ttf']],
	ar: [['Report', 'NotoNaskhArabic.ttf'], ['Latin', 'NotoSans.ttf']],
	fa: [['Report', 'NotoNaskhArabic.ttf'], ['Latin', 'NotoSans.ttf']],
};

export function buildHtml(fx, { embed = true } = {}) {
	const faces = FACES[fx.lang]
		.map(([fam, file]) => {
			const src = embed
				? `url(data:font/ttf;base64,${readFileSync(join(fontsDir, file)).toString('base64')})`
				: `url(file://${join(fontsDir, file)})`;
			return `@font-face{font-family:'${fam}';src:${src};font-weight:100 900;}`;
		})
		.join('\n');
	const body = fx.sections
		.map((s, i) => `
<section>
<h2>${esc(s.heading)}</h2>
${s.paragraphs.map((p, k) => `<p>${esc(p)}${k === 0 ? `<sup class="fnref">${i + 1}</sup>` : ''}</p>`).join('\n')}
<table>
<caption>${esc(s.table.caption)}</caption>
<thead><tr>${s.table.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${s.table.rows.map((r) => `<tr>${r.map((c, ci) => `<${ci ? 'td class="n"' : 'td'}>${esc(c)}</td>`).join('')}</tr>`).join('\n')}</tbody>
</table>
<p class="fn"><sup>${i + 1}</sup> ${esc(s.footnote)}</p>
</section>`)
		.join('\n');
	return `<!doctype html>
<html lang="${fx.lang}" dir="${fx.dir}"><head><meta charset="utf-8"><title>${esc(fx.title)}</title>
<style>
${faces}
@page { size: A4; margin: 20mm 18mm 22mm;
  @bottom-center { content: "${fx.page} " counter(page) " ${fx.of} " counter(pages); font: 9pt 'Report','Latin',sans-serif; color:#555; } }
html { font-family: 'Report','Latin',sans-serif; font-size: 11pt; line-height: 1.6; color:#111; }
h1 { font-size: 22pt; margin: 0 0 4pt; }
.sub { color:#555; margin:0 0 18pt; }
h2 { font-size: 15pt; margin: 18pt 0 6pt; break-after: avoid; }
table { width:100%; border-collapse: collapse; margin: 8pt 0 4pt; font-size: 10pt; }
caption { font-weight:700; text-align:start; margin-bottom:4pt; break-after: avoid; }
th, td { border:1px solid #666; padding:3pt 6pt; text-align:start; }
th { background:#dce6f7; text-align:center; }
td.n { text-align:center; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
.fn { font-size: 9pt; color:#444; }
.fnref { font-size: 8pt; }
</style></head><body>
<h1>${esc(fx.title)}</h1><p class="sub">${esc(fx.subtitle)}</p>
${body}
</body></html>`;
}
