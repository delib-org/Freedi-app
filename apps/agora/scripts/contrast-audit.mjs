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

/* ===========================================================================
 * THE ACCEPTED LEDGER
 *
 * On 2026-08-11 the palette was re-pointed at mock/delib-mock.css verbatim,
 * because the sim's brighter violet is the look the app is meant to have and
 * the shipped ramp — two near-navy stops in a row — read as dark chrome
 * rather than as a colour. The sim was never audited, and the mockup's own
 * hues do not clear AA under white text: --mine #8b6bf0 tops out at 3.85:1
 * and the count pink #f56aa8 at 2.8:1. Tal made that trade knowingly.
 *
 * A gate nobody can pass stops being a gate — everyone learns to read past
 * the red and the NEXT regression rides in behind these fourteen. So the
 * fourteen are written down instead of the floor being lowered: each is
 * pinned to the exact surface it sits on AND the exact ratio it measured, so
 * a run that gets WORSE breaks the build even though it is on the list, and
 * anything not on the list fails the way it always did.
 *
 * This is a ledger of debt, not a list of exemptions. Shrinking it is the
 * work; adding to it needs the same deliberate decision that opened it.
 * =========================================================================== */
const ACCEPTED = [
	// White copy on --mine #8b6bf0, the light stop of --grad-mine-text
	['p.thread__text', 'rgb(139, 107, 240)', 3.85],
	['span.thread__time', 'rgb(139, 107, 240)', 2.87],
	['p.action-hint', 'rgb(139, 107, 240)', 2.87],
	['span.proposal-dock__title', 'rgb(139, 107, 240)', 3.85],
	['span.proposal-dock__sub', 'rgb(139, 107, 240)', 2.98],
	['span.delib-nav__label', 'rgb(139, 107, 240)', 3.85],
	// White copy on the hero ramp's top stops (--mine-light #a98cf7 and the
	// sheen washing over it)
	['p.', 'rgb(181, 156, 248)', 2.31],
	['button.btn.btn--primary.btn--full', 'rgb(169, 140, 247)', 2.7],
	['span.rate-scale__label', 'rgb(169, 140, 247)', 2.7],
	// The count pink. It replaced --danger, which passed at 4.67:1 — red said
	// "something broke" about a classmate's reply, which is the friendliest
	// event in the game, so the hue was worth the ratio.
	['span.proposal-dock__badge', 'rgb(245, 106, 168)', 2.8],
	['span.delib-nav__badge', 'rgb(245, 106, 168)', 2.8],
	['span.stall__chip.stall__chip--unread', 'rgb(245, 106, 168)', 2.8],
	// The same pink count, on the workshop drawers' feedback badge — it joined
	// the gauntlet on 2026-09-03 when the drawers did; the candy look passes it
	['span.workbench__count', 'rgb(245, 106, 168)', 2.8],
];

/** A failure is accepted only on the same surface, and only if it has not got worse */
function accepted(failure) {
	return ACCEPTED.some(
		([selector, on, ratio]) =>
			failure.selector === selector && failure.on === on && failure.ratio >= ratio - 0.01,
	);
}

/** Split measured failures into the ones on the ledger and the ones that gate */
export function triage({ label, failures }) {
	return {
		label,
		known: failures.filter(accepted),
		failures: failures.filter((f) => !accepted(f)),
	};
}

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
				const text = value ?? '';
				// color-mix() resolves to `color(srgb r g b / a)`, and a look a
				// student built is written ENTIRELY in color-mix — so a parser
				// that only knows rgb() is blind to every surface in it and
				// reports white text on the page colour it never sat on.
				const srgb = /color\(srgb\s+([^)]+)\)/.exec(text);
				if (srgb) {
					const parts = srgb[1]
						.split(/[\s/]+/)
						.filter(Boolean)
						.map((n) => (n.endsWith('%') ? parseFloat(n) / 100 : parseFloat(n)));
					const [r, g, b] = parts;
					const a = parts.length > 3 ? parts[3] : 1;

					return Number.isFinite(r) ? { r: r * 255, g: g * 255, b: b * 255, a } : null;
				}

				const match = /rgba?\(([^)]+)\)/.exec(text);
				if (!match) return null;
				const parts = match[1].split(/[,/]/).map((n) => parseFloat(n));
				const [r, g, b] = parts;
				const a = parts.length > 3 ? parts[3] : 1;

				return Number.isFinite(r) ? { r, g, b, a } : null;
			};

			/** Every rgb() stop inside a gradient, so a ramp is judged at its worst point */
			const gradientStops = (image) => {
				if (!image || image === 'none' || !image.includes('gradient')) return [];

				return [...image.matchAll(/(?:rgba?|color)\([^)]+\)/g)]
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

/** Print a report; returns true if nothing NEW is unreadable */
export function report(result) {
	const { label, failures, known } = triage(result);

	const line = (f) =>
		console.log(
			`      ${f.ratio}:1 (needs ${f.needs}) ${f.selector}\n` +
				`        "${f.text}"  ${f.color} on ${f.on}`,
		);

	if (known.length > 0) {
		console.log(`  · ${label} — ${known.length} known run(s) on the accepted ledger`);
		for (const f of known) line(f);
	}

	if (failures.length === 0) {
		console.log(`  ✓ ${label}`);

		return true;
	}
	console.log(`  ✗ ${label} — ${failures.length} NEW unreadable run(s)`);
	for (const f of failures) line(f);

	return false;
}


/** A readable error when the dev server is not up, instead of a Playwright stack. */
async function assertReachable(url) {
	try {
		await fetch(url, { method: 'HEAD' });
	} catch {
		console.error(
			`\n\u2717 Cannot reach ${url}\n` +
				'   \u2192 fix: start the dev server first (npm run dev, port 3009)\n',
		);
		process.exit(1);
	}
}

// --- standalone ---
if (import.meta.url === `file://${process.argv[1]}`) {
	const url = process.argv[2] ?? 'http://localhost:3009/mock/surfaces.html';
	// Without this the failure mode is a raw Playwright navigation error, which
	// says nothing about the actual problem: the dev server is not running.
	// `check-all` calls this, so that error was the first thing a newcomer met.
	await assertReachable(url);
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
	await page.goto(url, { waitUntil: 'load' });
	await page.waitForTimeout(900);
	console.log(`\nContrast audit — ${url}`);
	const ok = report(await auditPage(page, { label: url }));
	await browser.close();
	process.exit(ok ? 0 : 1);
}
