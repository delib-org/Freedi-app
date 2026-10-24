#!/usr/bin/env node
/**
 * Merge-level quality of each variant's FIRST-round groups, independent of the
 * score: for every pair of themes put in one group, is it a pair that shares a
 * true topic (good) or not (a wrong merge, which drops precision)?
 *
 *   usage: node mergeQuality.mjs <variant> [<variant> ...]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STUDY, RUNS, loadState, topicPairs } from './common.mjs';

for (const v of process.argv.slice(2)) {
	const f = join(STUDY, `results/replay-${v}.json`);
	if (!existsSync(f)) continue;
	const d = JSON.parse(readFileSync(f, 'utf8'));
	let good = 0;
	let bad = 0;
	let found = 0;
	let possible = 0;
	const badList = [];
	for (const run of RUNS) {
		const st = loadState(run);
		const dom = new Map(st.themes.map((t) => [t.id, t.dominant]));
		const title = new Map(st.themes.map((t) => [t.id, t.title]));
		const rec = d.runs[run];
		possible += topicPairs(st.themes).length * d.samples;
		for (const s of rec.samples) {
			const pairsSeen = new Set();
			for (const g of s.rounds[0]) {
				for (let i = 0; i < g.ids.length; i++) {
					for (let j = i + 1; j < g.ids.length; j++) {
						const same = dom.get(g.ids[i]) === dom.get(g.ids[j]);
						same ? good++ : bad++;
						if (same) found++;
						pairsSeen.add(`${g.ids[i]}|${g.ids[j]}`);
						if (!same) badList.push(`${run}: ${title.get(g.ids[i])} + ${title.get(g.ids[j])}`);
					}
				}
			}
		}
	}
	console.info(`${v.padEnd(12)} merged pairs per sample-set: right ${good}, wrong ${bad}  (of ${possible} possible right pairs across samples; recall of pairs ${(found / possible).toFixed(2)})`);
	if (process.env.VERBOSE) console.info([...new Set(badList)].join('\n'));
}
