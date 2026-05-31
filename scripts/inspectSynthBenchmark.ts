/**
 * Diagnostic dump for the synth benchmark question. Reads:
 *   - The audit log: _liveSynthAuditLog for the question
 *   - The candidate (gray-band) queue: _liveSynthCandidates for the question
 *   - All statements under the question (clusters, synths, hidden, visible)
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/inspectSynthBenchmark.ts <questionId>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const QUESTION_ID = process.argv[2];
if (!QUESTION_ID) {
	console.error('Usage: npx tsx scripts/inspectSynthBenchmark.ts <questionId>');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

(async () => {
	console.info(`\n=== Inspecting question ${QUESTION_ID} ===\n`);

	const auditSnap = await db
		.collection('_synthAuditLog')
		.where('parentStatementId', '==', QUESTION_ID)
		.get();
	console.info(`--- _liveSynthAuditLog (${auditSnap.size} events) ---`);
	const eventCounts: Record<string, number> = {};
	for (const doc of auditSnap.docs) {
		const d = doc.data();
		const ev = (d.action as string) ?? 'unknown';
		eventCounts[ev] = (eventCounts[ev] ?? 0) + 1;
	}
	for (const [ev, n] of Object.entries(eventCounts)) {
		console.info(`  ${ev}: ${n}`);
	}
	// Print last 40 events for context
	const recent = auditSnap.docs
		.map((d) => d.data())
		.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
		.slice(-40);
	console.info('  --- last 40 events ---');
	for (const ev of recent) {
		const t = new Date(ev.timestamp ?? 0).toISOString().slice(11, 23);
		const reason = ev.reason ? ` (${(ev.reason as string).slice(0, 50)})` : '';
		console.info(
			`  [${t}] ${ev.action} opt=${(ev.optionId ?? '').slice(0, 6)} cluster=${(ev.clusterId ?? '').slice(0, 6)}${reason}`,
		);
	}

	const candSnap = await db
		.collection('_liveSynthCandidates')
		.where('parentId', '==', QUESTION_ID)
		.get();
	console.info(`\n--- _liveSynthCandidates (${candSnap.size} queued) ---`);
	for (const doc of candSnap.docs.slice(0, 10)) {
		const d = doc.data();
		console.info(`  pair (${(d.score ?? '').toString().slice(0, 6)}): ${d.aText?.slice(0, 50)} <-> ${d.bText?.slice(0, 50)}`);
	}

	const stmtSnap = await db
		.collection('statements')
		.where('parentId', '==', QUESTION_ID)
		.get();
	const clusters: Array<{ id: string; statement: string; derived: string; members: number; hide: boolean }> = [];
	let hiddenOptions = 0;
	let visibleOptions = 0;
	let withEmbedding = 0;
	let withoutEmbedding = 0;
	for (const doc of stmtSnap.docs) {
		const d = doc.data();
		const derived = d.derivedByPipeline as string | undefined;
		if (derived === 'synthesis' || derived === 'topic-cluster') {
			clusters.push({
				id: d.statementId,
				statement: d.statement,
				derived,
				members: Array.isArray(d.integratedOptions) ? d.integratedOptions.length : 0,
				hide: !!d.hide,
			});
		} else if (d.statementType === 'option') {
			if (d.hide) hiddenOptions++;
			else visibleOptions++;
		}
		if (d.embedding) withEmbedding++;
		else withoutEmbedding++;
	}

	console.info(`\n--- statements ---`);
	console.info(`  total under question: ${stmtSnap.size}`);
	console.info(`  visible options:      ${visibleOptions}`);
	console.info(`  hidden options:       ${hiddenOptions}`);
	console.info(`  clusters/synths:      ${clusters.length}`);
	console.info(`  docs w/ embedding:    ${withEmbedding}`);
	console.info(`  docs w/o embedding:   ${withoutEmbedding}`);

	console.info('\n--- clusters/synths ---');
	for (const c of clusters) {
		console.info(`  [${c.derived}] hide=${c.hide} members=${c.members} | ${c.statement.slice(0, 70)}`);
	}

	// Check embedding cache for sample option
	const embCacheSize = await db.collection('embeddingCache').count().get();
	console.info(`\n--- embeddingCache ---`);
	console.info(`  total cached embeddings: ${embCacheSize.data().count}`);
})().catch((e) => {
	console.error('Inspect failed:', e);
	process.exit(1);
});
