/**
 * Export a replayed question from the Firestore emulator into the snapshot shape
 * `scoreVsFanny.py` reads, mapping the harness's fresh statement ids back to the
 * production ids (the corpus names each synth after the original statement id,
 * and the run's statements.json records `groundTruthSynth: "real/<origId>"`).
 *
 * USAGE:
 *   FIRESTORE_EMULATOR_HOST=localhost:8101 node exportEmulatorRun.cjs \
 *     <run-folder> <questionId> <out.json>
 */
const { initializeApp } = require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/app');
const { getFirestore } = require('/Users/talyaron/Documents/Freedi-app/functions/node_modules/firebase-admin/lib/firestore');
const fs = require('fs');
const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST');
	process.exit(1);
}
const [runDir, questionId, outPath] = process.argv.slice(2);
if (!runDir || !questionId || !outPath) {
	console.error('usage: exportEmulatorRun.cjs <run-folder> <questionId> <out.json>');
	process.exit(1);
}
initializeApp({ projectId: 'freedi-test' });

(async () => {
	const fed = JSON.parse(fs.readFileSync(path.join(runDir, 'statements.json'), 'utf8')).statements;
	const toOrig = new Map();
	for (const s of fed) {
		const orig = String(s.groundTruthSynth || '').split('/')[1];
		if (s.id && orig) toOrig.set(s.id, orig);
	}
	const db = getFirestore();
	const q = await db.collection('statements').doc(questionId).get();
	const kids = await db.collection('statements').where('parentId', '==', questionId).get();
	const remap = (id) => toOrig.get(id) || id;
	const children = kids.docs.map((d) => {
		const c = d.data();
		return {
			...c,
			statementId: remap(c.statementId),
			integratedOptions: Array.isArray(c.integratedOptions) ? c.integratedOptions.map(remap) : c.integratedOptions,
		};
	});
	fs.writeFileSync(outPath, JSON.stringify({ question: q.data(), children }));
	const themes = children.filter((c) => c.isCluster && !c.hide && c.derivedByPipeline !== 'synthesis');
	const synths = children.filter((c) => c.isCluster && !c.hide && c.derivedByPipeline === 'synthesis');
	console.log(`${children.length} children, ${toOrig.size} ids mapped, ${themes.length} themes, ${synths.length} synths`);
	for (const t of themes) console.log(`  theme n=${t.integratedOptions.length} "${t.statement}"`);
})();
