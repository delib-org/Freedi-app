// Merge two completed annotation sheets → agreement report, disagreement list,
// and (once adjudicated) human labels in the same shape as the provisional ones.
//   node annotation/import-labels.mjs            # agreement + disagreements.csv
//   node annotation/import-labels.mjs --adjudicated=annotation/adjudication.csv
// adjudication.csv: row_id,label   (only rows the two annotators disagreed on)
// Then re-score without re-running:
//   node analyze.mjs --labels=annotation/labels.human.jsonl
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../lib/corpus.mjs';
import { parseArgs, readJson, readJsonl, STUDY_DIR, writeFileAtomic, writeJson, writeJsonl } from '../lib/util.mjs';

const P = (...p) => join(STUDY_DIR, ...p);
const args = parseArgs(process.argv.slice(2));
const LABELS = new Set(['same', 'different', 'unsure']);
const load = (n) => {
	const path = P('annotation', `sheet-annotator-${n}.csv`);
	const rows = parseCsv(readFileSync(path, 'utf8'));
	const blank = rows.filter((r) => !LABELS.has(r.label.trim().toLowerCase()));
	if (blank.length) throw new Error(`${path}: ${blank.length} rows without a label in {same, different, unsure} (first row_id ${blank[0].row_id})`);

	return new Map(rows.map((r) => [`${r.query_id}|${r.candidate_id}|${r.section}`, { ...r, label: r.label.trim().toLowerCase() }]));
};
const a = load(1);
const b = load(2);
const keys = [...a.keys()].filter((k) => b.has(k));

// Cohen's kappa on the binary "same" vs not-same decision.
const bin = (x) => (x === 'same' ? 1 : 0);
let agree = 0;
let pa = 0;
let pb = 0;
for (const k of keys) {
	const x = bin(a.get(k).label);
	const y = bin(b.get(k).label);
	agree += x === y;
	pa += x;
	pb += y;
}
const N = keys.length;
const po = agree / N;
const pe = (pa / N) * (pb / N) + (1 - pa / N) * (1 - pb / N);
const kappa = pe === 1 ? null : (po - pe) / (1 - pe);
const disagreements = keys.filter((k) => a.get(k).label !== b.get(k).label);
writeFileAtomic(
	P('annotation', 'disagreements.csv'),
	['row_id,query_id,candidate_id,annotator_1,annotator_2,query_text,candidate_text']
		.concat(disagreements.map((k) => {
			const r = a.get(k);

			return [r.row_id, r.query_id, r.candidate_id, r.label, b.get(k).label, r.query_text, r.candidate_text].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
		}))
		.join('\n') + '\n',
);
const report = { rows: N, observedAgreement: po, cohensKappaSameVsNot: kappa, disagreements: disagreements.length };
writeJson(P('annotation', 'agreement.json'), report);
console.info(report);

if (args.adjudicated) {
	const adj = new Map(parseCsv(readFileSync(P(args.adjudicated), 'utf8')).map((r) => [String(r.row_id), r.label.trim().toLowerCase()]));
	const final = new Map();
	for (const k of keys) {
		const r = a.get(k);
		const l = a.get(k).label === b.get(k).label ? a.get(k).label : adj.get(String(r.row_id));
		if (!LABELS.has(l ?? '')) throw new Error(`row ${r.row_id}: disagreement not adjudicated`);
		final.set(k, l);
	}
	const provisional = readJsonl(P('frozen', 'labels.jsonl'));
	const pools = new Map(readJson(P('frozen', 'pools.json')).map((p) => [p.queryId, p]));
	const out = [];
	const screeningMisses = [];
	for (const l of provisional) {
		const rows = [...final.entries()].filter(([k]) => k.startsWith(`${l.queryId}|`));
		const same = rows.filter(([, v]) => v === 'same').map(([k]) => k.split('|')[1]);
		const unsure = rows.filter(([, v]) => v === 'unsure').map(([k]) => k.split('|')[1]);
		const core = new Set(pools.get(l.queryId).core);
		const pool500 = new Set(pools.get(l.queryId).sizes[500].ids);
		for (const id of [...same, ...unsure]) if (pool500.has(id) && !core.has(id)) screeningMisses.push({ queryId: l.queryId, id, label: final.get(`${l.queryId}|${id}|shortlist`) ?? final.get(`${l.queryId}|${id}|fill-check`) });
		out.push({
			...l,
			status: same.length ? 'match' : 'none',
			matches: same,
			hardDistractors: l.hardDistractors.filter((h) => !same.includes(h.id)),
			humanUnsure: unsure,
			labelSource: 'human-adjudicated: two independent annotators + adjudication',
		});
	}
	writeJsonl(P('annotation', 'labels.human.jsonl'), out);
	writeJson(P('annotation', 'screening-misses.json'), screeningMisses);
	console.info(`labels.human.jsonl written; ${screeningMisses.length} same/unsure items sit in a pool outside the fixed core (reported by analyze.mjs)`);
	if (!existsSync(P('annotation', 'labels.human.jsonl'))) process.exitCode = 1;
}
