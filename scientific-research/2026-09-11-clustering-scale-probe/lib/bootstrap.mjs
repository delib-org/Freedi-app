// Query-block bootstrap, stratified by match status. Each resample draws query
// ids with replacement within each stratum and carries ALL of a query's cells
// (sizes, methods, orders) together. The bank is shared, so intervals describe
// query-sampling variation within this one discussion only.
import { mulberry32 } from './rng.mjs';
import { quantile } from './util.mjs';

/**
 * rows: scored rows; strata: {stratumName: [queryIds]}; stat(rows) → number|null.
 * Returns {estimate, lo, hi, resamples, undefinedDraws}.
 */
export function blockBootstrap(rows, strata, stat, { B = 2000, seed = 42, alpha = 0.05 } = {}) {
	const byQuery = new Map();
	for (const r of rows) {
		if (!byQuery.has(r.queryId)) byQuery.set(r.queryId, []);
		byQuery.get(r.queryId).push(r);
	}
	const rand = mulberry32(seed);
	const draws = [];
	let undefinedDraws = 0;
	for (let b = 0; b < B; b++) {
		const sample = [];
		for (const ids of Object.values(strata)) {
			for (let i = 0; i < ids.length; i++) {
				const q = ids[Math.floor(rand() * ids.length)];
				// Re-key the draw so a query drawn twice counts as two blocks.
				for (const r of byQuery.get(q) ?? []) sample.push({ ...r, queryId: `${q}#${i}` });
			}
		}
		const v = stat(sample);
		if (v == null || !Number.isFinite(v)) undefinedDraws++;
		else draws.push(v);
	}

	return {
		estimate: stat(rows),
		lo: quantile(draws, alpha / 2),
		hi: quantile(draws, 1 - alpha / 2),
		resamples: B,
		undefinedDraws,
	};
}
