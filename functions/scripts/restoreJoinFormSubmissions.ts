/**
 * Restore `joinFormSubmissions/{userId}` docs from the durable history
 * collection (`joinFormSubmissionsHistory`). Used when the hot collection
 * has been wiped, corrupted, or accidentally deleted.
 *
 * SAFETY:
 *   - Refuses to run if FIRESTORE_EMULATOR_HOST is set (mismatched intent).
 *   - Read-only by default. Pass `--apply` to actually write.
 *   - Prints a per-user diff of what would change before any write.
 *
 * USAGE:
 *   gcloud auth application-default login
 *
 *   # Dry-run for a question, restore latest state per user:
 *   GCLOUD_PROJECT=wizcol-app \
 *     npx tsx scripts/restoreJoinFormSubmissions.ts \
 *       --question-id w03LYthJ9swR
 *
 *   # Restore each user to their state as of a specific timestamp:
 *   GCLOUD_PROJECT=wizcol-app \
 *     npx tsx scripts/restoreJoinFormSubmissions.ts \
 *       --question-id w03LYthJ9swR \
 *       --as-of 2026-04-15T00:00:00Z
 *
 *   # Actually write the restoration:
 *   GCLOUD_PROJECT=wizcol-app \
 *     npx tsx scripts/restoreJoinFormSubmissions.ts \
 *       --question-id w03LYthJ9swR \
 *       --apply
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import process from 'process';

if (process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run with FIRESTORE_EMULATOR_HOST set.');
	process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (!args.questionId) {
	console.error('Usage: --question-id <id> [--as-of <ISO timestamp>] [--apply]');
	process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
	console.error('Set GCLOUD_PROJECT (e.g. GCLOUD_PROJECT=wizcol-app).');
	process.exit(1);
}

if (!getApps().length) initializeApp({ projectId });
const db = getFirestore();

const HISTORY = 'joinFormSubmissionsHistory';
const SUBMISSIONS_SUB = 'joinFormSubmissions';
const STATEMENTS = 'statements';

interface HistoryEntry {
	historyId: string;
	questionId: string;
	userId: string;
	operation: 'create' | 'update' | 'delete';
	capturedAt: number;
	displayName: string;
	values: Record<string, string>;
	role: string | null;
	redactedAt?: number;
}

main().catch((err) => {
	console.error('FATAL', err);
	process.exit(1);
});

async function main(): Promise<void> {
	const asOfMs = args.asOf ? Date.parse(args.asOf) : Number.MAX_SAFE_INTEGER;
	if (Number.isNaN(asOfMs)) {
		console.error(`Invalid --as-of timestamp: ${args.asOf}`);
		process.exit(1);
	}

	console.info(`[restore] question=${args.questionId}`);
	console.info(`[restore] as-of   =${asOfMs === Number.MAX_SAFE_INTEGER ? 'latest' : new Date(asOfMs).toISOString()}`);
	console.info(`[restore] mode    =${args.apply ? 'APPLY (writes)' : 'DRY-RUN (read-only)'}`);
	console.info('');

	// 1. Load every history entry for this question up to the cutoff.
	let query = db
		.collection(HISTORY)
		.where('questionId', '==', args.questionId)
		.where('capturedAt', '<=', asOfMs);
	const histSnap = await query.get();
	console.info(`[restore] history entries scanned: ${histSnap.size}`);

	// 2. Group by userId, keep the latest per user.
	const latestByUser = new Map<string, HistoryEntry>();
	for (const doc of histSnap.docs) {
		const e = doc.data() as HistoryEntry;
		if (!e.userId) continue;
		const cur = latestByUser.get(e.userId);
		if (!cur || e.capturedAt > cur.capturedAt) {
			latestByUser.set(e.userId, e);
		}
	}
	console.info(`[restore] users with history    : ${latestByUser.size}`);

	if (latestByUser.size === 0) {
		console.info('Nothing to restore. Exit.');
		return;
	}

	// 3. For each user, compare to the live submission doc (if any) and
	// either skip (already matches), restore (live missing/diverged), or
	// flag a delete-history (latest op was 'delete').
	let toCreate = 0;
	let toUpdate = 0;
	let toDelete = 0;
	let alreadyMatches = 0;
	let redactedSkipped = 0;

	const ops: Array<{ kind: 'set' | 'delete'; userId: string; payload?: Record<string, unknown> }> = [];

	for (const [userId, entry] of latestByUser) {
		// Refuse to restore from an erased entry — the values were intentionally
		// stripped via GDPR/Israeli erasure callable. Operator must investigate.
		if (entry.redactedAt) {
			console.info(`  [skip] ${userId.slice(0, 10)}.. erased at ${new Date(entry.redactedAt).toISOString()}`);
			redactedSkipped++;
			continue;
		}

		const liveRef = db
			.collection(STATEMENTS)
			.doc(args.questionId!)
			.collection(SUBMISSIONS_SUB)
			.doc(userId);
		const liveSnap = await liveRef.get();
		const live = liveSnap.exists ? (liveSnap.data() as Record<string, unknown>) : undefined;

		if (entry.operation === 'delete') {
			if (!live) {
				console.info(`  [skip] ${userId.slice(0, 10)}.. already deleted live`);
				alreadyMatches++;
			} else {
				console.info(`  [del]  ${userId.slice(0, 10)}.. live exists, history says deleted`);
				toDelete++;
				ops.push({ kind: 'delete', userId });
			}
			continue;
		}

		const targetPayload: Record<string, unknown> = {
			userId,
			questionId: args.questionId!,
			displayName: entry.displayName ?? '',
			values: entry.values ?? {},
			role: entry.role ?? undefined,
			lastUpdate: Date.now(),
			createdAt: (live?.createdAt as number) ?? entry.capturedAt,
		};

		const matchesLive =
			live &&
			JSON.stringify(live.values ?? {}) === JSON.stringify(targetPayload.values) &&
			(live.displayName ?? '') === targetPayload.displayName &&
			((live.role as string | undefined) ?? null) === ((targetPayload.role as string | undefined) ?? null);

		if (matchesLive) {
			alreadyMatches++;
			continue;
		}

		if (!live) {
			toCreate++;
			console.info(`  [new]  ${userId.slice(0, 10)}.. role=${targetPayload.role ?? 'null'}`);
		} else {
			toUpdate++;
			console.info(`  [upd]  ${userId.slice(0, 10)}.. live diverged from history`);
		}
		ops.push({ kind: 'set', userId, payload: targetPayload });
	}

	console.info('');
	console.info(`[restore] would create  : ${toCreate}`);
	console.info(`[restore] would update  : ${toUpdate}`);
	console.info(`[restore] would delete  : ${toDelete}`);
	console.info(`[restore] already matches: ${alreadyMatches}`);
	console.info(`[restore] redacted (skip): ${redactedSkipped}`);

	if (!args.apply) {
		console.info('');
		console.info('Dry run complete. Re-run with --apply to write.');
		return;
	}

	// 4. Apply. Batch writes in chunks of 400 (under the 500 doc/batch cap).
	let applied = 0;
	for (let i = 0; i < ops.length; i += 400) {
		const chunk = ops.slice(i, i + 400);
		const batch = db.batch();
		for (const op of chunk) {
			const ref = db
				.collection(STATEMENTS)
				.doc(args.questionId!)
				.collection(SUBMISSIONS_SUB)
				.doc(op.userId);
			if (op.kind === 'set') {
				batch.set(ref, op.payload!);
			} else {
				batch.delete(ref);
			}
		}
		await batch.commit();
		applied += chunk.length;
		console.info(`[restore] committed ${applied}/${ops.length}`);
	}

	console.info(`[restore] DONE. Applied ${applied} ops.`);
}

function parseArgs(argv: string[]): { questionId?: string; asOf?: string; apply?: boolean } {
	const out: { questionId?: string; asOf?: string; apply?: boolean } = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--question-id') out.questionId = argv[++i];
		else if (a === '--as-of') out.asOf = argv[++i];
		else if (a === '--apply') out.apply = true;
	}

	return out;
}
