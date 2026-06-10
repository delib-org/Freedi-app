/**
 * READ-ONLY production diagnostic: inspect what the synthesis pipeline did to a
 * live question. NO WRITES — only `.get()` calls. Points at real Firestore
 * (NOT the emulator) for the project given by GCLOUD_PROJECT.
 *
 * USAGE (from functions/):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/inspectProdSynthesis.ts <questionId>
 *
 * Refuses to run if FIRESTORE_EMULATOR_HOST is set (that would point at the
 * emulator, not prod) — unset it first.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('FIRESTORE_EMULATOR_HOST is set — unset it to read production. Aborting.');
	process.exit(1);
}
const questionId = process.argv[2];
const project = process.env.GCLOUD_PROJECT;
if (!questionId || !project) {
	console.error('Usage: GCLOUD_PROJECT=wizcol-app npx tsx scripts/inspectProdSynthesis.ts <questionId>');
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();

interface Row {
	id: string;
	text: string;
	derivedByPipeline?: string;
	isCluster?: boolean;
	isSynthesis?: boolean;
	integratedOptions?: string[];
	integratedInto?: string;
	hide?: boolean;
	createdAt?: number;
}

const short = (s: string, n = 90) => (s.length > n ? s.slice(0, n) + '…' : s);

async function main(): Promise<void> {
	console.info(`\n# Synthesis inspection — project=${project} question=${questionId}\n`);

	const qSnap = await db.collection('statements').doc(questionId).get();
	if (!qSnap.exists) {
		console.error('Question not found.');
		return;
	}
	const q = qSnap.data() ?? {};
	console.info(`Question: "${short(q.statement ?? '', 120)}"`);
	console.info(
		`Settings: synthesis.enabled=${q.statementSettings?.synthesis?.enabled} liveSynthEnabled=${q.statementSettings?.liveSynthEnabled}\n`,
	);

	// All direct children that are options (raw + derived clusters live here).
	const snap = await db
		.collection('statements')
		.where('parentId', '==', questionId)
		.where('statementType', '==', 'option')
		.get();

	const rows: Row[] = snap.docs.map((d) => {
		const x = d.data();
		return {
			id: x.statementId ?? d.id,
			text: x.statement ?? '',
			derivedByPipeline: x.derivedByPipeline,
			isCluster: x.isCluster,
			isSynthesis: x.isSynthesis,
			integratedOptions: x.integratedOptions,
			integratedInto: x.integratedInto,
			hide: x.hide,
			createdAt: x.createdAt,
		};
	});

	const byId = new Map(rows.map((r) => [r.id, r]));
	const derived = rows.filter((r) => r.derivedByPipeline || r.isCluster);
	const raw = rows.filter((r) => !r.derivedByPipeline && !r.isCluster);
	const synths = derived.filter((r) => r.derivedByPipeline === 'synthesis' || r.isSynthesis);
	const topicClusters = derived.filter(
		(r) => r.derivedByPipeline === 'topic-cluster' && !r.isSynthesis,
	);

	console.info('## Totals');
	console.info(`  raw options:        ${raw.length}`);
	console.info(`  derived synths:     ${synths.length}`);
	console.info(`  topic-clusters:     ${topicClusters.length}`);
	console.info(`  hidden (merged-in): ${raw.filter((r) => r.hide).length}`);
	console.info(`  visible raw:        ${raw.filter((r) => !r.hide).length}\n`);

	// Membership integrity checks.
	const memberCount = new Map<string, number>();
	for (const s of synths) for (const m of s.integratedOptions ?? []) memberCount.set(m, (memberCount.get(m) ?? 0) + 1);
	const inMultiple = [...memberCount.entries()].filter(([, c]) => c > 1);
	const assigned = new Set([...memberCount.keys()]);
	const unassignedRaw = raw.filter((r) => !assigned.has(r.id) && !r.hide);

	console.info('## Integrity');
	console.info(`  options assigned to ≥1 synth: ${assigned.size}/${raw.length}`);
	console.info(`  options in >1 synth (overlap): ${inMultiple.length}${inMultiple.length ? ' ⚠️' : ''}`);
	if (inMultiple.length) inMultiple.slice(0, 10).forEach(([id, c]) => console.info(`    - ${id} in ${c} synths: "${short(byId.get(id)?.text ?? '?', 60)}"`));
	console.info(`  visible raw options NOT in any synth: ${unassignedRaw.length}\n`);

	console.info('## Synths and their members\n');
	const sortedSynths = synths.slice().sort((a, b) => (b.integratedOptions?.length ?? 0) - (a.integratedOptions?.length ?? 0));
	for (const s of sortedSynths) {
		const members = (s.integratedOptions ?? []).map((id) => byId.get(id));
		console.info(`### SYNTH (${members.length} members): "${short(s.text, 110)}"`);
		members.forEach((m) => {
			if (!m) return;
			console.info(`    • ${short(m.text, 110)}`);
		});
		// Members referenced but not found as direct children (e.g. nested).
		const missing = (s.integratedOptions ?? []).filter((id) => !byId.get(id)).length;
		if (missing) console.info(`    (… ${missing} member ids not found among direct option children)`);
		console.info('');
	}

	if (topicClusters.length) {
		console.info('## Topic-clusters (group synths)\n');
		for (const t of topicClusters) {
			console.info(`### TOPIC: "${short(t.text, 100)}" → links ${(t.integratedOptions ?? []).length} synths`);
			(t.integratedOptions ?? []).forEach((id) => {
				const child = byId.get(id);
				console.info(`    → ${short(child?.text ?? id, 100)}`);
			});
			console.info('');
		}
	}

	if (unassignedRaw.length) {
		console.info('## Visible raw options not merged into any synth\n');
		unassignedRaw.slice(0, 40).forEach((r) => console.info(`    · ${short(r.text, 110)}`));
		console.info('');
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('inspection failed:', e);
		process.exit(1);
	});
