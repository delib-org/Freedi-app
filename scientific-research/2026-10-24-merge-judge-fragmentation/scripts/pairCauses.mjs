#!/usr/bin/env node
/**
 * Step 1 deliverable: every pair of themes that share a true topic, across the 8
 * end states, with what consolidateThemes did or could have done.
 *
 * Causes recorded per pair:
 *   proposed   the shipped judge put the pair in one group in >= 1 of the replay samples
 *   refused    both themes visible, judge asked, pair never grouped (0 of N samples)
 *   late       the younger theme appeared after the last consolidate merge event in the
 *              run's audit log (the sweep may simply not have run on this pair yet)
 * Mechanical blockers, checked once for the whole state (not per pair):
 *   min-themes   the sweep needs >= 3 themes (MIN_THEMES_TO_CONSOLIDATE)
 *   cap          MAX_MERGES_PER_SWEEP = 8 groups; compared with groups the judge returned
 *   sibling      a group of themes that share `splitFrom` is refused; counted from the state
 *
 *   usage: node pairCauses.mjs   (reads results/replay-baseline.json)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUNS, STUDY, SCI, loadState, topicPairs } from './common.mjs';

const MIN_THEMES = 3;
const MAX_MERGES = 8;
const rep = JSON.parse(readFileSync(join(STUDY, 'results/replay-baseline.json'), 'utf8'));
const rows = [];
const perRun = {};

for (const run of RUNS) {
	const st = loadState(run);
	const audit = JSON.parse(readFileSync(join(SCI, '2026-08-18-live-synth-accuracy/runs', run, 'audit.json'), 'utf8'));
	const created = new Map();
	for (const e of audit) if (/themeCreate/.test(e.triggerSource ?? '') && e.clusterId) created.set(e.clusterId, e.timestamp);
	const consolidates = audit.filter((e) => /themeConsolidate/.test(e.triggerSource ?? ''));
	const lastConsolidate = consolidates.length ? Math.max(...consolidates.map((e) => e.timestamp)) : null;
	const splitSiblings = st.results.topicClusters.items.filter((t) => t.splitFrom).length;
	const r = rep.runs[run];
	const maxGroups = Math.max(0, ...r.samples.flatMap((s) => s.rounds.map((g) => g.length)));
	perRun[run] = {
		themes: st.themes.length,
		minThemesBlocks: st.themes.length < MIN_THEMES,
		maxGroupsReturnedByJudge: maxGroups,
		capReached: maxGroups >= MAX_MERGES,
		splitSiblingThemes: splitSiblings,
		consolidateMergeEventsInRun: consolidates.length,
		sharedTopicPairs: r.pairs.length,
	};
	for (const p of r.pairs) {
		const younger = Math.max(created.get(p.a) ?? 0, created.get(p.b) ?? 0);
		const late = lastConsolidate !== null && younger > lastConsolidate;
		rows.push({
			run,
			topic: p.topic,
			a: p.aTitle,
			b: p.bTitle,
			statementsA: p.aN,
			statementsB: p.bN,
			smallSide: Math.min(p.aN, p.bN),
			proposedInSamples: `${p.proposedInRound1}/${rep.samples}`,
			cause: p.proposedInRound1 > 0 ? 'proposed' : late ? 'late' : 'refused',
		});
	}
}

const tally = rows.reduce((m, r) => ((m[r.cause] = (m[r.cause] ?? 0) + 1), m), {});
const small = rows.filter((r) => r.smallSide <= 2).length;
const summary = { pairs: rows.length, tally, pairsWithAHeadingOfOneSynthesis: small, perRun };
writeFileSync(join(STUDY, 'results/pair-causes.json'), JSON.stringify({ summary, rows }, null, 1));
console.info(JSON.stringify(summary, null, 1));
for (const r of rows) console.info(`${r.run.padEnd(30)} ${r.cause.padEnd(9)} ${r.proposedInSamples}  ${r.a} (${r.statementsA}) + ${r.b} (${r.statementsB})`);
