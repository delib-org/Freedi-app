/**
 * Offline clustering replication — re-derives a validation run's cluster
 * STRUCTURE from its shipped embeddings, using the real pipeline primitive
 * (`bulkClusterByEmbedding`). No Firestore, no OpenAI, no emulator.
 *
 * A replicating scientist runs this against a committed validation folder to
 * confirm that the UMAP->DBSCAN clustering reproduces the reported synths from
 * the exact input embeddings — independent of the embedding API (which may
 * drift across model versions) and independent of any live state.
 *
 * USAGE (from functions/):
 *   npx tsx scripts/verifyFromEmbeddings.ts <validation-folder> [--eps=0.8] [--seed=42]
 *   e.g. npx tsx scripts/verifyFromEmbeddings.ts \
 *         ../scientific-research/2026-06-14-synthesis-clustering-validation/validation/1-6-2026-40-20-10-validation
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bulkClusterByEmbedding } from '../src/synthesis/bulkCluster';

const dir = process.argv.find((a, i) => i >= 2 && !a.startsWith('--'));
const getArg = (k: string, d: string) => {
	const m = process.argv.find((a) => a.startsWith(`--${k}=`));

	return m ? m.split('=')[1] : d;
};
if (!dir) {
	console.error('Usage: npx tsx scripts/verifyFromEmbeddings.ts <validation-folder> [--eps=0.8] [--seed=42]');
	process.exit(1);
}
const EPS = Number(getArg('eps', '0.8'));
const SEED = Number(getArg('seed', '42'));

const emb = JSON.parse(readFileSync(join(dir, 'embeddings.json'), 'utf-8'));
const statements = JSON.parse(readFileSync(join(dir, 'statements.json'), 'utf-8'));
const gtSynth = new Map<string, string>(statements.statements.map((s: { id: string; groundTruthSynth: string }) => [s.id, s.groundTruthSynth]));

const items = Object.entries(emb.embeddings as Record<string, number[]>).map(([id, embedding]) => ({ id, embedding }));
console.info(`Loaded ${items.length} embeddings (${emb.model}, ${emb.dimensions}-d) from ${dir}`);
console.info(`Re-clustering with bulkClusterByEmbedding(eps=${EPS}, seed=${SEED})…\n`);

const result = bulkClusterByEmbedding(items, { dbscanEps: EPS, seed: SEED });

let allPure = true;
result.clusters.forEach((c, i) => {
	const dist: Record<string, number> = {};
	for (const id of c.memberIds) {
		const lbl = gtSynth.get(id) ?? '?';
		dist[lbl] = (dist[lbl] ?? 0) + 1;
	}
	const labels = Object.entries(dist).sort((a, b) => b[1] - a[1]);
	const [domLabel, domCount] = labels[0] ?? ['?', 0];
	const purity = c.memberIds.length ? domCount / c.memberIds.length : 0;
	const pure = purity === 1;
	allPure &&= pure;
	console.info(`  cluster ${i}: ${c.memberIds.length} members | ${(purity * 100).toFixed(0)}% pure (${domLabel})${labels.length > 1 ? ' MIXED: ' + JSON.stringify(dist) : ''}`);
});
if (result.noiseIds.length) console.info(`  noise: ${result.noiseIds.length}`);

const expectClusters = new Set([...gtSynth.values()]).size;
const ok = result.clusters.length === expectClusters && result.noiseIds.length === 0 && allPure && result.clusters.every((c) => c.memberIds.length === 10);
console.info(
	`\n${ok ? '✅ REPRODUCED' : '⚠️ DIFFERS'} — ${result.clusters.length} clusters (expected ${expectClusters}), ` +
		`${result.noiseIds.length} noise, ${allPure ? 'all 100% pure' : 'NOT all pure'}.`,
);
console.info('(Cluster TITLES are LLM-generated and intentionally not reproduced here — only the membership structure is deterministic.)');
process.exit(ok ? 0 : 1);
