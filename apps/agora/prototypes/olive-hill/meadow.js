/**
 * The meadow's patchwork: where the grass grows lush and where it has dried
 * to straw. Smooth value noise, computed once on the CPU while the hill is
 * built — the ground's colours, the blades' tint and the flowers all read
 * the same map, so a dry patch is dry in every layer. No shader cost.
 */

function hash(ix, iz) {
	let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);

	return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Value noise in [0, 1], continuous across cells. */
export function valueNoise(x, z) {
	const ix = Math.floor(x), iz = Math.floor(z);
	const fx = smooth(x - ix), fz = smooth(z - iz);
	const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);

	return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Three octaves of value noise, in [0, 1]. */
export function fbm(x, z) {
	return (valueNoise(x, z) * 4 + valueNoise(x * 2.03 + 17.1, z * 2.03 - 5.3) * 2 + valueNoise(x * 4.11 - 31.7, z * 4.11 + 11.9)) / 7;
}

/**
 * How lush the meadow is at a point: 1 deep green, 0 sun-dried. Patches some
 * twenty metres across, with a finer grain inside them.
 */
export function lushness(x, z) {
	const broad = fbm(x * .045 + 3.7, z * .045 - 8.2);
	const fine = valueNoise(x * .32, z * .32);
	const v = (broad - .5) * 2.4 + .5 + (fine - .5) * .3;

	return Math.min(1, Math.max(0, v));
}

/**
 * A small grey grain map for the ground, tiled across the hill: speckles of
 * light and shade a metre or two across, so the ground does not read as a
 * flat sheet up close. Average brightness ~1 relative to `scale` so tinting
 * stays where the vertex colours put it.
 */
export function groundGrainCanvas(size = 128) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	const image = ctx.createImageData(size, size);
	const cells = 8;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			// Tileable: the noise wraps on the cell grid.
			const u = x / size * cells, v = y / size * cells;
			const ix = Math.floor(u), iy = Math.floor(v);
			const fx = smooth(u - ix), fy = smooth(v - iy);
			const w = (i) => ((i % cells) + cells) % cells;
			const a = hash(w(ix), w(iy)), b = hash(w(ix + 1), w(iy)), c = hash(w(ix), w(iy + 1)), d = hash(w(ix + 1), w(iy + 1));
			const n = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
			const speck = hash(x * 7 + 1, y * 13 + 5);
			const value = 205 + (n - .5) * 60 + (speck - .5) * 34;
			const i = (y * size + x) * 4;
			image.data[i] = image.data[i + 1] = image.data[i + 2] = Math.max(0, Math.min(255, value));
			image.data[i + 3] = 255;
		}
	}
	ctx.putImageData(image, 0, 0);

	return canvas;
}

/** Mean of the grain map, to brighten the vertex colours back by. */
export const GRAIN_MEAN = 205 / 255;
