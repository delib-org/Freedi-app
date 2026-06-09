/**
 * One-time migration: set the CORRECT `topParentId` on every `statements` doc
 * that is MISSING it, by walking the real parent chain up to the top-level
 * statement (the ancestor whose `parentId === 'top'`).
 *
 * Why this is needed:
 * Legacy statement docs predate the promoted `topParentId` field. The client
 * (src/helpers/timestampHelpers.ts -> normalizeStatementData) patches them
 * in-memory on every read, logging:
 *   [normalizeStatementData] Filled missing topParentId for statement <id> using parentId <pid>
 * That patch is (a) never persisted, so it re-runs and re-logs forever, and
 * (b) LOSSY — for a deeply nested statement it falls back to the immediate
 * `parentId`, which is only correct when the parent happens to be the top-level
 * statement. This script computes the true top parent and writes it once.
 *
 * Resolution:
 *   - parentId is 'top' / missing / self  -> topParentId = statementId (it IS top-level)
 *   - an ancestor already has a valid topParentId -> reuse it (chain short-circuits)
 *   - otherwise recurse up via parentId (cached, cycle-guarded)
 *
 * Safe: only WRITES where `topParentId` is absent; never overwrites an existing
 * value. Idempotent: re-running processes only docs still missing the field.
 *
 * Firestore can't query "field is missing", so this scans the whole collection
 * paginated by document id; ancestor lookups are individual gets, memoized.
 *
 * USAGE (from functions/):
 *   # preview counts (no writes):
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillStatementTopParentId.ts
 *   # apply:
 *   GCLOUD_PROJECT=wizcol-app npx tsx scripts/backfillStatementTopParentId.ts --execute
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error(
		'FIRESTORE_EMULATOR_HOST is set — this migration targets a real project. Aborting.',
	);
	process.exit(1);
}
const EXECUTE = process.argv.includes('--execute');
const project = process.env.GCLOUD_PROJECT;
if (!project) {
	console.error(
		'Usage: GCLOUD_PROJECT=<proj> npx tsx scripts/backfillStatementTopParentId.ts [--execute]',
	);
	process.exit(1);
}
if (getApps().length === 0) initializeApp({ projectId: project });

const db = getFirestore();
const PAGE = 500;
const MAX_DEPTH = 50; // cycle / runaway guard

// Memoize statementId -> resolved topParentId across the whole run.
const topParentCache = new Map<string, string>();

function isValidId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/**
 * Resolve the true top-level ancestor's statementId for a given statement.
 * Returns the best-effort id even when the chain is broken (orphaned parent),
 * so a write always has a value and validation never fails.
 */
async function resolveTopParentId(statementId: string, depth = 0): Promise<string> {
	const cached = topParentCache.get(statementId);
	if (cached) return cached;

	if (depth > MAX_DEPTH) {
		console.warn(`  ! max depth at ${statementId} — using self as topParentId`);

		return statementId;
	}

	const snap = await db.collection('statements').doc(statementId).get();
	if (!snap.exists) {
		// Orphaned ancestor — can't climb further; this id is the best top we have.
		return statementId;
	}

	const data = snap.data() as Record<string, unknown>;
	const parentId = data.parentId;

	let result: string;
	if (!isValidId(parentId) || parentId === 'top' || parentId === statementId) {
		// Top-level statement.
		result = statementId;
	} else if (isValidId(data.topParentId)) {
		// Trust an ancestor that already carries a topParentId.
		result = data.topParentId;
	} else {
		// Climb one level up.
		result = await resolveTopParentId(parentId, depth + 1);
	}

	topParentCache.set(statementId, result);

	return result;
}

async function main(): Promise<void> {
	console.info(
		`\n# backfill statements.topParentId — project=${project} ${
			EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'
		}\n`,
	);

	let last: QueryDocumentSnapshot | null = null;
	let scanned = 0;
	let missing = 0;
	let written = 0;
	let selfTop = 0;
	let nested = 0;
	let pendingBatch = db.batch();
	let pendingCount = 0;

	const flush = async (): Promise<void> => {
		if (pendingCount === 0) return;
		if (EXECUTE) await pendingBatch.commit();
		written += pendingCount;
		pendingBatch = db.batch();
		pendingCount = 0;
	};

	for (;;) {
		let q = db.collection('statements').orderBy('__name__').limit(PAGE);
		if (last) q = q.startAfter(last);
		const snap = await q.get();
		if (snap.empty) break;

		for (const doc of snap.docs) {
			scanned++;
			const data = doc.data();
			if (isValidId(data.topParentId)) continue;

			missing++;
			const topParentId = await resolveTopParentId(doc.id);
			if (topParentId === doc.id) selfTop++;
			else nested++;

			pendingBatch.update(doc.ref, { topParentId });
			pendingCount++;
			if (pendingCount >= 400) await flush();
		}
		last = snap.docs[snap.docs.length - 1];
		if (scanned % 5000 === 0) console.info(`  scanned ${scanned}… (missing so far ${missing})`);
	}
	await flush();

	console.info(
		`\nDone. scanned=${scanned} | missing topParentId=${missing} ` +
			`(self/top-level=${selfTop}, nested=${nested}) | ${
				EXECUTE ? `written=${written}` : 'would write=' + missing
			}`,
	);
	if (!EXECUTE) console.info('(DRY-RUN — nothing written. Re-run with --execute to apply.)');
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error('backfill failed:', e);
		process.exit(1);
	});
