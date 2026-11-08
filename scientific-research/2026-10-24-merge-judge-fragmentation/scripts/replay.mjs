#!/usr/bin/env node
/**
 * Replay a merge judge against the 8 benchmark end states.
 *
 * For each run and each sample k (independent judge calls at temperature 0, cached
 * by prompt hash plus sample index): offer the end state's visible themes to the
 * judge, apply its groups exactly as `consolidateThemes` does, offer the merged set
 * again, and repeat until it proposes nothing (max ROUNDS; the live cron does one
 * round per theme-set change). Report, per pair of themes that share a true topic,
 * whether the FIRST round proposed the merge, plus topic P/R/F1 before and after.
 *
 *   usage: node replay.mjs --variant=<name> [--samples=3] [--runs=a,b] [--lib=main|worktree]
 *   variants: baseline (compiled groupEquivalentThemes) | others in variants.mjs
 *   out:     results/replay-<variant>.json, results/cache-<variant>.jsonl
 *
 * Key comes from functions/.env (never written to the output).
 */
import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { RUNS, STUDY, loadEnv, loadState, topicPairs, applyGroups, score, visibleThemesForJudge, largestShare, compiled, sha, jsonlCache } from './common.mjs';
import { judgeFor } from './variants.mjs';

/** Only the `shipped` variant needs it: build after applying candidate-fix.patch. */
function optionalPlanner(which) {
	try {
		return compiled(which, 'synthesis/pipeline/themeMergePlanner.js');
	} catch {
		return undefined;
	}
}

const arg = (n, d) => {
	const a = process.argv.find((x) => x.startsWith(`--${n}=`));

	return a ? a.slice(n.length + 3) : d;
};
const VARIANT = arg('variant', 'baseline');
const SAMPLES = Number(arg('samples', '3'));
const ROUNDS = 3;
const runs = arg('runs') ? arg('runs').split(',') : RUNS;
const lib = arg('lib', 'main');

loadEnv();
mkdirSync(join(STUDY, 'results'), { recursive: true });
const cacheFile = join(STUDY, `results/cache-${VARIANT}.jsonl`);
const cache = jsonlCache(cacheFile);
let calls = 0;

async function cachedJudge(judge, key, input) {
	if (cache.has(key)) return cache.get(key);
	const value = await judge(input);
	calls++;
	cache.set(key, value);
	appendFileSync(cacheFile, JSON.stringify({ key, value }) + '\n');

	return value;
}

const judge = judgeFor(VARIANT, compiled(lib, 'services/integration-ai-service.js'), compiled(lib, 'config/gemini.js'), optionalPlanner(lib));
const out = { variant: VARIANT, samples: SAMPLES, runs: {} };

async function replayRun(run) {
	const state = loadState(run);
	const pairs = topicPairs(state.themes);
	const base = score(state, state.results, 'base');
	const rec = {
		before: { ...base, largestShare: largestShare(state.results, state) },
		pairs: pairs.map(([a, b]) => ({ a: a.id, b: b.id, topic: a.dominant, aTitle: a.title, bTitle: b.title, aN: a.statementIds.length, bN: b.statementIds.length, proposedInRound1: 0 })),
		samples: [],
	};
	for (let k = 0; k < SAMPLES; k++) {
		let results = state.results;
		const rounds = [];
		for (let r = 0; r < ROUNDS; r++) {
			const themes = visibleThemesForJudge(results);
			const input = { themes, questionContext: state.question, run, results, state };
			const key = sha(`${VARIANT}|${run}|${k}|${r}|${JSON.stringify(themes)}`);
			const groups = await cachedJudge(judge, key, input);
			if (r === 0) {
				const grp = new Map();
				groups.forEach((g, gi) => g.ids.forEach((id) => grp.set(id, gi)));
				for (const p of rec.pairs) if (grp.has(p.a) && grp.get(p.a) === grp.get(p.b)) p.proposedInRound1++;
			}
			rounds.push(groups.map((g) => ({ ids: g.ids, title: g.title })));
			if (groups.length === 0) break;
			results = applyGroups(results, groups);
		}
		const sc = score(state, results, `${VARIANT}-${k}`);
		rec.samples.push({ k, rounds, after: { ...sc, largestShare: largestShare(results, state) } });
	}
	return [run, rec];
}

function report(run, rec) {
	const mean = (f) => rec.samples.reduce((s, x) => s + f(x.after), 0) / rec.samples.length;
	console.info(
		`${run.padEnd(32)} themes ${rec.before.themes}->${mean((a) => a.themes).toFixed(1)}  P ${rec.before.precision.toFixed(3)}->${mean((a) => a.precision).toFixed(3)}  R ${rec.before.recall.toFixed(3)}->${mean((a) => a.recall).toFixed(3)}  F1 ${rec.before.f1.toFixed(3)}->${mean((a) => a.f1).toFixed(3)}  pairsProposed ${rec.pairs.filter((p) => p.proposedInRound1 > 0).length}/${rec.pairs.length}`,
	);
}

// Runs are independent; replay them concurrently (the judge is a slow reasoning model).
for (const [run, rec] of await Promise.all(runs.map(replayRun))) {
	out.runs[run] = rec;
	report(run, rec);
}
writeFileSync(join(STUDY, `results/replay-${VARIANT}.json`), JSON.stringify(out, null, 1));
console.info(`new judge calls: ${calls}`);
