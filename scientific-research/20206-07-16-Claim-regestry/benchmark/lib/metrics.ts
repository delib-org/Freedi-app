/** Wilson CIs, exact McNemar, and small formatting helpers for RESULTS.md. */

export interface Rate {
	k: number;
	n: number;
	rate: number;
	lo: number;
	hi: number;
}

/** Wilson score 95% interval. */
export function wilson(k: number, n: number): Rate {
	if (n === 0) return { k, n, rate: NaN, lo: NaN, hi: NaN };
	const z = 1.959963985;
	const p = k / n;
	const z2 = z * z;
	const denom = 1 + z2 / n;
	const center = (p + z2 / (2 * n)) / denom;
	const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;

	return { k, n, rate: p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export function fmtRate(r: Rate): string {
	if (r.n === 0) return '—';

	return `${(r.rate * 100).toFixed(1)}% [${(r.lo * 100).toFixed(1)}, ${(r.hi * 100).toFixed(1)}] (${r.k}/${r.n})`;
}

/**
 * Exact McNemar test (two-sided binomial on the discordant pairs).
 * b = A correct & B wrong, c = A wrong & B correct.
 */
export function mcnemarExact(b: number, c: number): { b: number; c: number; p: number } {
	const nDisc = b + c;
	if (nDisc === 0) return { b, c, p: 1 };
	const k = Math.min(b, c);
	// two-sided exact binomial, p = 0.5
	let logC = 0; // log C(n,0)
	let pSum = 0;
	const logHalfN = nDisc * Math.log(0.5);
	for (let i = 0; i <= nDisc; i++) {
		if (i <= k || i >= nDisc - k) pSum += Math.exp(logC + logHalfN);
		logC += Math.log(nDisc - i) - Math.log(i + 1);
	}

	return { b, c, p: Math.min(1, pSum) };
}

export function fmtPct(x: number): string {
	return `${(x * 100).toFixed(1)}%`;
}
