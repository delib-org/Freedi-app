/* Swaps the emoji in the design sim for the real icon set, so the set can be
 * judged in situ rather than on a proof sheet. The mock is static HTML and the
 * app is Mithril, so the icons are inlined as markup here; the app itself uses
 * the Icon component directly.
 *
 * Idempotent — re-run it after editing Icon.ts.
 * Run: npx tsx scripts/icon-swap-mock.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { ICON_SHAPES, type IconName } from '../src/components/Icon';

const MOCK = 'mock/delib-mock.html';

function svg(name: IconName): string {
	const shapes = ICON_SHAPES[name]
		.map(([tag, attrs]) => {
			const a = Object.entries(attrs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(' ');

			return `<${tag} ${a} />`;
		})
		.join('');

	return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}

/* Every emoji still hardcoded in the sim, and what replaces it. The sized
 * boxes already carry a font-size, so the icons inherit their optical size
 * from it (see .ic in delib-mock.css) and nothing needs measuring twice. */
const SWAPS: ReadonlyArray<readonly [emoji: string, icon: IconName]> = [
	['🏛️', 'square'],
	['🤝', 'helped'],
	['📘', 'proposal'],
	['🌱', 'new'],
	['✏️', 'edit'],
	['✍️', 'improve'],
	['💡', 'idea'],
	['📊', 'chart'],
	['👥', 'people'],
	['✓', 'check'],
	['😠', 'face-strong-against'],
	['🙁', 'face-against'],
	['😐', 'face-neutral'],
	['🙂', 'face-for'],
	['😍', 'face-strong-for'],
];

let html = readFileSync(MOCK, 'utf8');
let n = 0;
for (const [emoji, icon] of SWAPS) {
	const before = html;
	html = html.split(emoji).join(svg(icon));
	if (before !== html) n++;
}

writeFileSync(MOCK, html);
console.info(`→ ${MOCK}: ${n}/${SWAPS.length} glyphs swapped for icons`);
