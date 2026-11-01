#!/usr/bin/env node
/**
 * Bq-VQPMPiG7b (production v3 state, 114 real statements, 7 themes): what would a
 * merge judge do, and does any theme become a catch-all?
 *
 * The state file is built by ../../2026-10-24-theme-refile-pass/scripts/bq_state.py
 * and holds participant text, so it lives OUTSIDE git (scratchpad). This script
 * prints only counts and theme titles (themes are admin/AI labels).
 *
 *   usage: node bq.mjs --state=<bq-v3-state.json> --variant=<name> [--samples=3] [--lib=worktree]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDY, loadEnv, compiled, applyGroups, visibleThemesForJudge } from './common.mjs';
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
const lib = arg('lib', 'main');
loadEnv();

const bq = JSON.parse(readFileSync(arg('state'), 'utf8'));
const stmtCount = new Map(bq.atoms.map((a) => [a.id, a.memberIds.length]));
const results = {
	synths: { items: bq.atoms.map((a) => ({ id: a.id, title: a.title })) },
	topicClusters: {
		items: bq.themes.map((t) => ({ id: t.id, title: t.title, hidden: false, memberSynthIds: t.atomIds, members: [] })),
	},
};
const state = { results, stmts: { statements: [] } };
const judge = judgeFor(VARIANT, compiled(lib, 'services/integration-ai-service.js'), compiled(lib, 'config/gemini.js'), optionalPlanner(lib));

function shares(res) {
	const sizes = res.topicClusters.items
		.filter((t) => !t.hidden)
		.map((t) => ({ title: t.title, n: t.memberSynthIds.reduce((s, a) => s + (stmtCount.get(a) ?? 1), 0) }));
	const total = sizes.reduce((s, x) => s + x.n, 0);

	return { themes: sizes.length, themed: total, largest: Math.max(...sizes.map((s) => s.n)) / total, sizes: sizes.map((s) => s.n).sort((a, b) => b - a) };
}

const out = { variant: VARIANT, before: shares(results), samples: [] };
for (let k = 0; k < SAMPLES; k++) {
	let res = results;
	const rounds = [];
	for (let r = 0; r < 3; r++) {
		const themes = visibleThemesForJudge(res);
		const groups = await judge({ themes, questionContext: bq.question, results: res, state: { ...state, results: res } });
		rounds.push(groups.map((g) => ({ themeIds: g.ids })));
		if (groups.length === 0) break;
		res = applyGroups(res, groups);
	}
	out.samples.push({ k, rounds, after: shares(res) });
	console.info(`sample ${k}: themes ${out.before.themes} -> ${shares(res).themes}, largest ${(out.before.largest * 100).toFixed(0)}% -> ${(shares(res).largest * 100).toFixed(0)}%`, JSON.stringify(rounds[0]));
}
writeFileSync(join(STUDY, `results/bq-${VARIANT}.json`), JSON.stringify(out, null, 1));
