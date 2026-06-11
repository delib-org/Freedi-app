/**
 * Delete every statement under a benchmark question (options + clusters)
 * so the seeder can run from scratch. Preserves the question doc itself.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/cleanBenchmarkQuestion.ts <questionId>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const QUESTION_ID = process.argv[2];
if (!QUESTION_ID) {
	console.error('Usage: npx tsx scripts/cleanBenchmarkQuestion.ts <questionId>');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

(async () => {
	const stmtSnap = await db.collection('statements').where('parentId', '==', QUESTION_ID).get();
	console.info(`Found ${stmtSnap.size} child statements under ${QUESTION_ID}`);

	let deleted = 0;
	const docs = stmtSnap.docs;
	for (let i = 0; i < docs.length; i += 400) {
		const slice = docs.slice(i, i + 400);
		const batch = db.batch();
		for (const d of slice) batch.delete(d.ref);
		await batch.commit();
		deleted += slice.length;
	}
	console.info(`✓ Deleted ${deleted} statements`);

	// Clean audit log for this question
	const auditSnap = await db
		.collection('_synthAuditLog')
		.where('parentStatementId', '==', QUESTION_ID)
		.get();
	let auditDeleted = 0;
	const auditDocs = auditSnap.docs;
	for (let i = 0; i < auditDocs.length; i += 400) {
		const slice = auditDocs.slice(i, i + 400);
		const batch = db.batch();
		for (const d of slice) batch.delete(d.ref);
		await batch.commit();
		auditDeleted += slice.length;
	}
	console.info(`✓ Deleted ${auditDeleted} audit-log entries`);
})().catch((e) => {
	console.error('Cleanup failed:', e);
	process.exit(1);
});
