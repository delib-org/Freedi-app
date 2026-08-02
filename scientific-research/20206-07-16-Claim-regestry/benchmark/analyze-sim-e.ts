/**
 * Scores condition E (corpus replay of the hierarchical LLM engine) and writes
 * SIM_E_RESULTS.md. Wilson 95% CIs, per-dataset breakdown, structure/cost stats.
 *
 * Usage: npx tsx analyze-sim-e.ts
 */
import { writeFileSync } from 'node:fs';
import { readJsonl, resultsPath } from './lib/io';
import type { SimERow } from './run-sim-e';

const RESULT_FILE = 'sim-e.jsonl';
const SUMMARY_FILE = 'sim-e-datasets.jsonl';
const OUT_FILE = 'SIM_E_RESULTS.md';

interface DatasetSummary {
	dataset: string;
	model: string;
	statements: number;
	clusters: number;
	synths: number;
	calls: { cluster: number; synth: number; label: number };
	meanClusterList: number;
	meanSynthList: number;
}

/** Wilson score interval — correct for proportions near 0 or 1, unlike normal approx. */
function wilson(successes: number, n: number): [number, number] {
	if (n === 0) return [0, 0];
	const z = 1.96;
	const p = successes / n;
	const denom = 1 + (z * z) / n;
	const centre = p + (z * z) / (2 * n);
	const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

	return [(centre - spread) / denom, (centre + spread) / denom];
}

function rate(rows: SimERow[], field: keyof SimERow): string {
	const k = rows.filter((r) => r[field] === true).length;
	const [lo, hi] = wilson(k, rows.length);

	return `${((k / rows.length) * 100).toFixed(1)}% (${k}/${rows.length}) [${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}]`;
}

function main(): void {
	const rows = readJsonl<SimERow>(RESULT_FILE);
	if (rows.length === 0) throw new Error(`no rows in ${RESULT_FILE}`);
	const summaries = readJsonl<DatasetSummary>(SUMMARY_FILE);
	const model = rows[0].model;

	const lines: string[] = [];
	lines.push('# Condition E — hierarchical LLM routing, corpus replay');
	lines.push('');
	lines.push(
		`Engine: SIMULATED-ENGINE.md §7 (living labels, cosine-ranked cluster step via production \`routeToTopics\`, synth step via production \`classifyAgainstClaims\` at confidence ≥ 0.6).`,
	);
	lines.push(`Judge model: \`${model}\` · n = ${rows.length} triplets · ${summaries.length} datasets.`);
	lines.push('');
	lines.push('Unlike conditions A–D this is a **growing corpus**: anchors seed the structure, then');
	lines.push('matches + distractors are filed into it in shuffled order. Scores are the state at probe time.');
	lines.push('');
	lines.push('## Headline');
	lines.push('');
	lines.push('| metric | value (Wilson 95% CI) |');
	lines.push('|---|---|');
	lines.push(`| **tripletCorrect** (match in anchor's synth AND distractor not) | ${rate(rows, 'tripletCorrect')} |`);
	lines.push(`| synthRecall (match filed into anchor's synth) | ${rate(rows, 'synthRecall')} |`);
	lines.push(`| clusterRecall (match filed into anchor's cluster) | ${rate(rows, 'clusterRecall')} |`);
	lines.push(`| **falseMerge** (distractor filed into anchor's synth) | ${rate(rows, 'falseMerge')} |`);
	lines.push(`| distractorSameCluster (pro/con inside one topic) | ${rate(rows, 'distractorSameCluster')} |`);
	lines.push(`| counterEdgeToAnchor (explicit oppose edge recorded) | ${rate(rows, 'counterEdgeToAnchor')} |`);
	lines.push('');
	lines.push('Reference points (§3): judge-on-raw-text ceiling 95.0% triplet accuracy / 2.1% false-accept;');
	lines.push('production cosine-only fast paths ≈ 0.5% triplet accuracy.');
	lines.push('');

	lines.push('## Where recall is lost');
	lines.push('');
	const missedSynth = rows.filter((r) => !r.synthRecall);
	const missedButSameCluster = missedSynth.filter((r) => r.clusterRecall);
	const missedCluster = missedSynth.filter((r) => !r.clusterRecall);
	lines.push(`- match missed its synth: **${missedSynth.length}** of ${rows.length}`);
	lines.push(
		`  - but landed in the right cluster (synth-step miss): ${missedButSameCluster.length}`,
	);
	lines.push(`  - and landed in the wrong cluster (cluster-step misroute): ${missedCluster.length}`);
	lines.push('');
	const verdicts = (key: 'match' | 'distractor'): string => {
		const counts = new Map<string, number>();
		for (const r of rows) counts.set(r[key].verdict, (counts.get(r[key].verdict) ?? 0) + 1);

		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([v, n]) => `${v} ${n}`)
			.join(' · ');
	};
	lines.push(`- match verdicts: ${verdicts('match')}`);
	lines.push(`- distractor verdicts: ${verdicts('distractor')}`);
	lines.push('');

	lines.push('## Per dataset');
	lines.push('');
	lines.push('| dataset | n | tripletCorrect | synthRecall | falseMerge | clusters | synths |');
	lines.push('|---|---|---|---|---|---|---|');
	const byDataset = new Map<string, SimERow[]>();
	for (const r of rows) {
		const arr = byDataset.get(r.dataset) ?? [];
		arr.push(r);
		byDataset.set(r.dataset, arr);
	}
	for (const [dataset, group] of [...byDataset.entries()].sort()) {
		const s = summaries.find((x) => x.dataset === dataset);
		const pc = (f: keyof SimERow): string =>
			`${((group.filter((r) => r[f] === true).length / group.length) * 100).toFixed(0)}%`;
		lines.push(
			`| ${dataset} | ${group.length} | ${pc('tripletCorrect')} | ${pc('synthRecall')} | ${pc('falseMerge')} | ${s?.clusters ?? '—'} | ${s?.synths ?? '—'} |`,
		);
	}
	lines.push('');

	lines.push('## Structure & cost');
	lines.push('');
	const totalStatements = summaries.reduce((n, s) => n + s.statements, 0);
	const totalClusters = summaries.reduce((n, s) => n + s.clusters, 0);
	const totalSynths = summaries.reduce((n, s) => n + s.synths, 0);
	const totalCalls = summaries.reduce(
		(acc, s) => ({
			cluster: acc.cluster + s.calls.cluster,
			synth: acc.synth + s.calls.synth,
			label: acc.label + s.calls.label,
		}),
		{ cluster: 0, synth: 0, label: 0 },
	);
	const calls = totalCalls.cluster + totalCalls.synth + totalCalls.label;
	lines.push(`- statements filed: **${totalStatements}** → **${totalClusters}** clusters, **${totalSynths}** synths`);
	lines.push(
		`- compression: ${(totalStatements / Math.max(1, totalSynths)).toFixed(2)} statements per synth, ${(totalStatements / Math.max(1, totalClusters)).toFixed(1)} per cluster`,
	);
	lines.push(
		`- LLM calls: ${calls} total (${totalCalls.cluster} cluster · ${totalCalls.synth} synth · ${totalCalls.label} label) = **${(calls / Math.max(1, totalStatements)).toFixed(2)} per statement**`,
	);
	const meanCluster =
		summaries.reduce((n, s) => n + s.meanClusterList, 0) / Math.max(1, summaries.length);
	const meanSynth =
		summaries.reduce((n, s) => n + s.meanSynthList, 0) / Math.max(1, summaries.length);
	lines.push(
		`- mean candidate list: ${meanCluster.toFixed(1)} clusters (cluster step) · ${meanSynth.toFixed(1)} synths (synth step)`,
	);
	lines.push(
		`- label calls are ${((totalCalls.label / Math.max(1, calls)) * 100).toFixed(0)}% of all calls — the lazy-update knob (§7 refinement 2) targets this.`,
	);
	lines.push('');

	writeFileSync(resultsPath(`../${OUT_FILE}`), lines.join('\n') + '\n');
	console.info(lines.join('\n'));
	console.info(`\nWrote ${OUT_FILE}`);
}

main();
