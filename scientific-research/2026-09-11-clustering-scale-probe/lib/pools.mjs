// Nested pools, presentation orders and the request manifest. Pure given its
// inputs (bank, labels, vectors); no network.
//
// Rebuild-proof design: per query the CORE (all approved matches + up to K hard
// distractors) is present at every size; items tagged ambiguous are excluded
// from every pool; fill is drawn only from the rest of the bank. So a later
// human re-label can only move core items between "match" and "distractor",
// and core items appear at every size — the set of allowable matches stays
// fixed across 100 ⊂ 200 ⊂ 500 without rebuilding.
import { cellSeed, seededShuffle } from './rng.mjs';
import { rankByCosine } from './retrieval.mjs';
import { quantile } from './util.mjs';

/** Length-stratified permutation: quartile bins, each shuffled, interleaved by deficit. */
export function stratifiedFill(items, seed) {
	const cuts = [0.25, 0.5, 0.75].map((q) => quantile(items.map((x) => x.chars), q));
	const binOf = (c) => (c <= cuts[0] ? 0 : c <= cuts[1] ? 1 : c <= cuts[2] ? 2 : 3);
	const bins = [[], [], [], []];
	for (const it of [...items].sort((a, b) => (a.id < b.id ? -1 : 1))) bins[binOf(it.chars)].push(it);
	const shuffled = bins.map((b, i) => seededShuffle(b, cellSeed(seed, 'bin', i)));
	const share = shuffled.map((b) => b.length / items.length);
	const taken = [0, 0, 0, 0];
	const out = [];
	for (let k = 0; k < items.length; k++) {
		let best = -1;
		let bestDeficit = -Infinity;
		for (let b = 0; b < 4; b++) {
			if (taken[b] >= shuffled[b].length) continue;
			const deficit = share[b] * (k + 1) - taken[b];
			if (deficit > bestDeficit) {
				bestDeficit = deficit;
				best = b;
			}
		}
		out.push(shuffled[best][taken[best]++]);
	}

	return out;
}

function placeAnchor(ids, anchorId, fraction, seed) {
	const rest = seededShuffle(
		ids.filter((id) => id !== anchorId).sort(),
		seed,
	);
	const pos = Math.round(fraction * (ids.length - 1));
	rest.splice(pos, 0, anchorId);

	return { order: rest, anchorPosition: pos };
}

/**
 * bankAll: [{id,text,chars}], labels: provisional or human rows (selected queries),
 * vectors: Map(id → Float32Array) for the retrieval model (3-small).
 */
export function buildPools({ bankAll, labels, vectors, study }) {
	const queryIds = new Set(labels.map((l) => l.queryId));
	const bank = bankAll.filter((x) => !queryIds.has(x.id));
	const bankIds = new Set(bank.map((x) => x.id));
	const byId = new Map(bankAll.map((x) => [x.id, x]));
	const K = study.pool.maxHardDistractors;
	const maxSize = Math.max(...study.sizes);
	const pools = [];
	for (const l of labels) {
		const qVec = vectors.get(l.queryId);
		const cosTo = (id) => rankByCosine(qVec, [id], vectors)[0].score;
		for (const id of [...l.matches, ...l.hardDistractors.map((h) => h.id), ...l.ambiguous]) {
			if (!bankIds.has(id)) throw new Error(`${l.queryId}: labelled item ${id} is not in the bank (is it another query?)`);
		}
		// Borderline items (a lenient annotator might call them "same") go into the
		// core first, so a human flip of one never lands outside the fixed core.
		const borderline = l.hardDistractors.filter((h) => h.borderline);
		if (borderline.length > K) throw new Error(`${l.queryId}: ${borderline.length} borderline items exceed the core size ${K}`);
		const hardSorted = [...l.hardDistractors].sort(
			(a, b) => Number(Boolean(b.borderline)) - Number(Boolean(a.borderline)) || cosTo(b.id) - cosTo(a.id) || (a.id < b.id ? -1 : 1),
		);
		const hardCore = hardSorted.slice(0, K).map((h) => h.id);
		const core = [...new Set([...l.matches, ...hardCore])];
		const excluded = new Set(l.ambiguous);
		const fillable = bank.filter((x) => !core.includes(x.id) && !excluded.has(x.id));
		if (core.length + fillable.length < maxSize)
			throw new Error(`${l.queryId}: only ${core.length + fillable.length} eligible items for a ${maxSize} pool`);
		const fill = stratifiedFill(fillable, cellSeed(study.seeds.fill, l.queryId)).map((x) => x.id);
		const anchorId =
			l.status === 'match'
				? seededShuffle([...l.matches].sort(), cellSeed(study.seeds.fill, l.queryId, 'target'))[0]
				: [...l.hardDistractors].sort((a, b) => cosTo(b.id) - cosTo(a.id) || (a.id < b.id ? -1 : 1))[0]?.id;
		if (!anchorId) throw new Error(`${l.queryId}: no anchor (match or hard distractor)`);
		const sizes = {};
		for (const n of study.sizes) {
			const ids = [...core, ...fill.slice(0, n - core.length)];
			const t0 = performance.now();
			const ranking = rankByCosine(qVec, ids, vectors).map((r) => [r.id, Number(r.score.toFixed(6))]);
			const retrievalMs = performance.now() - t0; // exact cosine over the pool, in-process
			const orders = study.seeds.orders.map((seed, o) => placeAnchor(ids, anchorId, study.pool.anchorPositions[o], cellSeed(seed, l.queryId, n)));
			sizes[n] = { ids: [...ids].sort(), ranking, retrievalMs, orders };
		}
		pools.push({
			queryId: l.queryId,
			split: l.split,
			core,
			hardCore,
			excluded: [...excluded].sort(),
			anchorId,
			anchorRole: l.status === 'match' ? 'designated-target' : 'strongest-hard-distractor',
			coreChars: core.map((id) => byId.get(id).chars),
			sizes,
		});
	}

	return { bank, pools };
}

/** One spec per (query, size, order, method). B shows top-k by cosine, in A's order. */
export function buildManifest({ pools, queriesById, study, stage, sizes, orderIndices, splits }) {
	const specs = [];
	for (const p of pools) {
		if (!splits.includes(p.split)) continue;
		for (const n of sizes) {
			const cell = p.sizes[n];
			const topK = new Set(cell.ranking.slice(0, study.retrieval.k).map(([id]) => id));
			for (const o of orderIndices) {
				const order = cell.orders[o].order;
				for (const method of ['A', 'B']) {
					const shownIds = method === 'A' ? order : order.filter((id) => topK.has(id));
					specs.push({
						callId: `${stage === 'smoke' ? 'smoke-' : ''}${p.queryId}-n${n}-o${o}-${method}`,
						queryId: p.queryId,
						split: p.split,
						size: n,
						orderIndex: o,
						method,
						anchorId: p.anchorId,
						anchorPosition: cell.orders[o].anchorPosition,
						retrievalMs: method === 'B' ? cell.retrievalMs : 0,
						shownIds,
						queryText: queriesById.get(p.queryId).text,
					});
				}
			}
		}
	}

	return specs;
}
