/**
 * Emulator-only verification for T0.1 — manual clusters must survive synthesis
 * cleanup. Seeds one question with a manually-created cluster (titleLockedByCreator)
 * and an auto-formed synth cluster, runs `dissolveQuestionSynthesis`, and asserts:
 *   - the manual cluster (and its members) is left untouched, and
 *   - the synth cluster is dissolved (deleted, members re-shown).
 *
 * This is the deterministic local gate before deploying the fix.
 *
 * USAGE (from functions/):
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx --env-file=.env scripts/verifyManualClusterSurvivesDissolve.ts
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. Emulator-only.');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}

const Q = 'q-verify-t01';
const MANUAL = 'manual-cluster-1';
const M1 = 'manual-member-1';
const M2 = 'manual-member-2';
const SYNTH = 'synth-cluster-1';
const S1 = 'synth-member-1';
const S2 = 'synth-member-2';

const failures: string[] = [];
const check = (label: string, ok: boolean): void => {
	console.info(`${ok ? '✅' : '❌'} ${label}`);
	if (!ok) failures.push(label);
};

async function main(): Promise<void> {
	const db = getFirestore();
	const col = db.collection(Collections.statements);
	const now = Date.now();

	// --- Seed -----------------------------------------------------------------
	const seed = [
		{ statementId: Q, statement: 'Verify question', statementType: 'question', parentId: 'top' },
		// Manually-created cluster: title locked by creator, 2 members.
		{
			statementId: MANUAL,
			statement: 'My hand-made cluster',
			statementType: 'option',
			parentId: Q,
			isCluster: true,
			titleLockedByCreator: true,
			integratedOptions: [M1, M2],
		},
		{ statementId: M1, statement: 'manual member one', statementType: 'option', parentId: Q, hide: false },
		{ statementId: M2, statement: 'manual member two', statementType: 'option', parentId: Q, hide: false },
		// Auto-formed synth cluster: no title lock, members hidden + integratedInto.
		{
			statementId: SYNTH,
			statement: 'AI synthesized cluster',
			statementType: 'option',
			parentId: Q,
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: [S1, S2],
		},
		{ statementId: S1, statement: 'synth member one', statementType: 'option', parentId: Q, hide: true, integratedInto: SYNTH },
		{ statementId: S2, statement: 'synth member two', statementType: 'option', parentId: Q, hide: true, integratedInto: SYNTH },
	];
	const seedBatch = db.batch();
	for (const doc of seed) {
		seedBatch.set(col.doc(doc.statementId), { ...doc, createdAt: now, lastUpdate: now });
	}
	await seedBatch.commit();
	console.info('Seeded 1 manual cluster + 1 synth cluster under', Q, '\n');

	// --- Run ------------------------------------------------------------------
	const { dissolveQuestionSynthesis } = await import('../src/synthesis/derivedDocs');
	const result = await dissolveQuestionSynthesis(Q, { reversedByUserId: 'verify-script' });
	console.info('\ndissolveQuestionSynthesis result:', JSON.stringify(result), '\n');

	// --- Assert ---------------------------------------------------------------
	const manual = await col.doc(MANUAL).get();
	const m1 = await col.doc(M1).get();
	const m2 = await col.doc(M2).get();
	const synth = await col.doc(SYNTH).get();
	const s1 = await col.doc(S1).get();
	const s2 = await col.doc(S2).get();

	check('manual cluster still exists', manual.exists);
	check(
		'manual cluster keeps its members',
		JSON.stringify(manual.data()?.integratedOptions) === JSON.stringify([M1, M2]),
	);
	check('manual member 1 untouched', m1.exists && m1.data()?.hide !== true);
	check('manual member 2 untouched', m2.exists && m2.data()?.hide !== true);
	check('result reports manualClustersPreserved === 1', result.manualClustersPreserved === 1);

	check('synth cluster was dissolved (deleted)', !synth.exists);
	check('result reports clustersReversed === 1', result.clustersReversed === 1);
	check('synth member 1 re-shown (hide=false, no integratedInto)', s1.exists && s1.data()?.hide === false && !s1.data()?.integratedInto);
	check('synth member 2 re-shown (hide=false, no integratedInto)', s2.exists && s2.data()?.hide === false && !s2.data()?.integratedInto);

	// --- Cleanup --------------------------------------------------------------
	const cleanup = db.batch();
	for (const id of [Q, MANUAL, M1, M2, SYNTH, S1, S2]) cleanup.delete(col.doc(id));
	await cleanup.commit();

	console.info(`\n${failures.length === 0 ? 'PASS ✅ — all assertions held' : `FAIL ❌ — ${failures.length} assertion(s) failed`}`);
	process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
	console.error('verify script crashed:', error);
	process.exit(1);
});
