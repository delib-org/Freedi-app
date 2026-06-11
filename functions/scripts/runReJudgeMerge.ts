/**
 * Manual cross-synth reJudge merge (emulator only).
 *
 * Faithful re-implementation of `fn_synthesisReJudge`'s `processParent` for a
 * single parent. The production sweep is onSchedule('every 10 minutes') and
 * does not fire in the emulator, so duplicate synths the live pipeline created
 * under spawn-debounce conditions never get merged locally.
 *
 * Logic mirrors functions/src/synthesis/scheduled/fn_synthesisReJudge.ts:
 *   - threshold = 0.82 (REJUDGE_MERGE_THRESHOLD)
 *   - pair score = top-2 average of all cross-member cosines
 *   - recipient = larger synth (tie → earlier createdAt); donor hidden with
 *     `mergedInto`, members unioned into recipient.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/runReJudgeMerge.ts <questionId>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}
const parentId = process.argv[2];
if (!parentId) {
	console.error('Usage: npx tsx scripts/runReJudgeMerge.ts <questionId>');
	process.exit(1);
}
if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();
const REJUDGE_MERGE_THRESHOLD = 0.82;
const MAX_MERGES_PER_PARENT = 10;

interface Synth {
	id: string;
	statement: string;
	createdAt: number;
	members: string[];
}

function cosine(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;

	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function extractEmbedding(raw: unknown): number[] | null {
	if (!raw) return null;
	if (Array.isArray(raw)) return raw as number[];
	if (typeof raw === 'object' && raw !== null && 'toArray' in raw) {
		try {
			return (raw as { toArray: () => number[] }).toArray();
		} catch {
			return null;
		}
	}

	return null;
}

interface MergeDecision {
	recipientIdx: number;
	donorIdx: number;
	bestCosine: number;
}

function pickMergePair(synths: Synth[], emb: Map<string, number[]>): MergeDecision | null {
	let best: MergeDecision | null = null;
	for (let i = 0; i < synths.length; i++) {
		for (let j = i + 1; j < synths.length; j++) {
			const a = synths[i];
			const b = synths[j];
			const cross: number[] = [];
			for (const am of a.members) {
				const ae = emb.get(am);
				if (!ae) continue;
				for (const bm of b.members) {
					const be = emb.get(bm);
					if (!be) continue;
					cross.push(cosine(ae, be));
				}
			}
			if (cross.length < 2) continue;
			cross.sort((x, y) => y - x);
			const top2 = (cross[0] + cross[1]) / 2;
			if (top2 >= REJUDGE_MERGE_THRESHOLD) {
				const recipientIdx =
					a.members.length > b.members.length
						? i
						: a.members.length < b.members.length
							? j
							: (a.createdAt ?? 0) <= (b.createdAt ?? 0)
								? i
								: j;
				const donorIdx = recipientIdx === i ? j : i;
				if (!best || top2 > best.bestCosine) best = { recipientIdx, donorIdx, bestCosine: top2 };
			}
		}
	}

	return best;
}

async function main(): Promise<void> {
	const snap = await db
		.collection('statements')
		.where('parentId', '==', parentId)
		.where('derivedByPipeline', '==', 'synthesis')
		.where('hide', '==', false)
		.get();

	const synths: Synth[] = snap.docs.map((d) => {
		const x = d.data();

		return {
			id: x.statementId,
			statement: x.statement ?? '',
			createdAt: x.createdAt ?? 0,
			members: Array.isArray(x.integratedOptions) ? [...x.integratedOptions] : [],
		};
	});
	console.info(`Found ${synths.length} non-hidden synths under ${parentId}:`);
	synths.forEach((s) => console.info(`  ${s.id} (${s.members.length}) ${s.statement.slice(0, 50)}`));
	if (synths.length < 2) {
		console.info('Fewer than 2 synths — nothing to merge.');

		return;
	}

	// Batch-fetch member embeddings directly from statement docs (same source
	// embeddingCache.getBatchEmbeddings reads).
	const memberIds = Array.from(new Set(synths.flatMap((s) => s.members)));
	const emb = new Map<string, number[]>();
	for (let i = 0; i < memberIds.length; i += 30) {
		const batch = memberIds.slice(i, i + 30);
		const qs = await db.collection('statements').where('statementId', 'in', batch).get();
		qs.forEach((d) => {
			const e = extractEmbedding(d.data().embedding);
			if (e) emb.set(d.id, e);
		});
	}
	console.info(`Loaded ${emb.size}/${memberIds.length} member embeddings.\n`);

	let merges = 0;
	while (merges < MAX_MERGES_PER_PARENT && synths.length >= 2) {
		const decision = pickMergePair(synths, emb);
		if (!decision) break;
		const recipient = synths[decision.recipientIdx];
		const donor = synths[decision.donorIdx];
		const mergedMembers = Array.from(new Set([...recipient.members, ...donor.members]));
		const now = Date.now();
		await db.collection('statements').doc(recipient.id).update({
			integratedOptions: mergedMembers,
			lastUpdate: now,
		});
		await db.collection('statements').doc(donor.id).update({
			hide: true,
			mergedInto: recipient.id,
			lastUpdate: now,
		});
		console.info(
			`MERGE @cos=${decision.bestCosine.toFixed(3)}: donor "${donor.statement.slice(0, 38)}" (${donor.members.length}) → recipient "${recipient.statement.slice(0, 38)}" (now ${mergedMembers.length})`,
		);
		recipient.members = mergedMembers;
		synths.splice(decision.donorIdx, 1);
		merges++;
	}
	console.info(`\nDone. ${merges} merge(s).`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('reJudge merge failed:', e);
		process.exit(1);
	});
