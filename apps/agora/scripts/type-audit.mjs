/* Type audit — the mobile-legibility half of what contrast-audit does for ink.
 *
 * Contrast asks "can this text be seen against what is behind it". This asks
 * the other question a phone makes urgent: "is it big enough to read at all".
 * The two fail independently — a 10px label at 12:1 passes every contrast
 * check ever written and is still unreadable held at arm's length by a
 * fourteen-year-old on a bus.
 *
 * THE FLOORS. They are the bottom two rungs of the scale in tokens.scss, and
 * they have to be — a floor softer than the scale enforces nothing, and a
 * floor harder than it fails the app's own tokens. Move one, move both.
 *
 *   BODY 16px    Anything a student actually reads — a sentence, a name, a
 *                label, a button. This is deliberately above the usual
 *                advice (Material bottoms out at 14sp, Apple's HIG at 11pt):
 *                those scales are written for apps read at a desk, and this
 *                is a game played on a phone at arm's length in a lit
 *                classroom. 14px passed every published guideline and was
 *                still too small on the class map.
 *
 *   META 13px    A hard floor for genuinely secondary marks: a timestamp, a
 *                count on a chip, a numeric axis tick. These are glanced at,
 *                not read, and they are allowed to be small.
 *
 *   FIELD 16px   Any input/textarea/select. This one is not a taste
 *                judgement: Mobile Safari ZOOMS THE VIEWPORT when a field
 *                under 16px takes focus, and never zooms back out. A 15px
 *                textarea doesn't look slightly small, it breaks the layout
 *                of the whole screen the moment a student types in it.
 *
 * A rule opts a run into the META floor with `@include type-meta`, which
 * stamps --type-meta on the element (see the meta rung in tokens.scss). This
 * audit reads that stamp off the rendered node, so "this is deliberately
 * tiny" is a decision recorded in the stylesheet rather than a judgement this
 * script had to make from a class name — `.board__coverage` and
 * `.board__camp-n` look identical from here and only one is a sentence.
 *
 * Usage:
 *   node scripts/type-audit.mjs [url]                # one page
 *   import { auditType, reportType } from './type-audit.mjs'
 *
 * Exit code 1 if anything fails, so it can gate a commit.
 */
import { chromium } from '@playwright/test';

export const BODY_FLOOR = 16;
export const META_FLOOR = 13;
export const FIELD_FLOOR = 16;

/**
 * Measure every visible text run on the page and report the ones rendering
 * below the floor that applies to them.
 *
 * Runs entirely in the page, for the same reason the contrast audit does:
 * the rendered size of a run is a question only the browser can answer once
 * rem, clamp(), inheritance and media queries have all resolved.
 */
export async function auditType(page, { label = 'page' } = {}) {
	return page
		.evaluate(
			({ BODY_FLOOR, META_FLOOR, FIELD_FLOOR }) => {
				const describe = (el) => {
					const cls =
						typeof el.className === 'string' ? el.className.trim().split(/\s+/) : [];

					return `${el.tagName.toLowerCase()}${cls.length ? '.' + cls.slice(0, 3).join('.') : ''}`;
				};

				/** Deliberately-small marks: a timestamp, a count, an axis tick.
				 *  Stamped by @mixin type-meta, never guessed from the class name. */
				const isMeta = (style) => style.getPropertyValue('--type-meta').trim() === '1';

				const seen = new Set();
				const failures = [];
				const push = (el, size, floor, kind, text) => {
					const key = `${describe(el)}|${size}|${kind}`;
					if (seen.has(key)) return;
					seen.add(key);
					failures.push({
						selector: describe(el),
						text: (text ?? '').slice(0, 48),
						size: Math.round(size * 100) / 100,
						needs: floor,
						kind,
					});
				};

				const invisible = (el, style) => {
					if (style.visibility === 'hidden' || style.display === 'none') return true;
					if (parseFloat(style.opacity) < 0.15) return true;
					// Screen-reader-only text is clipped to 1px and never seen
					const box = el.getBoundingClientRect();

					return box.width < 4 || box.height < 4;
				};

				// --- Form controls: the iOS zoom trap, checked whether or not the
				// field currently has any text in it ---
				for (const el of document.querySelectorAll('input, textarea, select')) {
					const style = getComputedStyle(el);
					if (invisible(el, style)) continue;
					// A slider/checkbox/radio paints no glyphs
					if (/^(range|checkbox|radio|color|hidden|file|button|submit)$/.test(el.type ?? ''))
						continue;
					const size = parseFloat(style.fontSize);
					if (size < FIELD_FLOOR) {
						push(el, size, FIELD_FLOOR, 'field', el.placeholder || el.value || '(field)');
					}
				}

				// --- Rendered text runs ---
				for (const el of document.querySelectorAll('body *')) {
					// Only elements that paint their OWN text — a wrapper inherits its
					// size and would report the same run twice
					const own = [...el.childNodes]
						.filter((n) => n.nodeType === 3 && n.textContent.trim())
						.map((n) => n.textContent.trim())
						.join(' ');
					if (!own) continue;
					// A run of pure emoji/pictographs is an ICON sized by font-size —
					// it is a picture, not copy, and legibility floors don't apply
					if (!/[\p{L}\p{N}]/u.test(own.replace(/[\p{Extended_Pictographic}]/gu, '')))
						continue;

					const style = getComputedStyle(el);
					if (invisible(el, style)) continue;

					const size = parseFloat(style.fontSize);
					const meta = isMeta(style);
					const floor = meta ? META_FLOOR : BODY_FLOOR;
					if (size < floor) push(el, size, floor, meta ? 'meta' : 'body', own);
				}

				return failures;
			},
			{ BODY_FLOOR, META_FLOOR, FIELD_FLOOR },
		)
		.then((failures) => ({ label, failures }));
}

/** Print a report; returns true if everything passed */
export function reportType({ label, failures }) {
	if (failures.length === 0) {
		console.log(`  ✓ ${label}`);

		return true;
	}
	console.log(`  ✗ ${label} — ${failures.length} run(s) below the floor`);
	for (const f of failures) {
		console.log(
			`      ${f.size}px (needs ${f.needs}, ${f.kind}) ${f.selector}\n        "${f.text}"`,
		);
	}

	return false;
}

/** Merge many page audits into one deduped table, worst first */
export function summarise(audits) {
	const byKey = new Map();
	for (const { label, failures } of audits) {
		for (const f of failures) {
			const key = `${f.selector}|${f.size}|${f.kind}`;
			const hit = byKey.get(key) ?? { ...f, screens: new Set(), sample: f.text };
			hit.screens.add(label);
			byKey.set(key, hit);
		}
	}
	const rows = [...byKey.values()].sort((a, b) => a.size - b.size);
	if (rows.length === 0) {
		console.log('\n  ✓ every text run clears its floor');

		return true;
	}
	console.log(`\n  ${rows.length} distinct run(s) below the floor, smallest first:\n`);
	for (const r of rows) {
		console.log(
			`   ${String(r.size).padStart(6)}px  needs ${r.needs}  [${r.kind}]  ${r.selector}` +
				`\n            "${r.sample}"  — ${[...r.screens].join(', ')}`,
		);
	}

	return false;
}

// --- standalone ---
if (import.meta.url === `file://${process.argv[1]}`) {
	const url = process.argv[2] ?? 'http://localhost:3009/mock/surfaces.html';
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForTimeout(900);
	console.log(`\nType audit — ${url} @390px`);
	const ok = reportType(await auditType(page, { label: url }));
	await browser.close();
	process.exit(ok ? 0 : 1);
}
