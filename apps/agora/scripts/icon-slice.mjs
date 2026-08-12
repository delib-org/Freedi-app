/* Cuts the generated 3x3 icon sheet into the nine shipping assets.
 *
 * The sheet is one image on purpose — nine icons rendered in a single pass
 * share one lighting rig, one material and one camera by construction, so the
 * family cannot drift. The cost is this script: slice, key out the ground,
 * crop each object to a common optical size, and encode.
 *
 * Keying is per cell rather than per sheet because ONE cell breaks the rule
 * every other cell follows. Cell 2 is a classmate's proposal, and by the
 * ownership grammar (tokens.scss) a classmate's object is WHITE — so the test
 * that finds background for the other eight ("bright and neutral, connected to
 * the border") walks straight through it and dissolves the book. That cell is
 * keyed on NEUTRALITY instead: the ground is pure grey within a couple of
 * levels, the frosted glass carries a faint violet cast, and that cast is the
 * only thing separating them. See KEYS below.
 *
 * Run: node scripts/icon-slice.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const IN = 'mock/icons-sheet.png';
const OUT_DIR = 'public/icons';
const SIZE = 256; // ships at 256; the hero slots top out at 96 CSS px
const PAD = 0.06; // share of the box left empty around the object

/** Reading order of the sheet, and the icon name each cell ships as. */
const CELLS = [
	{ name: 'proposal', key: 'bright' },
	{ name: 'proposal-peer', key: 'neutral' },
	{ name: 'helped', key: 'bright' },
	{ name: 'thanks', key: 'bright' },
	{ name: 'bridge', key: 'bright' },
	{ name: 'square', key: 'bright' },
	{ name: 'talk', key: 'bright' },
	{ name: 'era', key: 'bright' },
	{ name: 'spark', key: 'bright' },
];

/* Two ways to answer "is this pixel ground?".
 *
 * `bright` is permissive on purpose — it walks down into the soft contact
 * shadow, because a strict cut is what leaves a white halo: the shadow ring
 * sits between the object and the cleared area and survives as an opaque
 * fringe. Walking into it and ramping alpha across it dissolves the cut.
 *
 * `neutral` cannot be permissive — the object is as bright as the ground — so
 * it cuts on hue instead and accepts that some of the shadow survives. */
const KEYS = {
	bright: { full: 214, keep: 168, chroma: 26 },
	neutral: { full: 250, keep: 240, chroma: 3 },
};

const browser = await chromium.launch();
const page = await browser.newPage();
const dataUri = `data:image/png;base64,${readFileSync(IN).toString('base64')}`;

const cells = await page.evaluate(
	async ({ src, CELLS, KEYS, SIZE, PAD }) => {
		const img = new Image();
		img.src = src;
		await img.decode();

		const sheet = document.createElement('canvas');
		sheet.width = img.width;
		sheet.height = img.height;
		sheet.getContext('2d').drawImage(img, 0, 0);

		const CW = Math.floor(img.width / 3);
		const CH = Math.floor(img.height / 3);
		const out = [];

		for (let i = 0; i < CELLS.length; i++) {
			const { name, key } = CELLS[i];
			const { full, keep, chroma } = KEYS[key];

			const c = document.createElement('canvas');
			c.width = CW;
			c.height = CH;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(sheet, (i % 3) * CW, Math.floor(i / 3) * CH, CW, CH, 0, 0, CW, CH);

			const id = ctx.getImageData(0, 0, CW, CH);
			const d = id.data;
			const isGround = (p) => {
				const j = p * 4;
				const r = d[j], g = d[j + 1], b = d[j + 2];
				return Math.min(r, g, b) > keep && Math.max(r, g, b) - Math.min(r, g, b) < chroma;
			};

			// Flood inward from the cell border: only ground CONNECTED to the
			// edge is background, so white enclosed by an object stays put.
			const seen = new Uint8Array(CW * CH);
			const stack = [];
			for (let x = 0; x < CW; x++) stack.push(x, (CH - 1) * CW + x);
			for (let y = 0; y < CH; y++) stack.push(y * CW, y * CW + CW - 1);

			while (stack.length) {
				const p = stack.pop();
				if (seen[p] || !isGround(p)) continue;
				seen[p] = 1;
				const x = p % CW, y = (p / CW) | 0;
				if (x > 0) stack.push(p - 1);
				if (x < CW - 1) stack.push(p + 1);
				if (y > 0) stack.push(p - CW);
				if (y < CH - 1) stack.push(p + CW);
			}

			// Ramp alpha across the reached band rather than cutting it, and
			// un-multiply the white it was composited over — otherwise the
			// surviving edge reads as a grey glow once it sits on purple.
			for (let p = 0; p < CW * CH; p++) {
				if (!seen[p]) continue;
				const j = p * 4;
				const min = Math.min(d[j], d[j + 1], d[j + 2]);
				const a = min >= full ? 0 : Math.round(255 * (1 - (min - keep) / (full - keep)));
				d[j + 3] = Math.max(0, Math.min(255, a));
				if (a > 0 && a < 255) {
					const k = 255 / a;
					for (let ch = 0; ch < 3; ch++) {
						d[j + ch] = Math.max(0, Math.min(255, 255 - (255 - d[j + ch]) * k));
					}
				}
			}

			// Drop specks. A render leaves a few stray flecks per cell, and a
			// fleck near the frame costs twice: it shows, and it widens the
			// bounding box, which shrinks the actual object to fit the crop.
			// Anything under a thousandth of the cell is not an icon.
			// A blob is walked at the faintest visible alpha, so a speck is
			// erased together with the soft fringe around it; what makes it a
			// speck rather than a part of the icon is how much of it is SOLID.
			const SPECK = CW * CH * 0.001;
			const seenBlob = new Uint8Array(CW * CH);
			let minX = CW, minY = CH, maxX = -1, maxY = -1;
			for (let start = 0; start < CW * CH; start++) {
				if (seenBlob[start] || d[start * 4 + 3] <= 24) continue;
				const blob = [];
				const q = [start];
				seenBlob[start] = 1;
				let solid = 0;
				while (q.length) {
					const p = q.pop();
					blob.push(p);
					if (d[p * 4 + 3] > 160) solid++;
					const x = p % CW, y = (p / CW) | 0;
					const push = (n) => {
						if (!seenBlob[n] && d[n * 4 + 3] > 24) {
							seenBlob[n] = 1;
							q.push(n);
						}
					};
					if (x > 0) push(p - 1);
					if (x < CW - 1) push(p + 1);
					if (y > 0) push(p - CW);
					if (y < CH - 1) push(p + CW);
				}
				if (solid < SPECK) {
					for (const p of blob) d[p * 4 + 3] = 0;
					continue;
				}
				for (const p of blob) {
					if (d[p * 4 + 3] <= 160) continue;
					const x = p % CW, y = (p / CW) | 0;
					if (x < minX) minX = x;
					if (x > maxX) maxX = x;
					if (y < minY) minY = y;
					if (y > maxY) maxY = y;
				}
			}
			ctx.putImageData(id, 0, 0);

			// Crop to a square around the object so every icon lands at the
			// same optical size regardless of how the render framed it.
			const w = maxX - minX + 1;
			const h = maxY - minY + 1;
			const side = Math.max(w, h) / (1 - 2 * PAD);
			const sx = minX + w / 2 - side / 2;
			const sy = minY + h / 2 - side / 2;

			const o = document.createElement('canvas');
			o.width = SIZE;
			o.height = SIZE;
			const octx = o.getContext('2d');
			octx.imageSmoothingQuality = 'high';
			octx.drawImage(c, sx, sy, side, side, 0, 0, SIZE, SIZE);

			out.push({
				name,
				webp: o.toDataURL('image/webp', 0.92).split(',')[1],
				box: [w, h],
				cleared: Math.round((seen.reduce((n, v) => n + v, 0) / (CW * CH)) * 100),
			});
		}

		return out;
	},
	{ src: dataUri, CELLS, KEYS, SIZE, PAD },
);

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const cell of cells) {
	const buf = Buffer.from(cell.webp, 'base64');
	writeFileSync(`${OUT_DIR}/${cell.name}.webp`, buf);
	total += buf.length;
	console.info(
		`  ${cell.name.padEnd(14)} ${String(Math.round(buf.length / 102.4) / 10).padStart(5)} KB` +
			`   object ${cell.box.join('×')}   ${cell.cleared}% ground`,
	);
}
console.info(`→ ${OUT_DIR}/  ${cells.length} icons, ${Math.round(total / 1024)} KB total`);
await browser.close();
