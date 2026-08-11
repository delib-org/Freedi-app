/* Contrast audit — the enforcement half of the on-dark contract.
 *
 * The bug this exists to catch: a component re-derives itself from tokens
 * (--text-muted for a label, --border-subtle for a hairline), those tokens
 * are defined against white, and the component is then rendered on a
 * saturated surface. Dark ink on a dark fill. It cannot be caught by
 * reviewing the component, because the component is correct — the surface
 * is what changed. It CAN be caught by measuring what actually rendered.
 *
 * Usage:
 *   node scripts/contrast-audit.mjs                    # the surface gauntlet
 *   node scripts/contrast-audit.mjs <url>              # any page
 *   import { auditPage } from './contrast-audit.mjs'   # inside another run
 *
 * Exit code 1 if anything fails, so it can gate a commit.
 */
import { chromium } from '@playwright/test';

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

/**
 * Measure every visible text run on the page and report the ones whose ink
 * does not survive its own background.
 *
 * Runs entirely in the page: the effective background of a text run is a
 * question only the browser can answer, because it depends on what every
 * ancestor painted and on gradient stops that only exist post-resolution.
 */
export async function auditPage(page, { label = 'page', min = AA_NORMAL } = {}) {
	return page.evaluate(
		({ AA_NORMAL, AA_LARGE, min }) => {
			const parseColor = (value) => {
				const match = /rgba?\(([^)]+)\)/.exec(value ?? '');
				if (!match) return null;
				const parts = match[1].split(/[,/]/).map((n) => parseFloat(n));
				const [r, g, b] = parts;
				const a = parts.length > 3 ? parts[3] : 1;

				return Number.isFinite(r) ? { r, g, b, a } : null;
			};

			/** Every rgb() stop inside a gradient, so a ramp is judged at its worst point */
			const gradientStops = (image) => {
				if (!image || image === 'none' || !image.includes('gradient')) return [];

				return [...image.matchAll(/rgba?\([^)]+\)/g)]
					.map((m) => parseColor(m[0]))
					.filter((c) => c && c.a > 0.15);
			};

			const over = (top, bottom) => ({
				r: top.r * top.a + bottom.r * (1 - top.a),
				g: top.g * top.a + bottom.g * (1 - top.a),
				b: top.b * top.a + bottom.b * (1 - top.a),
				a: 1,
			});

			const luminance = ({ r, g, b }) => {
				const chan = (v) => {
					const s = v / 255;

					return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
				};

				return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
			};

			const contrast = (a, b) => {
				const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);

				return (hi + 0.05) / (lo + 0.05);
			};

			/**
			 * Every colour this text could actually be sitting on: solid fills
			 * composited down the ancestor chain, plus each gradient stop met on
			 * the way. The worst of them is the honest answer.
			 */
			const backgroundsBehind = (el) => {
				// Two different things are collected on the way up, and conflating
				// them is what made a 22%-purple wash over white paper report as
				// solid purple:
				//   bases — opaque layers. The first one found ends the walk.
				//   veils — translucent layers ABOVE that base. Each is an
				//           alternative overlay, not a stack, so every one is
				//           composited onto every base at the end.
				const veils = [];
				let node = el;

				const resolve = (bases) => {
					const out = [];
					for (const base of bases) {
						out.push(base);
						for (const veil of veils) out.push(over(veil, base));
					}

					return out;
				};

				while (node && node !== document.documentElement.parentElement) {
					const style = getComputedStyle(node);
					const stops = gradientStops(style.backgroundImage);
					const opaque = stops.filter((c) => c.a >= 0.999);
					const sheer = stops.filter((c) => c.a < 0.999);
					if (opaque.length > 0) return resolve(opaque);
					veils.push(...sheer);

					const fill = parseColor(style.backgroundColor);
					if (fill && fill.a > 0) {
						if (fill.a >= 0.999) return resolve([fill]);
						veils.push(fill);
					}
					node = node.parentElement;
				}

				// Nothing opaque all the way up: the page itself is the base
				return resolve([{ r: 255, g: 255, b: 255, a: 1 }]);
			};

			const describe = (el) => {
				const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/) : [];

				return `${el.tagName.toLowerCase()}${cls.length ? '.' + cls.slice(0, 3).join('.') : ''}`;
			};

			const failures = [];
			for (const el of document.querySelectorAll('body *')) {
				// Only elements that paint their OWN text — a wrapper inherits its
				// colour and would report the same run twice
				const own = [...el.childNodes]
					.filter((n) => n.nodeType === 3 && n.textContent.trim())
					.map((n) => n.textContent.trim())
					.join(' ');
				if (!own) continue;
				// Emoji and pictographs paint their own colours — the computed
				// `color` says nothing about whether they can be seen
				if (!/[\p{L}\p{N}]/u.test(own.replace(/[\p{Extended_Pictographic}]/gu, ''))) continue;

				const style = getComputedStyle(el);
				if (style.visibility === 'hidden' || style.display === 'none') continue;
				if (parseFloat(style.opacity) < 0.15) continue;
				// Screen-reader-only text is clipped to 1px and never seen
				const box = el.getBoundingClientRect();
				if (box.width < 4 || box.height < 4) continue;

				const ink = parseColor(style.color);
				if (!ink || ink.a < 0.1) continue;

				const size = parseFloat(style.fontSize);
				const weight = parseInt(style.fontWeight, 10) || 400;
				const large = size >= 24 || (size >= 18.66 && weight >= 700);
				const threshold = large ? AA_LARGE : min;

				let worst = Infinity;
				let worstBg = null;
				for (const bg of backgroundsBehind(el)) {
					// A translucent ink is effectively blended with its own backdrop
					const effective = ink.a < 0.999 ? over(ink, bg) : ink;
					const ratio = contrast(effective, bg);
					if (ratio < worst) {
						worst = ratio;
						worstBg = bg;
					}
				}

				if (worst < threshold) {
					failures.push({
						selector: describe(el),
						text: own.slice(0, 48),
						ratio: Math.round(worst * 100) / 100,
						needs: threshold,
						color: style.color,
						on: worstBg
							? `rgb(${Math.round(worstBg.r)}, ${Math.round(worstBg.g)}, ${Math.round(worstBg.b)})`
							: '?',
					});
				}
			}

			return failures;
		},
		{ AA_NORMAL, AA_LARGE, min },
	).then((failures) => ({ label, failures }));
}

/** Print a report; returns true if everything passed */
export function report({ label, failures }) {
	if (failures.length === 0) {
		console.log(`  ✓ ${label}`);

		return true;
	}
	console.log(`  ✗ ${label} — ${failures.length} unreadable run(s)`);
	for (const f of failures) {
		console.log(
			`      ${f.ratio}:1 (needs ${f.needs}) ${f.selector}\n` +
				`        "${f.text}"  ${f.color} on ${f.on}`,
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
	console.log(`\nContrast audit — ${url}`);
	const ok = report(await auditPage(page, { label: url }));
	await browser.close();
	process.exit(ok ? 0 : 1);
}
