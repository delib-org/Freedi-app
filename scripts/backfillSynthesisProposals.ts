/**
 * Backfill: re-run the synthesis-proposal LLM on every existing cluster
 * with `derivedByPipeline === 'synthesis'` so its title/description/
 * paragraph-children are rewritten by the new proposal-style generator
 * instead of the legacy heuristic merge.
 *
 * Calls `generateSynthesizedProposal` directly (same code path the
 * callable `regenerateSynthesisProposal` uses) to avoid HTTP per cluster.
 *
 * USAGE
 *   - Local emulator:
 *       FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *         npx tsx scripts/backfillSynthesisProposals.ts
 *
 *   - Production (read-write — be careful):
 *       gcloud auth application-default login
 *       GCLOUD_PROJECT=<prod-project-id> \
 *         npx tsx scripts/backfillSynthesisProposals.ts --confirm-prod
 *
 *   Optional flags:
 *     --dry-run                 List clusters that would change without writing
 *     --parent <statementId>    Limit to a single parent question's clusters
 *     --limit <n>               Process at most N clusters (handy for sampling)
 *     --concurrency <n>         Number of clusters to process in parallel (default 2)
 *     --skip-split              When LLM refuses with directional split,
 *                               skip the cluster instead of logging it
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ----------------------------------------------------------------------
// Args + safety guards
// ----------------------------------------------------------------------
function getArg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return undefined;

	return process.argv[idx + 1];
}
function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

const isEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const confirmProd = hasFlag('--confirm-prod');

if (!isEmulator && !confirmProd) {
	console.error(
		'This script will WRITE to a real Firestore project. Pass --confirm-prod to opt in,',
	);
	console.error(
		'or set FIRESTORE_EMULATOR_HOST to point at the emulator first.',
	);
	process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
	console.error('Set GCLOUD_PROJECT to the target project id.');
	process.exit(1);
}

const dryRun = hasFlag('--dry-run');
const parentFilter = getArg('--parent');
const limit = Number(getArg('--limit') ?? Number.POSITIVE_INFINITY);
const concurrency = Math.max(1, Number(getArg('--concurrency') ?? 2));
const skipSplit = hasFlag('--skip-split');

if (getApps().length === 0) initializeApp({ projectId });
const db = getFirestore();

// ----------------------------------------------------------------------
// Local copy of the LLM call. We intentionally import from the functions
// source so the prompt stays in sync — this script is meant to run from
// the repo root.
// ----------------------------------------------------------------------
import {
	generateSynthesizedProposal,
	StatementWithEvaluation,
} from '../functions/src/services/integration-ai-service';
import { Collections, Statement, StatementType } from '@freedi/shared-types';

interface ClusterToBackfill {
	clusterId: string;
	parentId: string;
	topParentId: string;
	parentParents: string[];
	creator: Statement['creator'];
	creatorId: string;
	memberIds: string[];
	title: string;
}

async function loadClusters(): Promise<ClusterToBackfill[]> {
	let q = db
		.collection(Collections.statements)
		.where('derivedByPipeline', '==', 'synthesis')
		.where('isCluster', '==', true);
	if (parentFilter) {
		q = q.where('parentId', '==', parentFilter);
	}
	const snap = await q.get();
	const out: ClusterToBackfill[] = [];
	for (const doc of snap.docs) {
		const d = doc.data() as Statement;
		if (!d.parentId || !Array.isArray(d.integratedOptions) || d.integratedOptions.length === 0) {
			continue;
		}
		// Skip soft-hidden clusters (reversed) — they shouldn't be regenerated.
		if (d.hide === true) continue;
		out.push({
			clusterId: d.statementId,
			parentId: d.parentId,
			topParentId: d.topParentId || d.parentId,
			parentParents: d.parents ?? [],
			creator: d.creator,
			creatorId: d.creatorId || '',
			memberIds: d.integratedOptions,
			title: d.statement,
		});
	}

	return out.slice(0, Number.isFinite(limit) ? limit : out.length);
}

async function loadParentQuestionText(parentId: string): Promise<string> {
	const doc = await db.collection(Collections.statements).doc(parentId).get();
	if (!doc.exists) return parentId;
	const data = doc.data() as Statement;

	return data.statement || parentId;
}

async function loadMembers(memberIds: string[]): Promise<StatementWithEvaluation[]> {
	const out: StatementWithEvaluation[] = [];
	for (const id of memberIds) {
		const doc = await db.collection(Collections.statements).doc(id).get();
		if (!doc.exists) continue;
		const data = doc.data() as Statement;
		out.push({
			statementId: id,
			statement: data.statement || '',
			paragraphsText: '',
			numberOfEvaluators: data.evaluation?.numberOfEvaluators ?? 0,
			consensus: data.consensus ?? data.evaluation?.agreement ?? 0,
			sumEvaluations: data.evaluation?.sumEvaluations ?? 0,
		});
	}

	return out;
}

interface BackfillStats {
	processed: number;
	rewritten: number;
	skippedSplit: number;
	failed: number;
}

async function backfillOne(
	cluster: ClusterToBackfill,
	stats: BackfillStats,
): Promise<void> {
	console.info(`\n→ ${cluster.clusterId}  members=${cluster.memberIds.length}  current="${cluster.title.slice(0, 60)}…"`);

	let questionContext: string;
	let inputs: StatementWithEvaluation[];
	try {
		[questionContext, inputs] = await Promise.all([
			loadParentQuestionText(cluster.parentId),
			loadMembers(cluster.memberIds),
		]);
	} catch (err) {
		console.error(`  load failed: ${err}`);
		stats.failed++;

		return;
	}

	if (inputs.length === 0) {
		console.warn('  no source statements found — skipping');
		stats.failed++;

		return;
	}

	let proposal;
	try {
		proposal = await generateSynthesizedProposal(inputs, questionContext);
	} catch (err) {
		console.error(`  LLM error: ${err}`);
		stats.failed++;

		return;
	}

	if (proposal.cannotSynthesize === true) {
		console.warn(`  LLM refused (directional split): ${proposal.reason}`);
		if (!skipSplit) {
			console.warn(
				`  splitProposal: ${
					proposal.splitProposal
						? proposal.splitProposal.map((g) => g.length).join(' / ')
						: '(none)'
				}`,
			);
		}
		stats.skippedSplit++;

		return;
	}

	console.info(`  new title: "${proposal.title}"`);
	console.info(`  paragraphs: ${proposal.paragraphs.length}`);

	if (dryRun) {
		console.info('  [dry-run] not writing');
		stats.rewritten++;

		return;
	}

	const cachedDescription =
		proposal.paragraphs.find((p) => p.trim().length > 0)?.trim() ||
		proposal.description.trim() ||
		'';

	try {
		const existingParagraphsSnap = await db
			.collection(Collections.statements)
			.where('parentId', '==', cluster.clusterId)
			.where('statementType', '==', StatementType.paragraph)
			.get();

		const now = Date.now();
		const batch = db.batch();
		existingParagraphsSnap.forEach((d) => batch.delete(d.ref));

		proposal.paragraphs.forEach((text, idx) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const childId = db.collection(Collections.statements).doc().id;
			const childCreatedAt = now + idx;
			batch.set(db.collection(Collections.statements).doc(childId), {
				statementId: childId,
				statement: trimmed,
				statementType: StatementType.paragraph,
				parentId: cluster.clusterId,
				topParentId: cluster.topParentId,
				parents: [...cluster.parentParents, cluster.parentId, cluster.clusterId],
				creatorId: cluster.creatorId,
				creator: cluster.creator,
				createdAt: childCreatedAt,
				lastUpdate: childCreatedAt,
				consensus: 0,
			});
		});

		batch.update(db.collection(Collections.statements).doc(cluster.clusterId), {
			statement: proposal.title.trim(),
			description: cachedDescription,
			paragraphs: [],
			lastUpdate: now,
			lastChildUpdate: now,
		});

		await batch.commit();
		stats.rewritten++;
	} catch (err) {
		console.error(`  write failed: ${err}`);
		stats.failed++;
	}
}

(async () => {
	console.info(
		`Backfill: project=${projectId} emulator=${isEmulator} dryRun=${dryRun} concurrency=${concurrency}` +
			(parentFilter ? ` parent=${parentFilter}` : '') +
			(Number.isFinite(limit) ? ` limit=${limit}` : ''),
	);

	const clusters = await loadClusters();
	console.info(`Loaded ${clusters.length} synthesis cluster(s) to backfill.`);
	if (clusters.length === 0) return;

	const stats: BackfillStats = { processed: 0, rewritten: 0, skippedSplit: 0, failed: 0 };

	// Simple bounded parallelism: pop from a queue with `concurrency` workers.
	const queue = [...clusters];
	const workers: Promise<void>[] = [];
	for (let i = 0; i < concurrency; i++) {
		workers.push(
			(async () => {
				while (queue.length > 0) {
					const next = queue.shift();
					if (!next) break;
					stats.processed++;
					await backfillOne(next, stats);
				}
			})(),
		);
	}
	await Promise.all(workers);

	console.info('\n=== Done ===');
	console.info(`processed:    ${stats.processed}`);
	console.info(`rewritten:    ${stats.rewritten}`);
	console.info(`split-skipped: ${stats.skippedSplit}`);
	console.info(`failed:       ${stats.failed}`);
})().catch((e) => {
	console.error('Backfill crashed:', e);
	process.exit(1);
});
