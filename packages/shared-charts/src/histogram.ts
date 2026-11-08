export interface Bin {
	start: number;
	end: number;
	count: number;
}

export interface Binned {
	bins: Bin[];
	min: number;
	max: number;
}

/**
 * Equal-width bins over `[min, max]`. The last bin is closed on the right so
 * the maximum lands inside it; identical values get a single unit-wide bin.
 */
export function binValues(values: number[], binCount = 6): Binned {
	const clean = values.filter((v) => Number.isFinite(v));
	if (clean.length === 0 || binCount <= 0) return { bins: [], min: 0, max: 0 };
	const min = Math.min(...clean);
	let max = Math.max(...clean);
	if (max === min) max = min + 1;
	const width = (max - min) / binCount;
	const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
		start: min + i * width,
		end: i === binCount - 1 ? max : min + (i + 1) * width,
		count: 0,
	}));
	for (const v of clean) {
		const i = Math.min(binCount - 1, Math.floor((v - min) / width));
		bins[i].count += 1;
	}

	return { bins, min, max };
}

export function median(values: number[]): number | null {
	const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
	if (sorted.length === 0) return null;
	const mid = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
