/** Print per-pair proposal table and the groups proposed for a replay file. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STUDY } from './common.mjs';

const v = process.argv[2] ?? 'baseline';
const d = JSON.parse(readFileSync(join(STUDY, `results/replay-${v}.json`), 'utf8'));
for (const [run, r] of Object.entries(d.runs)) {
	console.info(`\n== ${run}`);
	for (const p of r.pairs) console.info(`  [${p.topic}] ${p.aTitle} (${p.aN}) + ${p.bTitle} (${p.bN}) -> proposed ${p.proposedInRound1}/${d.samples}`);
	for (const s of r.samples) {
		const t = (id) => (r.pairs.find((p) => p.a === id)?.aTitle ?? r.pairs.find((p) => p.b === id)?.bTitle ?? id.slice(0, 5));
		console.info(`  sample ${s.k} round1: ${s.rounds[0].map((g) => '{' + g.ids.map(t).join(' + ') + ' => ' + g.title + '}').join(' ')}  | after P${s.after.precision.toFixed(3)} R${s.after.recall.toFixed(3)}`);
	}
}
