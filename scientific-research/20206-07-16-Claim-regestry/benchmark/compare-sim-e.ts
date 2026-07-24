/**
 * Side-by-side comparison of condition E cluster-step configurations.
 * Reads every results/sim-e[-TAG].jsonl present and prints one row each,
 * plus a per-triplet fixed/broken diff against the baseline.
 *
 * Usage: npx tsx compare-sim-e.ts [baselineTag]
 */
import { existsSync } from 'node:fs';
import { readJsonl, resultsPath } from './lib/io';
import type { SimERow } from './run-sim-e';

interface Summary {
	dataset: string;
	statements: number;
	clusters: number;
	synths: number;
	calls: { cluster: number; synth: number; label: number; merge: number };
	merges?: number;
	guardedJoins?: number;
	flatRescues?: number;
	meanSynthList: number;
}

const CONFIGS: Array<{ tag: string; label: string }> = [
	{ tag: '', label: 'baseline (create on empty route)' },
	{ tag: 'g70', label: 'creation guard (cos ≥ 0.70)' },
	{ tag: 'merge', label: 'merge pass (post-seed)' },
	{ tag: 'g70m', label: 'guard + merge pass' },
	{ tag: 'flat', label: 'flat fallback (production rule)' },
];

/** Wilson score interval — correct near 0 and 1, unlike the normal approximation. */
function wilson(k: number, n: number): [number, number] {
	if (n === 0) return [0, 0];
	const z = 1.96;
	const p = k / n;
	const d = 1 + (z * z) / n;
	const c = p + (z * z) / (2 * n);
	const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

	return [(c - s) / d, (c + s) / d];
}

function load(tag: string): { rows: SimERow[]; summaries: Summary[] } | null {
	const rf = tag ? `sim-e-${tag}.jsonl` : 'sim-e.jsonl';
	const sf = tag ? `sim-e-datasets-${tag}.jsonl` : 'sim-e-datasets.jsonl';
	if (!existsSync(resultsPath(rf))) return null;

	return { rows: readJsonl<SimERow>(rf), summaries: readJsonl<Summary>(sf) };
}

function main(): void {
	const baseTag = process.argv[2] ?? '';
	const loaded = CONFIGS.map((c) => ({ ...c, data: load(c.tag) })).filter((c) => c.data !== null);
	const base = loaded.find((c) => c.tag === baseTag)?.data ?? null;

	const pct = (rows: SimERow[], k: keyof SimERow): number =>
		(rows.filter((r) => r[k] === true).length / rows.length) * 100;

	console.info('\n# Condition E — cluster-step configurations (150-triplet pilot, gpt-4o-mini)\n');
	console.info(
		'| config | n | tripletCorrect | synthRecall | clusterRecall | falseMerge | distSameCluster | counterEdge |',
	);
	console.info('|---|---|---|---|---|---|---|---|');
	for (const { label, data } of loaded) {
		const r = data!.rows;
		const k = r.filter((x) => x.tripletCorrect).length;
		const [lo, hi] = wilson(k, r.length);
		console.info(
			`| ${label} | ${r.length} | **${pct(r, 'tripletCorrect').toFixed(1)}%** [${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}] | ${pct(r, 'synthRecall').toFixed(1)}% | ${pct(r, 'clusterRecall').toFixed(1)}% | ${pct(r, 'falseMerge').toFixed(1)}% | ${pct(r, 'distractorSameCluster').toFixed(1)}% | ${pct(r, 'counterEdgeToAnchor').toFixed(1)}% |`,
		);
	}

	console.info('\n## Structure & cost\n');
	console.info(
		'| config | clusters | statements/cluster | synths | mean synth list | calls/statement | guarded | merges | rescues |',
	);
	console.info('|---|---|---|---|---|---|---|---|---|');
	for (const { label, data } of loaded) {
		const s = data!.summaries;
		const st = s.reduce((n, x) => n + x.statements, 0);
		const cl = s.reduce((n, x) => n + x.clusters, 0);
		const sy = s.reduce((n, x) => n + x.synths, 0);
		const calls = s.reduce(
			(n, x) => n + x.calls.cluster + x.calls.synth + x.calls.label + (x.calls.merge ?? 0),
			0,
		);
		const msl = s.reduce((n, x) => n + x.meanSynthList, 0) / s.length;
		console.info(
			`| ${label} | ${cl} | ${(st / cl).toFixed(1)} | ${sy} | ${msl.toFixed(1)} | ${(calls / st).toFixed(2)} | ${s.reduce((n, x) => n + (x.guardedJoins ?? 0), 0)} | ${s.reduce((n, x) => n + (x.merges ?? 0), 0)} | ${s.reduce((n, x) => n + (x.flatRescues ?? 0), 0)} |`,
		);
	}

	if (base) {
		console.info('\n## Per-triplet diff vs baseline\n');
		const bi = new Map(base.rows.map((r) => [r.id, r]));
		for (const { tag, label, data } of loaded) {
			if (tag === baseTag) continue;
			let fixed = 0;
			let broken = 0;
			for (const r of data!.rows) {
				const b = bi.get(r.id);
				if (!b || b.tripletCorrect === r.tripletCorrect) continue;
				if (r.tripletCorrect) fixed++;
				else broken++;
			}
			console.info(`- ${label}: **+${fixed} fixed**, −${broken} broken (net ${fixed - broken})`);
		}
	}
	console.info('');
}

main();
