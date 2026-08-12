/* Renders the whole icon set to a static page so it can be judged at the sizes
 * it actually ships at. The 3D sheet failed below ~40px and that only became
 * obvious on a size ladder — so every icon gets one here before it is wired.
 *
 * The rendered half (scripts/icon-slice.mjs) gets the bottom of the same page,
 * on the three grounds it has to survive: the white card, the lavender page,
 * and a purple surface. One page, because the two registers share slots and
 * the only question that matters is whether they read as one set.
 *
 * Run: npx tsx scripts/icon-proof.ts   →   mock/icon-svg-proof.html
 */
import { writeFileSync } from 'node:fs';
import { ICON_NAMES, ICON_SHAPES } from '../src/components/Icon';

const LADDER = [20, 24, 32, 44] as const;

/** Cell order of the sheet — see docs/icon-brief.md §2. */
const RENDERED = [
	'proposal',
	'proposal-peer',
	'helped',
	'thanks',
	'bridge',
	'square',
	'talk',
	'era',
	'spark',
] as const;
const HERO_LADDER = [40, 64, 88] as const;

function svg(name: string, size: number): string {
	const shapes = ICON_SHAPES[name as keyof typeof ICON_SHAPES]
		.map(([tag, attrs]) => {
			const a = Object.entries(attrs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(' ');

			return `<${tag} ${a} />`;
		})
		.join('');

	return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shapes}</svg>`;
}

const rows = ICON_NAMES.map(
	(n) => `<tr>
	<th>${n}</th>
	${LADDER.map((s) => `<td>${svg(n, s)}</td>`).join('')}
	<td class="peer">${svg(n, 24)}</td>
	<td class="on-purple">${svg(n, 24)}</td>
</tr>`,
).join('\n');

// The rendered icons are <img>, so they carry their own colour: the only
// variable worth showing is the ground they sit on.
const heroRows = RENDERED.map(
	(n) => `<tr>
	<th>${n}</th>
	${HERO_LADDER.map((s) => `<td><img src="../public/icons/${n}.webp" width="${s}" height="${s}" alt=""></td>`).join('')}
	<td class="lav"><img src="../public/icons/${n}.webp" width="64" height="64" alt=""></td>
	<td class="on-purple"><img src="../public/icons/${n}.webp" width="64" height="64" alt=""></td>
</tr>`,
).join('\n');

const html = `<!doctype html><meta charset="utf-8"><title>Agora icons — proof</title>
<style>
 body{margin:0;padding:28px;background:#fff;color:#2b2350;font:13px/1.4 system-ui}
 h1{font-size:15px;margin:0 0 4px}
 h2{font-size:14px;margin:34px 0 4px}
 p{color:#5f568a;margin:0 0 18px}
 table{border-collapse:collapse}
 th{font:600 11px/1 ui-monospace,monospace;text-align:end;padding:0 14px 0 0;color:#5f568a;font-weight:500}
 td{padding:7px 12px;text-align:center;vertical-align:middle}
 tr:nth-child(even){background:#faf8ff}
 thead td{font:600 10px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8a82ad}
 tbody{color:#7350e3}
 .peer{color:#6f6795}
 .lav{background:#f2eefd;border-radius:8px}
 .on-purple{background:#7350e3;color:#fff;border-radius:8px}
</style>
<h1>Agora icon set — ${ICON_NAMES.length} drawn, ${RENDERED.length} rendered</h1>
<p>Columns: the size ladder in px, then the same icon tinted as a classmate's (--peer), then on a purple surface.</p>
<table>
<thead><tr><th></th>${LADDER.map((s) => `<td>${s}</td>`).join('')}<td>peer</td><td>on purple</td></tr></thead>
<tbody>
${rows}
</tbody></table>

<h2>Rendered — sheet 1 (hero slots only, 40px floor)</h2>
<p>The same nine objects from the generated sheet, on the three grounds they ship against. Below 40px these are not used at all — <code>HeroIcon</code> falls back to the drawing above.</p>
<table>
<thead><tr><th></th>${HERO_LADDER.map((s) => `<td>${s}</td>`).join('')}<td>on page</td><td>on purple</td></tr></thead>
<tbody>
${heroRows}
</tbody></table>`;

writeFileSync('mock/icon-svg-proof.html', html);
console.info(
	`→ mock/icon-svg-proof.html (${ICON_NAMES.length} drawn, ${RENDERED.length} rendered)`,
);
