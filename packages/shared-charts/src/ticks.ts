/**
 * "Nice" axis ticks: a step of 1, 2, 2.5, 5 or 10 × 10^n that covers
 * `[min, max]` in about `count` intervals. The last tick is always ≥ max so
 * the largest value never touches the top of the plot.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
	const lo = Math.min(min, max);
	let hi = Math.max(min, max);
	if (hi === lo) hi = lo + 1;
	const step = niceStep((hi - lo) / Math.max(1, count));
	const first = Math.floor(lo / step) * step;
	const ticks: number[] = [];
	for (let v = first; v < hi + step / 2; v += step) {
		ticks.push(round(v));
	}
	const last = ticks[ticks.length - 1];
	if (last < hi) ticks.push(round(last + step));

	return ticks;
}

export function niceStep(raw: number): number {
	if (raw <= 0) return 1;
	const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
	const residual = raw / magnitude;
	let factor: number;
	if (residual <= 1) factor = 1;
	else if (residual <= 2) factor = 2;
	else if (residual <= 2.5) factor = 2.5;
	else if (residual <= 5) factor = 5;
	else factor = 10;

	return round(factor * magnitude);
}

/**
 * Indices of the x labels to keep so at most `max` are drawn. The first and
 * the last key are always kept; the rest are sampled at an even stride.
 */
export function thinLabels(keys: string[], max: number): number[] {
	const n = keys.length;
	if (n === 0 || max <= 0) return [];
	if (max === 1) return [0];
	if (n <= max) return keys.map((_, i) => i);
	const stride = Math.ceil((n - 1) / (max - 1));
	const kept: number[] = [];
	for (let i = 0; i < n - 1; i += stride) kept.push(i);
	// The last key always shows; drop its neighbour if it would crowd it.
	const prev = kept[kept.length - 1];
	if (n - 1 - prev < stride / 2 && kept.length > 1) kept.pop();
	kept.push(n - 1);

	return kept;
}

function round(v: number): number {
	return Math.round(v * 1e6) / 1e6;
}
