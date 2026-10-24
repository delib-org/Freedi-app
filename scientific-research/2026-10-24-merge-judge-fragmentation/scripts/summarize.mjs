#!/usr/bin/env node
/** Mean topic P/R/F1 per run and variant (mean over replay samples) -> results/summary.json + markdown. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { STUDY, RUNS } from './common.mjs';

const VARIANTS = ['baseline', 'fold', 'small', 'small-vote', 'small-verify', 'shipped'];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const out = { runs: {}, means: {} };
const data = {};
for (const v of VARIANTS) {
	const f = join(STUDY, `results/replay-${v}.json`);
	if (existsSync(f)) data[v] = JSON.parse(readFileSync(f, 'utf8'));
}
const first = data.baseline;
const row = (p, r, f1) => `${p.toFixed(3)} / ${r.toFixed(3)} / ${f1.toFixed(3)}`;
const lines = ['| run | recorded end state (P / R / F1) | ' + Object.keys(data).join(' | ') + ' |', '|---|---|' + Object.keys(data).map(() => '---|').join('')];
const acc = { recorded: [] };
for (const v of Object.keys(data)) acc[v] = [];
for (const run of RUNS) {
	const b = first.runs[run].before;
	acc.recorded.push([b.precision, b.recall, b.f1]);
	const cells = [];
	out.runs[run] = { recorded: { precision: b.precision, recall: b.recall, f1: b.f1, themes: b.themes, largestShare: b.largestShare } };
	for (const v of Object.keys(data)) {
		const s = data[v].runs[run].samples.map((x) => x.after);
		const m = [mean(s.map((x) => x.precision)), mean(s.map((x) => x.recall)), mean(s.map((x) => x.f1))];
		acc[v].push(m);
		cells.push(row(...m));
		out.runs[run][v] = { precision: m[0], recall: m[1], f1: m[2], themes: mean(s.map((x) => x.themes)), samples: s.length };
	}
	lines.push(`| ${run} | ${row(b.precision, b.recall, b.f1)} | ${cells.join(' | ')} |`);
}
const col = (k, i) => mean(acc[k].map((x) => x[i]));
lines.push(`| **mean** | ${row(col('recorded', 0), col('recorded', 1), col('recorded', 2))} | ${Object.keys(data).map((v) => row(col(v, 0), col(v, 1), col(v, 2))).join(' | ')} |`);
for (const k of ['recorded', ...Object.keys(data)]) out.means[k] = { precision: col(k, 0), recall: col(k, 1), f1: col(k, 2) };
writeFileSync(join(STUDY, 'results/summary.json'), JSON.stringify(out, null, 1));
console.info(lines.join('\n'));
