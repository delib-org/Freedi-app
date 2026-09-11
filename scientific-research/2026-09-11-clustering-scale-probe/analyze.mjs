#!/usr/bin/env node
// Scores the main run (smoke excluded) and writes results.csv, summary.json,
// TABLES.md and figures/. Offline: reads decisions, never calls an API.
//   node analyze.mjs --study=. [--labels=annotation/labels.human.jsonl]
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { blockBootstrap } from './lib/bootstrap.mjs';
import { loadDecisions } from './lib/executor.mjs';
import { Ledger } from './lib/ledger.mjs';
import { scoreDecision } from './lib/score.mjs';
import { median, parseArgs, quantile, readJson, readJsonl, sha256File, sum, writeFileAtomic, writeJson } from './lib/util.mjs';
import { buildFigures } from './analysis/figures.mjs';

const args = parseArgs(process.argv.slice(2));
const DIR = resolve(args.study ?? '.');
const P = (...p) => join(DIR, ...p);
const study = readJson(P('study.json'));
const labelsPath = args.labels ? P(args.labels) : P('frozen', 'labels.jsonl');
const labels = new Map(readJsonl(labelsPath).map((l) => [l.queryId, l]));
const pools = new Map(readJson(P('frozen', 'pools.json')).map((p) => [p.queryId, p]));
const specs = readJsonl(P('frozen', 'manifest.jsonl'));
const decisions = loadDecisions(P('runs', 'main'), specs);
const labelStatus = [...labels.values()].every((l) => String(l.labelSource).startsWith('human')) ? 'human-adjudicated' : 'PROVISIONAL';
const SIZES = study.sizes;
const METHODS = ['A', 'B'];

// ---------------------------------------------------------------- score
const variants = {
	strict: (l) => ({ matches: l.matches }),
	lenient: (l) => ({ matches: [...l.matches, ...l.hardDistractors.filter((h) => h.borderline).map((h) => h.id)] }),
};
const missing = [];
const scored = { strict: [], lenient: [] };
specs.forEach((spec, i) => {
	const d = decisions[i];
	if (!d) {
		missing.push({ callId: spec.callId, reason: 'no decision record (not run: budget stop or technical stop)' });

		return;
	}
	const cell = pools.get(spec.queryId).sizes[spec.size];
	for (const [name, fn] of Object.entries(variants)) scored[name].push({ ...scoreDecision(d, fn(labels.get(spec.queryId)), cell), split: spec.split });
});
const rows = scored.strict;

// Screening-miss guard: an approved match outside the fixed core breaks the nesting assumption.
const coreViolations = [];
for (const [qid, l] of labels) {
	const core = new Set(pools.get(qid).core);
	for (const id of l.matches) if (!core.has(id)) coreViolations.push({ queryId: qid, id });
}

// ---------------------------------------------------------------- tables
const pct = (x) => (x == null ? '—' : `${(100 * x).toFixed(1)}%`);
const f = (x, d = 0) => (x == null ? '—' : Number(x).toFixed(d));
const usd = (x) => (x == null ? '—' : `$${x.toFixed(5)}`);
const count = (rs, o) => rs.filter((r) => r.outcome === o).length;

function outcomeTable(rs) {
	const out = [];
	for (const n of SIZES)
		for (const m of METHODS) {
			const c = rs.filter((r) => r.size === n && r.method === m);
			const valid = c.filter((r) => r.predictedJoin);
			const correctJoins = valid.filter((r) => r.correct).length;
			out.push({
				size: n,
				method: m,
				cells: c.length,
				correct: count(c, 'correct'),
				falseJoin: count(c, 'false-join'),
				missAbstain: count(c, 'miss-abstain'),
				missNoRetrieval: count(c, 'miss-no-retrieval'),
				invalid: count(c, 'invalid-output'),
				truncated: count(c, 'truncated'),
				technical: count(c, 'technical'),
				predictedJoins: valid.length,
				joinPrecision: valid.length ? correctJoins / valid.length : null,
				falseJoinFraction: c.length ? count(c, 'false-join') / c.length : null,
			});
		}

	return out;
}
const tables = {
	all: outcomeTable(rows),
	positive: outcomeTable(rows.filter((r) => r.positive)),
	noMatch: outcomeTable(rows.filter((r) => !r.positive)),
	lenientAll: outcomeTable(scored.lenient),
};

// Candidate recall (B): per positive query and size — order does not change the retrieved set.
const recall = SIZES.map((n) => {
	const qs = [...new Set(rows.filter((r) => r.positive && r.size === n && r.method === 'B').map((r) => r.queryId))];
	const per = qs.map((q) => rows.find((r) => r.queryId === q && r.size === n && r.method === 'B'));

	return {
		size: n,
		positiveQueries: qs.length,
		retrievedAtLeastOne: per.filter((r) => r.candidateRecall).length,
		bestRanks: per.map((r) => r.bestTargetRank),
		bestCosines: per.map((r) => r.bestTargetCosine),
	};
});

// Resources.
const resources = [];
for (const n of SIZES)
	for (const m of METHODS) {
		const c = rows.filter((r) => r.size === n && r.method === m && r.promptTokens != null);
		const mean = (k) => (c.length ? sum(c.map((r) => r[k] ?? 0)) / c.length : null);
		resources.push({
			size: n,
			method: m,
			calls: c.length,
			attempts: sum(c.map((r) => r.attempts)),
			retries: sum(c.map((r) => r.retries)),
			promptMean: mean('promptTokens'),
			promptMedian: median(c.map((r) => r.promptTokens)),
			cachedMean: mean('cachedTokens'),
			cacheWriteMean: mean('cacheWriteTokens'),
			completionMean: mean('completionTokens'),
			completionMax: Math.max(...c.map((r) => r.completionTokens)),
			reasoningMean: mean('reasoningTokens'),
			billedMean: mean('billedUsd'),
			undiscountedMean: mean('undiscountedUsd'),
			billedTotal: sum(c.map((r) => r.billedUsd ?? 0)),
			undiscountedTotal: sum(c.map((r) => r.undiscountedUsd ?? 0)),
			apiMsMean: mean('apiElapsedMs'),
			retrievalMsMean: mean('retrievalMs'),
		});
	}

// Paired cells.
const key = (r) => `${r.queryId}|${r.size}|${r.orderIndex}`;
function pairs(rs) {
	const map = new Map();
	for (const r of rs) {
		if (!map.has(key(r))) map.set(key(r), {});
		map.get(key(r))[r.method] = r;
	}

	return [...map.values()].filter((p) => p.A && p.B);
}
const paired = pairs(rows);
const pairedBySize = SIZES.map((n) => {
	const ps = paired.filter((p) => p.A.size === n);
	const ratiosU = ps.filter((p) => p.B.undiscountedUsd).map((p) => p.A.undiscountedUsd / p.B.undiscountedUsd);
	const ratiosB = ps.filter((p) => p.B.billedUsd).map((p) => p.A.billedUsd / p.B.billedUsd);
	const tokenRatios = ps.map((p) => p.A.promptTokens / p.B.promptTokens);

	return {
		size: n,
		pairs: ps.length,
		bothCorrect: ps.filter((p) => p.A.correct && p.B.correct).length,
		onlyA: ps.filter((p) => p.A.correct && !p.B.correct).length,
		onlyB: ps.filter((p) => !p.A.correct && p.B.correct).length,
		neither: ps.filter((p) => !p.A.correct && !p.B.correct).length,
		falseJoinsA: ps.filter((p) => p.A.falseJoin).length,
		falseJoinsB: ps.filter((p) => p.B.falseJoin).length,
		sameDecision: ps.filter((p) => p.A.decision === p.B.decision && p.A.targetId === p.B.targetId).length,
		costRatioUndiscounted: { median: median(ratiosU), q25: quantile(ratiosU, 0.25), q75: quantile(ratiosU, 0.75), min: Math.min(...ratiosU), max: Math.max(...ratiosU) },
		costRatioBilled: { median: median(ratiosB), q25: quantile(ratiosB, 0.25), q75: quantile(ratiosB, 0.75) },
		promptTokenRatio: { median: median(tokenRatios) },
	};
});

// Position manipulation (A only): anchor near the start (order 0) vs the middle (order 1).
const position = SIZES.map((n) => {
	const o = (k, pos) => rows.filter((r) => r.method === 'A' && r.size === n && r.orderIndex === k && r.positive === pos);

	return {
		size: n,
		positiveCorrect: [o(0, true).filter((r) => r.correct).length, o(1, true).filter((r) => r.correct).length, o(0, true).length],
		noMatchCorrect: [o(0, false).filter((r) => r.correct).length, o(1, false).filter((r) => r.correct).length, o(0, false).length],
	};
});

// Uncertainty.
const strata = {
	match: [...labels.values()].filter((l) => l.split === 'test' && l.matches.length).map((l) => l.queryId),
	none: [...labels.values()].filter((l) => l.split === 'test' && !l.matches.length).map((l) => l.queryId),
};
const rate = (rs, m, n, k) => {
	const c = rs.filter((r) => r.method === m && r.size === n);

	return c.length ? c.filter((r) => r[k]).length / c.length : null;
};
const boot = {};
for (const n of SIZES) {
	boot[n] = {
		correctA: blockBootstrap(rows, strata, (rs) => rate(rs, 'A', n, 'correct'), { seed: study.seeds.bootstrap }),
		correctB: blockBootstrap(rows, strata, (rs) => rate(rs, 'B', n, 'correct'), { seed: study.seeds.bootstrap }),
		correctDiffBminusA: blockBootstrap(rows, strata, (rs) => rate(rs, 'B', n, 'correct') - rate(rs, 'A', n, 'correct'), { seed: study.seeds.bootstrap }),
		falseJoinDiffBminusA: blockBootstrap(rows, strata, (rs) => rate(rs, 'B', n, 'falseJoin') - rate(rs, 'A', n, 'falseJoin'), { seed: study.seeds.bootstrap }),
		medianCostRatio: blockBootstrap(rows, strata, (rs) => median(pairs(rs).filter((p) => p.A.size === n).map((p) => p.A.undiscountedUsd / p.B.undiscountedUsd)), { seed: study.seeds.bootstrap }),
	};
}

// Pre-registered triage criterion at the largest size.
const nMax = Math.max(...SIZES);
const at = pairedBySize.find((p) => p.size === nMax);
const incorrect = (m) => rows.filter((r) => r.size === nMax && r.method === m && !r.correct).length;
const criterion = {
	labelStatus,
	cost: { medianRatio: at.costRatioUndiscounted.median, threshold: 2, pass: at.costRatioUndiscounted.median >= 2 },
	falseJoins: { A: at.falseJoinsA, B: at.falseJoinsB, allowedExcess: 1, pass: at.falseJoinsB - at.falseJoinsA <= 1 },
	incorrect: { A: incorrect('A'), B: incorrect('B'), allowedExcess: 2, pass: incorrect('B') - incorrect('A') <= 2 },
	recall: { perSize: recall.map((r) => `${r.retrievedAtLeastOne}/${r.positiveQueries}`), threshold: '9/10 at every size', pass: recall.every((r) => r.retrievedAtLeastOne >= 9) },
};
criterion.allPass = criterion.cost.pass && criterion.falseJoins.pass && criterion.incorrect.pass && criterion.recall.pass;

// Spend and time.
const ledger = new Ledger(P('budget-ledger.jsonl'), { capUsd: study.budget.capUsd, stageCaps: {} });
const runSummary = existsSync(P('runs', 'main', 'run-summary.json')) ? readJson(P('runs', 'main', 'run-summary.json')) : null;
const embedTokens = readJsonl(P('runs', 'prep', 'attempts.jsonl')).reduce((a, x) => a + (x.usage?.prompt_tokens ?? 0), 0);
const queryEmbed = readJson(P('.cache', 'emb-3small.json')).rows;
const queryEmbedTokens = new Map(queryEmbed.map((r) => [r.id, r.tokens]));
const bEmbeddingUsdPerQuery = median([...labels.keys()].map((q) => (queryEmbedTokens.get(q) * study.pricing.models[study.embedding.model].inputPerM) / 1e6));

// ---------------------------------------------------------------- write
const csvCols = ['callId', 'queryId', 'split', 'positive', 'size', 'orderIndex', 'method', 'shownCount', 'approvedInPool', 'approvedShown', 'candidateRecall', 'bestTargetRank', 'bestTargetCosine', 'approvedPositions', 'decision', 'targetId', 'targetIsAnchor', 'outcome', 'correct', 'falseJoin', 'failure', 'attempts', 'retries', 'promptTokens', 'cachedTokens', 'cacheWriteTokens', 'completionTokens', 'reasoningTokens', 'billedUsd', 'undiscountedUsd', 'apiElapsedMs', 'retrievalMs', 'labelStatus'];
const lenientBy = new Map(scored.lenient.map((r) => [r.callId, r.outcome]));
const csv = [
	[...csvCols, 'outcomeLenient', 'labelsFile', 'labelsSha256'].join(','),
	...rows.map((r) => [...csvCols.map((c) => (Array.isArray(r[c]) ? r[c].join(' ') : r[c] ?? '')), lenientBy.get(r.callId), labelsPath.replace(`${DIR}/`, ''), sha256File(labelsPath)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
].join('\n');
writeFileAtomic(P('results.csv'), `${csv}\n`);

const summary = {
	generatedAt: new Date().toISOString(),
	labelStatus,
	labelsFile: labelsPath.replace(`${DIR}/`, ''),
	labelsSha256: sha256File(labelsPath),
	manifestCells: specs.length,
	scoredCells: rows.length,
	missing,
	coreViolations,
	tables,
	recall,
	resources,
	pairedBySize,
	position,
	bootstrap: boot,
	criterion,
	spend: { ...ledger.summary(), embeddingTokens: embedTokens, bQueryEmbeddingUsdMedian: bEmbeddingUsdPerQuery },
	time: runSummary ? { mainElapsedSeconds: runSummary.elapsedSeconds, apiSecondsSum: sum(rows.map((r) => r.apiElapsedMs ?? 0)) / 1000 } : null,
};
writeJson(P('summary.json'), summary);

const md = [];
md.push(`# Tables — clustering-scale probe`, '', `Labels: **${labelStatus}** (\`${summary.labelsFile}\`, sha256 ${summary.labelsSha256.slice(0, 12)}…). Cells scored ${rows.length}/${specs.length}; missing ${missing.length}. Smoke calls excluded.`, '');
const outcomeMd = (title, t) => {
	md.push(`## ${title}`, '', '| N | method | cells | correct | false join | miss (abstain) | miss (not retrieved) | invalid | truncated | technical | predicted joins | join precision | false-join fraction |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
	for (const r of t) md.push(`| ${r.size} | ${r.method} | ${r.cells} | ${r.correct} | ${r.falseJoin} | ${r.missAbstain} | ${r.missNoRetrieval} | ${r.invalid} | ${r.truncated} | ${r.technical} | ${r.predictedJoins} | ${r.joinPrecision == null ? 'undefined' : pct(r.joinPrecision)} | ${pct(r.falseJoinFraction)} |`);
	md.push('');
};
outcomeMd('Decision outcomes — all 20 test queries (strict labels)', tables.all);
outcomeMd('Match-present queries (10)', tables.positive);
outcomeMd('No-match queries (10)', tables.noMatch);
outcomeMd('Sensitivity — lenient labels (borderline items count as allowable matches)', tables.lenientAll);
md.push('## Candidate recall of B (top-15 exact cosine, text-embedding-3-small)', '', '| N | positive queries | ≥1 approved target retrieved | best approved rank (per query) |', '|---|---|---|---|');
for (const r of recall) md.push(`| ${r.size} | ${r.positiveQueries} | ${r.retrievedAtLeastOne} | ${r.bestRanks.join(', ')} |`);
md.push('', '## Resources per call (means)', '', '| N | method | calls | attempts | prompt tokens | cache-write | cached read | completion (max) | reasoning | billed $/call | undiscounted $/call | API ms | retrieval ms |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of resources) md.push(`| ${r.size} | ${r.method} | ${r.calls} | ${r.attempts} | ${f(r.promptMean)} | ${f(r.cacheWriteMean)} | ${f(r.cachedMean)} | ${f(r.completionMean)} (${r.completionMax}) | ${f(r.reasoningMean)} | ${usd(r.billedMean)} | ${usd(r.undiscountedMean)} | ${f(r.apiMsMean)} | ${f(r.retrievalMsMean, 2)} |`);
md.push('', '## Paired A vs B (same query, size, order)', '', '| N | pairs | both correct | only A correct | only B correct | neither | false joins A / B | identical decision | median A/B cost (undiscounted) [IQR] | median A/B cost (billed) | median A/B prompt tokens |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const p of pairedBySize) md.push(`| ${p.size} | ${p.pairs} | ${p.bothCorrect} | ${p.onlyA} | ${p.onlyB} | ${p.neither} | ${p.falseJoinsA} / ${p.falseJoinsB} | ${p.sameDecision} | ${f(p.costRatioUndiscounted.median, 2)}× [${f(p.costRatioUndiscounted.q25, 2)}–${f(p.costRatioUndiscounted.q75, 2)}] | ${f(p.costRatioBilled.median, 2)}× | ${f(p.promptTokenRatio.median, 2)}× |`);
md.push('', '## Position manipulation (method A; correct at anchor ≈5% / ≈50% of list, of n)', '', '| N | match-present | no-match |', '|---|---|---|');
for (const p of position) md.push(`| ${p.size} | ${p.positiveCorrect[0]} / ${p.positiveCorrect[1]} of ${p.positiveCorrect[2]} | ${p.noMatchCorrect[0]} / ${p.noMatchCorrect[1]} of ${p.noMatchCorrect[2]} |`);
md.push('', '## Query-block bootstrap (2,000 resamples, stratified; 95% percentile intervals)', '', '| N | correct A | correct B | B − A correct | B − A false-join rate | median A/B cost |', '|---|---|---|---|---|---|');
const ci = (b, p = true) => `${p ? pct(b.estimate) : f(b.estimate, 2)} [${p ? pct(b.lo) : f(b.lo, 2)}, ${p ? pct(b.hi) : f(b.hi, 2)}]`;
for (const n of SIZES) md.push(`| ${n} | ${ci(boot[n].correctA)} | ${ci(boot[n].correctB)} | ${ci(boot[n].correctDiffBminusA)} | ${ci(boot[n].falseJoinDiffBminusA)} | ${ci(boot[n].medianCostRatio, false)}× |`);
md.push('', '## Per-query outcomes (strict)', '', `| query | status | ${SIZES.flatMap((n) => ['o0', 'o1'].map((o) => `${n} ${o} A/B`)).join(' | ')} |`, `|---|---|${SIZES.flatMap(() => ['---', '---']).join('|')}|`);
const code = { correct: '✓', 'false-join': 'FJ', 'miss-abstain': 'MA', 'miss-no-retrieval': 'MR', 'invalid-output': 'INV', truncated: 'TR', technical: 'TE' };
for (const q of [...strata.match, ...strata.none]) {
	const cells = SIZES.flatMap((n) => [0, 1].map((o) => METHODS.map((m) => code[rows.find((r) => r.queryId === q && r.size === n && r.orderIndex === o && r.method === m)?.outcome] ?? '·').join('/')));
	md.push(`| ${q} | ${labels.get(q).matches.length ? 'match' : 'none'} | ${cells.join(' | ')} |`);
}
md.push('', `✓ correct · FJ false join · MA abstained although a match was shown · MR match not retrieved · INV invalid output · TR truncated · TE technical failure`);
md.push('', '## Pre-registered triage criterion at N = 500', '', '```json', JSON.stringify(criterion, null, 2), '```');
writeFileAtomic(P('TABLES.md'), `${md.join('\n')}\n`);

await buildFigures({ dir: DIR, summary, rows, study });
console.info(JSON.stringify({ labelStatus, scored: rows.length, missing: missing.length, coreViolations: coreViolations.length, spentUsd: summary.spend.spentUsd, criterion }, null, 2));
