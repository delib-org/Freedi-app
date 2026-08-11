/* Knocks the opaque white ground out of a generated icon sheet.
 *
 * A global "white -> transparent" threshold cannot be used here: cell 2 of
 * sheet 1 IS a white book (a classmate's proposal), and a threshold would eat
 * its body along with the background. So this flood-fills inward from the
 * canvas border instead — only white that is CONNECTED to the edge is
 * background, and an enclosed white stays put.
 *
 * Run: node scripts/sheet-alpha.mjs mock/icons-sheet.png mock/icons-sheet-alpha.png
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , IN = 'mock/icons-sheet.png', OUT = 'mock/icons-sheet-alpha.png'] = process.argv;
const dataUri = `data:image/png;base64,${readFileSync(IN).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const out = await page.evaluate(async (src) => {
	const img = new Image();
	img.src = src;
	await img.decode();

	const c = document.createElement('canvas');
	c.width = img.width;
	c.height = img.height;
	const ctx = c.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(img, 0, 0);

	const { width: W, height: H } = c;
	const id = ctx.getImageData(0, 0, W, H);
	const d = id.data;

	// "Background" = bright and near-neutral. The soft contact shadows under
	// each icon are grey, so the neutrality test alone would keep them; the
	// brightness floor is what lets them dissolve.
	// The fill is deliberately PERMISSIVE (it walks down into the soft grey
	// contact shadow), because a strict cut is what leaves a white halo: the
	// shadow ring sits between the object and the cleared area and survives as
	// an opaque fringe. Walking into it and then ramping alpha across it makes
	// the cut dissolve instead of outline.
	const FULL = 214; // at/above this a ground pixel is fully transparent
	const KEEP = 168; // at/below this it is object, and the fill stops
	const isGround = (i) => {
		const r = d[i], g = d[i + 1], b = d[i + 2];
		const max = Math.max(r, g, b), min = Math.min(r, g, b);
		return min > KEEP && max - min < 26;
	};

	const seen = new Uint8Array(W * H);
	const stack = [];
	for (let x = 0; x < W; x++) {
		stack.push(x, (H - 1) * W + x);
	}
	for (let y = 0; y < H; y++) {
		stack.push(y * W, y * W + W - 1);
	}

	while (stack.length) {
		const p = stack.pop();
		if (seen[p]) continue;
		if (!isGround(p * 4)) continue;
		seen[p] = 1;
		const x = p % W, y = (p / W) | 0;
		if (x > 0) stack.push(p - 1);
		if (x < W - 1) stack.push(p + 1);
		if (y > 0) stack.push(p - W);
		if (y < H - 1) stack.push(p + W);
	}

	// Ramp alpha across the reached band instead of cutting it: pure white goes
	// fully transparent, the shadow's darker inner edge stays partly opaque, so
	// the object keeps a soft seat rather than gaining a hard rim.
	let cleared = 0;
	for (let p = 0; p < W * H; p++) {
		if (!seen[p]) continue;
		const i = p * 4;
		const min = Math.min(d[i], d[i + 1], d[i + 2]);
		const a = min >= FULL ? 0 : Math.round(255 * (1 - (min - KEEP) / (FULL - KEEP)));
		d[i + 3] = a;
		if (a === 0) cleared++;
		// Un-multiply the white the shadow was composited over, or the
		// surviving band reads as a grey glow once it sits on purple.
		if (a > 0 && a < 255) {
			const k = 255 / a;
			for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, 255 - (255 - d[i + c]) * k));
		}
	}

	ctx.putImageData(id, 0, 0);

	return {
		png: c.toDataURL('image/png').split(',')[1],
		pct: Math.round((cleared / (W * H)) * 100),
		size: [W, H],
	};
}, dataUri);

writeFileSync(OUT, Buffer.from(out.png, 'base64'));
console.info(`→ ${OUT}  ${out.size.join('×')}  ${out.pct}% cleared to alpha`);
await browser.close();
