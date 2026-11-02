#!/usr/bin/env node
/**
 * READ-ONLY pull of theme lineage from prod (wizcol-app). Only .get() is called.
 * Output holds resident text and must stay OUTSIDE the repo (public).
 * usage: GCLOUD_PROJECT=wizcol-app node pull_lineage.cjs <outDir>
 */
const path = require('node:path');
const fs = require('node:fs');
const req = require('node:module').createRequire(path.resolve(__dirname, '../../../functions/package.json'));
const admin = req('firebase-admin');
const QS = ['IqKVla0ZHw-m', 'WfkDISMmbduQ'];
const out = process.argv[2];
if (!out || out.startsWith(path.resolve(__dirname, '../../..'))) throw new Error('outDir must be outside the repo');
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulator set');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
(async () => {
	for (const q of QS) {
		const st = await db.collection('statements').where('parentId', '==', q).get();
		const statements = st.docs.map((d) => d.data());
		const audit = await db.collection('_synthAuditLog').where('parentStatementId', '==', q).get();
		const auditRows = audit.docs.map((d) => ({ id: d.id, ...d.data() }));
		const rebuildDoc = await db.collection('_themeRebuild').doc(q).get();
		const proposals = await db.collection('_themeRebuild').doc(q).collection('proposals').get();
		const states = {};
		for (const c of ['_liveSynthThemeFile', '_liveSynthThemeSplit', '_liveSynthThemeSweep']) {
			const s = await db.collection(c).doc(q).get();
			states[c] = s.exists ? s.data() : null;
		}
		const emb = {};
		const ids = statements.map((s) => s.statementId);
		for (let i = 0; i < ids.length; i += 100) {
			const refs = ids.slice(i, i + 100).map((id) => db.collection('statementEmbeddings').doc(id));
			for (const e of await db.getAll(...refs)) {
				if (!e.exists) continue;
				const v = e.data().embedding;
				emb[e.id] = Array.isArray(v) ? v : typeof v?.toArray === 'function' ? v.toArray() : null;
			}
		}
		fs.writeFileSync(path.join(out, `lineage-${q}.json`), JSON.stringify({
			question: q, pulledAt: Date.now(), statements, audit: auditRows,
			rebuild: rebuildDoc.exists ? rebuildDoc.data() : null,
			proposals: proposals.docs.map((d) => ({ id: d.id, ...d.data() })), states,
		}));
		fs.writeFileSync(path.join(out, `embeddings-${q}.json`), JSON.stringify(emb));
		console.info(q, 'statements', statements.length, 'audit', auditRows.length, 'rebuild', rebuildDoc.exists, 'proposals', proposals.size, 'emb', Object.keys(emb).length);
	}
	process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
