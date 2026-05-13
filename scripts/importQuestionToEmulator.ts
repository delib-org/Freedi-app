/**
 * Import a question payload (produced by `exportProdQuestion.ts`) into the
 * local Firestore emulator. Optionally remaps the creator and admin
 * subscription to a target user uid so you can drive admin actions
 * (synthesize, reverse, integrate) as the imported question's owner.
 *
 * SAFETY:
 *   - Refuses to run unless FIRESTORE_EMULATOR_HOST is set.
 *   - Anonymizes evaluator emails / display names by default
 *     (use --keep-pii to disable).
 *
 * USAGE:
 *   FIRESTORE_EMULATOR_HOST=localhost:8081 \
 *     GCLOUD_PROJECT=freedi-test \
 *     npx tsx scripts/importQuestionToEmulator.ts \
 *       --in test-data/<name>.json \
 *       --as-user <your-emulator-uid> \
 *       --as-display-name "Tal (admin)"
 *
 *   Optional flags:
 *     --keep-pii              Skip evaluator anonymization
 *     --skip-clusters         Don't import cluster aggregations / links
 *     --skip-evaluations      Don't import evaluations
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';

// ----------------------------------------------------------------------
// Safety guards
// ----------------------------------------------------------------------
if (!process.env.FIRESTORE_EMULATOR_HOST) {
	console.error('Refusing to run without FIRESTORE_EMULATOR_HOST set. This script is emulator-only.');
	process.exit(1);
}

// ----------------------------------------------------------------------
// Args
// ----------------------------------------------------------------------
function getArg(flag: string): string | undefined {
	const idx = process.argv.indexOf(flag);
	if (idx === -1) return undefined;

	return process.argv[idx + 1];
}
function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

const inPath = getArg('--in');
const asUserUid = getArg('--as-user');
const asDisplayName = getArg('--as-display-name') ?? 'Local Admin';
const keepPii = hasFlag('--keep-pii');
const skipClusters = hasFlag('--skip-clusters');
const skipEvaluations = hasFlag('--skip-evaluations');
const skipStatements = hasFlag('--skip-statements');
const skipSubscriptions = hasFlag('--skip-subscriptions');
// Re-parent the imported question under an existing local statement.
// When set, the prod question doc is NOT written; instead, every option /
// sub-statement that pointed at the prod question id is rewritten to point
// at the local target. Useful when you want to drop the prod options into
// an existing local question without overwriting it.
const reparentUnder = getArg('--reparent-under');

// ----------------------------------------------------------------------
// Init admin SDK
// ----------------------------------------------------------------------
if (getApps().length === 0) {
	initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'freedi-test' });
}
const db = getFirestore();

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
function anonUid(uid: string): string {
	const hash = createHash('sha256').update(`anon:${uid}`).digest('hex').slice(0, 24);

	return `anon-${hash}`;
}

function anonymizeUserData(value: unknown): unknown {
	if (value && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = { ...obj };
		if (typeof obj.uid === 'string') out.uid = anonUid(obj.uid);
		if (typeof obj.userId === 'string') out.userId = anonUid(obj.userId);
		if (typeof obj.evaluatorId === 'string') out.evaluatorId = anonUid(obj.evaluatorId);
		if (typeof obj.email === 'string') out.email = `anon-${anonUid(obj.email).slice(5, 13)}@example.invalid`;
		if (typeof obj.displayName === 'string') {
			out.displayName = `Anon-${anonUid(obj.displayName).slice(5, 9)}`;
		}
		if (typeof obj.photoURL === 'string') out.photoURL = '';
		return out;
	}

	return value;
}

// The local emulator runs Cloud Function triggers on every write
// (onStatementCreated calls OpenAI etc), so unbounded batch writes
// stampede the functions runtime and freeze the import. Cap each batch
// small and pause between batches so the trigger queue can drain.
const STATEMENT_BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE ?? 25);
const STATEMENT_BATCH_DELAY_MS = Number(process.env.IMPORT_BATCH_DELAY_MS ?? 250);

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function commitInBatches(
	docs: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>,
	label: string,
	options: { batchSize?: number; delayMs?: number } = {},
): Promise<void> {
	const batchSize = options.batchSize ?? STATEMENT_BATCH_SIZE;
	const delayMs = options.delayMs ?? STATEMENT_BATCH_DELAY_MS;
	let written = 0;
	const total = docs.length;
	for (let i = 0; i < total; i += batchSize) {
		const slice = docs.slice(i, i + batchSize);
		const batch: WriteBatch = db.batch();
		for (const { ref, data } of slice) {
			batch.set(ref, data, { merge: false });
		}
		await batch.commit();
		written += slice.length;
		// Compact in-place progress line so a long import doesn't fill
		// the terminal. Uses CR + final newline once done.
		process.stdout.write(`  ${label}: ${written}/${total}\r`);
		if (i + batchSize < total && delayMs > 0) {
			await sleep(delayMs);
		}
	}
	process.stdout.write(`  ${label}: ${written}/${total}\n`);
}

interface ExportPayload {
	meta?: { questionId: string; sourceProjectId?: string };
	question: Record<string, unknown>;
	statements: Array<Record<string, unknown>>;
	evaluations: Array<Record<string, unknown>>;
	subscriptions: Array<Record<string, unknown>>;
	clusterAggregations: Array<Record<string, unknown>>;
	clusterEvaluationLinks: Array<Record<string, unknown>>;
}

// ----------------------------------------------------------------------
// Import
// ----------------------------------------------------------------------
(async () => {
	try {
		const raw = readFileSync(resolve(inPath!), 'utf-8');
		const payload = JSON.parse(raw) as ExportPayload;
		const questionId = payload.meta?.questionId ?? (payload.question.statementId as string);

		// Resolve the local target's topParentId so re-parented statements
		// stay coherent with the existing local hierarchy. Bail loudly if
		// the local target doesn't exist; trying to re-parent under a
		// missing statement would silently orphan the data.
		let localTopParentId: string | undefined;
		if (reparentUnder) {
			const localTargetDoc = await db.collection('statements').doc(reparentUnder).get();
			if (!localTargetDoc.exists) {
				console.error(
					`Re-parent target ${reparentUnder} not found in the emulator. Create the local question first, then re-run.`,
				);
				process.exit(1);
			}
			const localTarget = localTargetDoc.data() as Record<string, unknown>;
			localTopParentId = (localTarget.topParentId as string | undefined) ?? reparentUnder;
		}

		console.info(`Importing question ${questionId} from ${payload.meta?.sourceProjectId ?? 'unknown'}…`);
		if (reparentUnder) {
			console.info(`  Re-parenting under local statement ${reparentUnder} (topParentId=${localTopParentId}).`);
		}
		console.info(
			`  ${payload.statements.length} statements, ${payload.evaluations.length} evaluations, ${payload.subscriptions.length} subscriptions`,
		);
		if (!keepPii) {
			console.info('  Anonymizing user identifiers (use --keep-pii to disable).');
		}

		// Helper: rewrite a parent / topParent reference to the local target
		// when re-parenting is active. Anything that pointed at the prod
		// question now points at the local statement; any nested topParent
		// reference is mirrored to the local hierarchy.
		const remap = (id: string | undefined): string | undefined => {
			if (!reparentUnder || !id) return id;
			if (id === questionId) return reparentUnder;

			return id;
		};
		const remapTop = (id: string | undefined): string | undefined => {
			if (!reparentUnder || !id) return id;
			if (id === questionId) return localTopParentId ?? reparentUnder;

			return id;
		};

		// 1. Statements — keep ids stable so the synthesis run history works.
		//    When re-parenting, skip the prod question doc (the local target
		//    already exists) and rewrite parentId / topParentId on every
		//    other statement so they hang off the local question.
		const statementDocs: Array<{
			ref: FirebaseFirestore.DocumentReference;
			data: Record<string, unknown>;
		}> = [];
		for (const s of payload.statements) {
			const data = { ...s };
			if (reparentUnder && data.statementId === questionId) {
				continue; // don't overwrite the local target
			}
			if (reparentUnder) {
				data.parentId = remap(data.parentId as string | undefined);
				data.topParentId = remapTop(data.topParentId as string | undefined);
			}
			// Optional: remap the creator on the question itself to the local user
			if (asUserUid && !reparentUnder && data.statementId === questionId) {
				data.creatorId = asUserUid;
				data.creator = {
					uid: asUserUid,
					displayName: asDisplayName,
					defaultLanguage: (data.creator as { defaultLanguage?: string } | undefined)?.defaultLanguage ?? 'en',
				};
			} else if (!keepPii) {
				if (data.creator) data.creator = anonymizeUserData(data.creator);
				if (typeof data.creatorId === 'string') data.creatorId = anonUid(data.creatorId);
			}

			statementDocs.push({
				ref: db.collection('statements').doc(data.statementId as string),
				data,
			});
		}

		if (skipStatements) {
			console.info(`Skipping statement writes (--skip-statements). Would have written ${statementDocs.length}.`);
		} else {
			console.info('Writing statements…');
			await commitInBatches(statementDocs, 'statements');
		}

		// 2. Evaluations
		if (!skipEvaluations && payload.evaluations.length > 0) {
			const importedAt = Date.now();
			const evalDocs = payload.evaluations.map((e) => {
				let data = { ...e };
				if (!keepPii) {
					if (data.evaluator) data.evaluator = anonymizeUserData(data.evaluator);
					if (typeof data.evaluatorId === 'string') data.evaluatorId = anonUid(data.evaluatorId);
				}
				if (reparentUnder) {
					// Evaluations carry the option's parentId — when an option's
					// parent was the prod question, rewrite to the local target
					// so the eval still resolves to the option's new home.
					data.parentId = remap(data.parentId as string | undefined);
				}
				const id =
					(data.evaluationId as string | undefined) ??
					`${data.evaluatorId as string}--${data.statementId as string}`;
				data.evaluationId = id;
				// `migratedAt` makes the onCreateEvaluation trigger skip — without
				// it the function emulator stampedes its transaction workers and
				// the import deadlines out. The statement docs we wrote in step 1
				// already carry the aggregated evaluation fields from the export,
				// so triggers would only re-aggregate redundantly anyway.
				if (typeof data.migratedAt !== 'number') {
					data.migratedAt = importedAt;
				}

				return {
					ref: db.collection('evaluations').doc(id),
					data,
				};
			});
			console.info('Writing evaluations…');
			await commitInBatches(evalDocs, 'evaluations');
		}

		// 3. Subscriptions — when re-parenting, skip the prod subscriptions
		// entirely; the local question already has its own admin / member
		// chain. Only inject the admin subscription for the target user if
		// they asked for it.
		const targetQuestionId = reparentUnder ?? questionId;
		const shouldImportProdSubs =
			!skipSubscriptions && !reparentUnder && payload.subscriptions.length > 0;
		if (shouldImportProdSubs || asUserUid) {
			const subDocs: Array<{
				ref: FirebaseFirestore.DocumentReference;
				data: Record<string, unknown>;
			}> = [];

			if (shouldImportProdSubs) {
				for (const s of payload.subscriptions) {
					const data = { ...s };
					if (!keepPii) {
						if (data.user) data.user = anonymizeUserData(data.user);
						if (typeof data.userId === 'string') data.userId = anonUid(data.userId);
					}
					const id = (data.id as string | undefined) ?? `${data.userId}--${questionId}`;
					delete data.id;
					subDocs.push({
						ref: db.collection('statementsSubscribe').doc(id),
						data,
					});
				}
			}

			// Inject / overwrite an admin subscription for the target user so
			// the local app can authorize admin actions on the question.
			if (asUserUid) {
				const id = `${asUserUid}--${targetQuestionId}`;
				subDocs.push({
					ref: db.collection('statementsSubscribe').doc(id),
					data: {
						// Required by the client-side Valibot validator on the
						// listener — without it, the page hangs on "Loading your
						// workspace…" because the listener errors before any
						// data is populated.
						statementsSubscribeId: id,
						userId: asUserUid,
						statementId: targetQuestionId,
						role: 'admin',
						lastUpdate: Date.now(),
						user: {
							uid: asUserUid,
							displayName: asDisplayName,
						},
						// When re-parenting, defer to whatever the local question doc
						// already says — don't paste prod metadata over it.
						...(reparentUnder ? {} : { statement: payload.question }),
					},
				});
			}

			console.info('Writing subscriptions…');
			await commitInBatches(subDocs, 'subscriptions');
		}

		// 4. Cluster aggregations + evaluation links
		if (!skipClusters) {
			if (payload.clusterAggregations?.length) {
				const aggDocs = payload.clusterAggregations.map((a) => {
					const id = a.id as string;
					const data = { ...a };
					delete data.id;

					return { ref: db.collection('clusterAggregations').doc(id), data };
				});
				console.info('Writing cluster aggregations…');
				await commitInBatches(aggDocs, 'aggregations');
			}
			if (payload.clusterEvaluationLinks?.length) {
				const linkDocs = payload.clusterEvaluationLinks.map((l) => {
					let data = { ...l };
					if (!keepPii && typeof data.userId === 'string') data.userId = anonUid(data.userId);
					const id = (data.id as string | undefined) ?? `${data.clusterId}--${data.userId}`;
					delete data.id;

					return { ref: db.collection('clusterEvaluationLinks').doc(id), data };
				});
				console.info('Writing cluster evaluation links…');
				await commitInBatches(linkDocs, 'links');
			}
		}

		const navTarget = reparentUnder ?? questionId;
		console.info(`\n✓ Import complete. Open the app and navigate to /statement/${navTarget}.`);
		if (asUserUid) {
			console.info(`  Sign in to the local emulator as uid=${asUserUid} to be admin on this question.`);
		}
	} catch (error) {
		console.error('Import failed:', error);
		process.exit(1);
	}
})();
