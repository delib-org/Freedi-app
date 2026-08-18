#!/usr/bin/env node
/**
 * Self-test for score100.mjs — verifies the scorer before anyone trusts it on a
 * real run. Builds synthetic result sets whose correct scores are known by
 * construction, scores them, and asserts the numbers.
 *
 * A scorer bug and a mechanism regression look identical in a report, so this
 * runs first. Zero dependencies, no emulator, no API keys, a few milliseconds.
 *
 * USAGE:  node selftest.mjs
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SCORER = join(here, 'score100.mjs');

// Ground truth mirroring the real corpora: 10 topics x 5 synths x 2 statements.
const rows = [];
for (let t = 0; t < 10; t++) {
	for (let s = 0; s < 5; s++) {
		for (let p = 0; p < 2; p++) {
			rows.push({
				id: `t${t}s${s}p${p}`,
				text: `topic${t} synth${s} paraphrase${p}`,
				groundTruthTopic: `topic${t}`,
				groundTruthSynth: `topic${t}/synth${s}`,
			});
		}
	}
}
const statementsDoc = { test: 'selftest', language: 'synthetic', statements: rows };
const synth = (id, memberIds) => ({ id, title: id, members: memberIds.map((i) => ({ id: i })) });

const perfectSynths = [];
const perfectTopics = [];
for (let t = 0; t < 10; t++) {
	const synthIds = [];
	for (let s = 0; s < 5; s++) {
		const id = `S${t}_${s}`;
		synthIds.push(id);
		perfectSynths.push(synth(id, [`t${t}s${s}p0`, `t${t}s${s}p1`]));
	}
	perfectTopics.push({ id: `T${t}`, title: `T${t}`, members: [], memberSynthIds: synthIds });
}

const cases = [
	{
		name: 'perfect — every pair merged, every topic nested',
		results: { synths: { items: perfectSynths }, topicClusters: { items: perfectTopics } },
		expect: { composite: 1.0, synthF1: 1.0, topicF1: 1.0, pairRecoveryRate: 1.0 },
	},
	{
		name: 'fragmented — nothing merged',
		results: { synths: { items: [] }, topicClusters: { items: [] } },
		expect: { composite: 0.0, synthF1: 0.0, topicF1: 0.0, pairRecoveryRate: 0.0 },
	},
	{
		// Perfect recall, catastrophic precision: guards against a scorer that only
		// measures recall and would call this a success.
		name: 'over-merged — one synth swallowing all 100',
		results: { synths: { items: [synth('BIG', rows.map((r) => r.id))] }, topicClusters: { items: [] } },
		expect: { synthRecall: 1.0, synthPrecisionBelow: 0.05, compositeBelow: 0.2 },
	},
	{
		// The known structural gap: the live pipeline never nests synths under
		// topic clusters, so this is the shape a "perfect synth run" produces today.
		name: 'synths only — perfect pairs, no topic clusters',
		results: { synths: { items: perfectSynths }, topicClusters: { items: [] } },
		expect: { synthF1: 1.0, topicF1: 0.2, composite: 0.68 },
	},
	{
		// Half the pairs merged, none wrongly: recall 0.5, precision 1.0.
		name: 'half recovered — 25 of 50 pairs merged, no false merges',
		results: {
			synths: { items: perfectSynths.slice(0, 25) },
			topicClusters: { items: [] },
		},
		expect: { synthPrecision: 1.0, synthRecall: 0.5, pairRecoveryRate: 0.5 },
	},
];

const near = (actual, expected, tol = 0.005) => Math.abs(actual - expected) <= tol;

let failures = 0;
for (const testCase of cases) {
	const dir = mkdtempSync(join(tmpdir(), 'score100-selftest-'));
	try {
		writeFileSync(join(dir, 'statements.json'), JSON.stringify(statementsDoc));
		writeFileSync(
			join(dir, 'results.json'),
			JSON.stringify({ ...testCase.results, parameters: { fixture: testCase.name } }),
		);
		const out = execFileSync('node', [SCORER, dir, '--json'], { encoding: 'utf-8' });
		const report = JSON.parse(out);
		const problems = [];
		const e = testCase.expect;
		if (e.composite !== undefined && !near(report.composite, e.composite)) {
			problems.push(`composite ${report.composite.toFixed(3)} != ${e.composite}`);
		}
		if (e.compositeBelow !== undefined && !(report.composite < e.compositeBelow)) {
			problems.push(`composite ${report.composite.toFixed(3)} not < ${e.compositeBelow}`);
		}
		if (e.synthF1 !== undefined && !near(report.synth.f1, e.synthF1)) {
			problems.push(`synth F1 ${report.synth.f1.toFixed(3)} != ${e.synthF1}`);
		}
		if (e.topicF1 !== undefined && !near(report.topic.f1, e.topicF1)) {
			problems.push(`topic F1 ${report.topic.f1.toFixed(3)} != ${e.topicF1}`);
		}
		if (e.synthPrecision !== undefined && !near(report.synth.precision, e.synthPrecision)) {
			problems.push(`synth precision ${report.synth.precision.toFixed(3)} != ${e.synthPrecision}`);
		}
		if (e.synthPrecisionBelow !== undefined && !(report.synth.precision < e.synthPrecisionBelow)) {
			problems.push(`synth precision ${report.synth.precision.toFixed(3)} not < ${e.synthPrecisionBelow}`);
		}
		if (e.synthRecall !== undefined && !near(report.synth.recall, e.synthRecall)) {
			problems.push(`synth recall ${report.synth.recall.toFixed(3)} != ${e.synthRecall}`);
		}
		if (e.pairRecoveryRate !== undefined && !near(report.synth.pairRecoveryRate, e.pairRecoveryRate)) {
			problems.push(
				`pair recovery ${report.synth.pairRecoveryRate.toFixed(3)} != ${e.pairRecoveryRate}`,
			);
		}

		if (problems.length === 0) {
			console.info(`✅ ${testCase.name}  → accuracy ${report.composite.toFixed(3)}`);
		} else {
			failures++;
			console.error(`❌ ${testCase.name}`);
			for (const p of problems) console.error(`     ${p}`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

console.info(`\n${failures === 0 ? '✅ scorer self-test PASSED' : `❌ ${failures} case(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
