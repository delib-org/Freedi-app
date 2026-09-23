// Blinded annotation sheets for two independent human annotators. Offline.
//   node annotation/make-sheets.mjs
// Each sheet lists, per query, every shortlist item (the screening union) in a
// per-annotator seeded order, plus a shared random sample of 20 fill items that
// were NOT on any shortlist (tests the "off-shortlist = non-match" assumption).
// Provisional labels, cosine ranks, and method outputs are deliberately absent.
import { readJson, readJsonl, writeFileAtomic, STUDY_DIR } from '../lib/util.mjs';
import { cellSeed, seededShuffle } from '../lib/rng.mjs';
import { join } from 'node:path';

const P = (...p) => join(STUDY_DIR, ...p);
const queries = readJsonl(P('frozen', 'queries.jsonl'));
const shortlists = new Map(readJsonl(P('annotation', 'shortlists.jsonl')).map((r) => [r.candidateId, r]));
const pools = new Map(readJson(P('frozen', 'pools.json')).map((p) => [p.queryId, p]));
const text = new Map(readJsonl(P('data', 'bank-all.jsonl')).map((x) => [x.id, x.text]));
const queryIds = new Set(queries.map((q) => q.id));

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const header = ['row_id', 'section', 'query_id', 'query_text', 'candidate_id', 'candidate_text', 'label', 'why_separate_or_note'];

// Shared fill spot-check: 20 (query, item) pairs from the 500-pools, off-shortlist.
const offShortlist = [];
for (const q of queries.filter((x) => x.split === 'test')) {
	const sl = new Set(shortlists.get(q.id).shortlist.map((x) => x.id));
	for (const id of pools.get(q.id).sizes[500].ids) if (!sl.has(id)) offShortlist.push([q.id, id]);
}
const fillSample = seededShuffle(offShortlist.map(([q, id]) => `${q}|${id}`).sort(), cellSeed(2026, 'fill-check')).slice(0, 20).map((s) => s.split('|'));

for (const annotator of [1, 2]) {
	const rows = [];
	let n = 0;
	for (const q of queries) {
		const items = shortlists.get(q.id).shortlist.map((x) => x.id).filter((id) => !queryIds.has(id));
		for (const id of seededShuffle(items.sort(), cellSeed(annotator, q.id))) rows.push([++n, 'shortlist', q.id, q.text, id, text.get(id), '', '']);
	}
	for (const [qid, id] of fillSample) rows.push([++n, 'fill-check', qid, queries.find((q) => q.id === qid).text, id, text.get(id), '', '']);
	writeFileAtomic(P('annotation', `sheet-annotator-${annotator}.csv`), [header, ...rows].map((r) => r.map(csv).join(',')).join('\n') + '\n');
	console.info(`sheet ${annotator}: ${rows.length} rows`);
}
