/**
 * Writes the fixed 150-triplet pilot sample (stratified by dataset, seeded)
 * to results/pilot-ids.json. Idempotent — same seed, same sample.
 *
 * Usage: npx tsx make-pilot-sample.ts [--n 150]
 */
import { writeFileSync } from 'node:fs';
import { loadTriplets, stratifiedSample } from './lib/datasets';
import { resultsPath } from './lib/io';

const args = process.argv.slice(2);
const nIndex = args.indexOf('--n');
const n = nIndex >= 0 ? Number(args[nIndex + 1]) : 150;

const triplets = loadTriplets('main');
const sample = stratifiedSample(triplets, n);
const counts = new Map<string, number>();
for (const t of sample) counts.set(t.dataset, (counts.get(t.dataset) ?? 0) + 1);

const out = resultsPath('pilot-ids.json');
writeFileSync(out, JSON.stringify(sample.map((t) => t.id), null, '\t'));
console.info(`Wrote ${sample.length} pilot ids → ${out}`);
for (const [dataset, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
	console.info(`  ${count}\t${dataset}`);
}
