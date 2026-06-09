/**
 * Test synthesis on a snapshot WITHOUT UMAP/DBSCAN: build candidate clusters by
 * raw cosine threshold (the live path's geometry: near-duplicates only), then
 * run the PRODUCTION two-tier judge on them. Read-only on the snapshot JSON —
 * no Firestore, no emulator writes, fully re-runnable. Uses the Gemini judge
 * (Vertex ADC) for the gray-band pairs.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/synthTestFromSnapshot.ts \
 *     scripts/snapshots/<qid>.json [--threshold=0.92] [--max-llm-calls=200]
 */
import { readFileSync } from 'node:fs';
import { initializeApp, getApps } from 'firebase-admin/app';

// The two-tier judge uses a Firestore-backed verdict cache. Point it at the
// emulator so this test never writes to a real project; the Gemini judge uses
// Vertex via ADC (GCLOUD_PROJECT). Requires the emulator running on :8081.
if (!process.env.FIRESTORE_EMULATOR_HOST) process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
if (getApps().length === 0) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });

const snapshotPath = process.argv.find((a) => a.endsWith('.json'));
const getArg = (k: string, d: string) => {
	const m = process.argv.find((a) => a.startsWith(`--${k}=`));
	return m ? m.split('=')[1] : d;
};
const THRESHOLD = Number(getArg('threshold', '0.92'));
const MAX_LLM = Number(getArg('max-llm-calls', '200'));
if (!snapshotPath) {
	console.error('Usage: npx tsx scripts/synthTestFromSnapshot.ts scripts/snapshots/<qid>.json [--threshold=0.92]');
	process.exit(1);
}

interface Snapshot {
	questionText: string;
	options: Array<{ id: string; text: string; embedding: number[] }>;
}

async function main(): Promise<void> {
	if (!snapshotPath) return;
	const { twoTierJudge } = await import('../src/synthesis/twoTierJudge');
	const snap = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as Snapshot;
	const opts = snap.options.filter((o) => o.embedding?.length);
	const n = opts.length;

	// Normalize once.
	const V = opts.map((o) => {
		let s = 0;
		for (const x of o.embedding) s += x * x;
		s = Math.sqrt(s) || 1;
		return o.embedding.map((x) => x / s);
	});
	const cos = (a: number[], b: number[]) => {
		let d = 0;
		for (let i = 0; i < a.length; i++) d += a[i] * b[i];
		return d;
	};

	// Candidate clusters = connected components on cosine >= THRESHOLD (live-path geometry).
	const par = Array.from({ length: n }, (_, i) => i);
	const find = (x: number): number => {
		while (par[x] !== x) {
			par[x] = par[par[x]];
			x = par[x];
		}
		return x;
	};
	for (let i = 0; i < n; i++)
		for (let j = i + 1; j < n; j++) {
			if (cos(V[i], V[j]) >= THRESHOLD) {
				const a = find(i);
				const b = find(j);
				if (a !== b) par[a] = b;
			}
		}
	const groups = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const r = find(i);
		if (!groups.has(r)) groups.set(r, []);
		groups.get(r)!.push(i);
	}
	const candidateIdx = [...groups.values()].filter((g) => g.length >= 2);
	const singletons = n - candidateIdx.reduce((a, g) => a + g.length, 0);

	console.info(`\n# Synthesis test (cosine candidates, no UMAP) — threshold=${THRESHOLD}`);
	console.info(`Question: "${snap.questionText.slice(0, 90)}"`);
	console.info(`Options: ${n} | candidate clusters: ${candidateIdx.length} | standalone (singletons): ${singletons}\n`);

	const members = new Map(opts.map((o, i) => [o.id, { id: o.id, text: o.text, embedding: V[i] }]));
	const candidates = candidateIdx.map((g, i) => ({ clusterId: `cand-${i}`, memberIds: g.map((idx) => opts[idx].id) }));

	const judge = await twoTierJudge(candidates, members, { maxLlmCalls: MAX_LLM, autoAcceptBand: 0.94, autoRejectBand: 0.6 });
	const verified = [...judge.verifiedClusters, ...judge.refinedFromDissent];

	console.info(
		`[two-tier judge] ${candidates.length} candidates → ${verified.length} verified synths ` +
			`(llmCalls=${judge.stats.llmCallsMade}, dropped=${judge.droppedClusters.length}, refinedFromDissent=${judge.refinedFromDissent.length})\n`,
	);
	const byId = new Map(opts.map((o) => [o.id, o.text]));
	verified
		.slice()
		.sort((a, b) => b.memberIds.length - a.memberIds.length)
		.forEach((v, k) => {
			console.info(`--- SYNTH ${k + 1} (${v.memberIds.length} members) ---`);
			v.memberIds.forEach((id) => console.info(`   • ${(byId.get(id) ?? id).slice(0, 78)}`));
			console.info('');
		});

	const merged = verified.reduce((a, v) => a + v.memberIds.length, 0);
	console.info(
		`Summary: ${verified.length} synths covering ${merged} options; the other ${n - merged} options stay standalone (correct for distinct ideas).`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('synth test failed:', e);
		process.exit(1);
	});
