/**
 * For each synth under a benchmark question, compute cosine between the
 * synth's stored embedding (title-embedding) and every non-member paraphrase
 * sharing the same theme. This confirms or refutes the hypothesis that
 * synth-title abstraction drops cosine below the reviewLowerBound (0.5),
 * which would prevent the synth from appearing in vector-search candidates
 * and bypass the transitive-evidence promotion logic.
 *
 * USAGE
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/measureSynthCosines.ts <questionId>
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const QUESTION_ID = process.argv[2];
if (!QUESTION_ID) {
	console.error('Usage: npx tsx scripts/measureSynthCosines.ts <questionId>');
	process.exit(1);
}

if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

function cosine(a: number[], b: number[]): number {
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

interface Doc {
	statementId: string;
	statement: string;
	embedding: number[] | null;
	isCluster: boolean;
	integratedOptions: string[];
	derivedByPipeline: string | null;
}

function extractVector(raw: unknown): number[] | null {
	if (!raw) return null;
	// FieldValue.vector() round-trips as a VectorValue object with a `value` array
	const v = raw as { _values?: number[]; value?: number[]; toArray?: () => number[] };
	if (Array.isArray(v)) return v as number[];
	if (Array.isArray(v.value)) return v.value;
	if (Array.isArray(v._values)) return v._values;
	if (typeof v.toArray === 'function') return v.toArray();

	return null;
}

(async () => {
	const snap = await db.collection('statements').where('parentId', '==', QUESTION_ID).get();
	const docs: Doc[] = snap.docs.map((d) => {
		const data = d.data() as Record<string, unknown>;

		return {
			statementId: (data.statementId as string) ?? d.id,
			statement: (data.statement as string) ?? '',
			embedding: extractVector(data.embedding),
			isCluster: data.isCluster === true,
			integratedOptions: Array.isArray(data.integratedOptions)
				? (data.integratedOptions as string[])
				: [],
			derivedByPipeline: (data.derivedByPipeline as string | null) ?? null,
		};
	});

	const synths = docs.filter((d) => d.derivedByPipeline === 'synthesis' && d.embedding);
	const options = docs.filter((d) => !d.isCluster && d.embedding);

	console.info(
		`\n=== ${synths.length} synths, ${options.length} option-docs with embeddings ===\n`,
	);

	for (const synth of synths) {
		console.info(`---`);
		console.info(`SYNTH: ${synth.statement.slice(0, 80)}`);
		console.info(`  id=${synth.statementId}, members=${synth.integratedOptions.length}`);

		// Get the members' text (theme) by sampling one — used to find non-member
		// options likely belonging to the same theme.
		const memberIds = new Set(synth.integratedOptions);
		const memberDocs = options.filter((o) => memberIds.has(o.statementId));
		const nonMembers = options.filter((o) => !memberIds.has(o.statementId));

		// For each member, find cosine(synth, member) — should be high (used by transitive logic)
		console.info(`  cosine(synth_title, MEMBERS):`);
		for (const m of memberDocs) {
			const c = cosine(synth.embedding!, m.embedding!);
			console.info(`    ${c.toFixed(3)}  ${m.statement.slice(0, 60)}`);
		}

		// For each non-member, find cosine(synth, non_member) — KEY: are these
		// non-members above the 0.5 review-lower-bound? If not, they are filtered
		// out by vector search before transitive evidence can promote the synth.
		// Sort and show top 12 (covers the same-synth paraphrases + same-topic ones)
		const ranked = nonMembers
			.map((nm) => ({ doc: nm, c: cosine(synth.embedding!, nm.embedding!) }))
			.sort((a, b) => b.c - a.c)
			.slice(0, 12);
		console.info(`  cosine(synth_title, top non-members):`);
		for (const r of ranked) {
			const below = r.c < 0.5 ? '  ← BELOW 0.5 (filtered by vectorSearch)' : '';
			console.info(`    ${r.c.toFixed(3)}  ${r.doc.statement.slice(0, 60)}${below}`);
		}

		// Cross-check: cosine between members and non-members. If members are at high
		// cosine to same-theme non-members, transitive evidence WOULD attach them — IF
		// the synth were in candidates.
		if (memberDocs.length > 0) {
			const m = memberDocs[0];
			const memberRanked = nonMembers
				.map((nm) => ({ doc: nm, c: cosine(m.embedding!, nm.embedding!) }))
				.sort((a, b) => b.c - a.c)
				.slice(0, 5);
			console.info(
				`  cosine(member="${m.statement.slice(0, 40)}", top non-members):`,
			);
			for (const r of memberRanked) {
				console.info(`    ${r.c.toFixed(3)}  ${r.doc.statement.slice(0, 50)}`);
			}
		}
	}
})().catch((e) => {
	console.error('Cosine measurement failed:', e);
	process.exit(1);
});
