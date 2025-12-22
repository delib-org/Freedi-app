/**
 * Migration Script: Populate numberOfProEvaluators and numberOfConEvaluators
 *
 * This script counts evaluators with positive (> 0) and negative (< 0) evaluations
 * for each statement and updates the evaluation object with the counts.
 *
 * Run with: npx tsx scripts/migrateProConEvaluatorCounts.ts
 */

import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DRY_RUN = false; // Set to false to actually write changes
const BATCH_SIZE = 500; // Firestore batch limit
const PARENT_STATEMENT_ID = ''; // Leave empty to process all statements, or set to a specific parent

// Try to find service account key
function findServiceAccountKey(): ServiceAccount | null {
	const possiblePaths = [
		process.env.GOOGLE_APPLICATION_CREDENTIALS,
		path.join(__dirname, 'serviceAccountKey.json'),
		path.join(__dirname, '../serviceAccountKey.json'),
	].filter(Boolean) as string[];

	for (const keyPath of possiblePaths) {
		if (fs.existsSync(keyPath)) {
			console.log(`Found service account key at: ${keyPath}`);
			return JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as ServiceAccount;
		}
	}
	return null;
}

// Initialize Firebase Admin
if (!getApps().length) {
	const serviceAccount = findServiceAccountKey();
	if (serviceAccount) {
		initializeApp({ credential: cert(serviceAccount) });
		console.log('Initialized Firebase Admin');
	} else {
		console.error('No service account key found!');
		process.exit(1);
	}
}

const db = getFirestore();

interface EvaluationDoc {
	statementId: string;
	evaluation: number;
	evaluator?: { uid?: string };
}

interface StatementData {
	statementId: string;
	statement: string;
	parentId: string;
	evaluation?: {
		numberOfEvaluators?: number;
		sumPro?: number;
		sumCon?: number;
		numberOfProEvaluators?: number;
		numberOfConEvaluators?: number;
	};
}

interface ProConCounts {
	numberOfProEvaluators: number;
	numberOfConEvaluators: number;
}

/**
 * Count pro and con evaluators for a specific statement
 */
async function countProConEvaluators(statementId: string): Promise<ProConCounts> {
	const evaluationsSnapshot = await db
		.collection('evaluations')
		.where('statementId', '==', statementId)
		.get();

	let numberOfProEvaluators = 0;
	let numberOfConEvaluators = 0;

	evaluationsSnapshot.forEach(doc => {
		const data = doc.data() as EvaluationDoc;
		if (data.evaluation > 0) {
			numberOfProEvaluators++;
		} else if (data.evaluation < 0) {
			numberOfConEvaluators++;
		}
	});

	return { numberOfProEvaluators, numberOfConEvaluators };
}

/**
 * Process statements in batches
 */
async function migrateProConCounts(): Promise<void> {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`MIGRATE PRO/CON EVALUATOR COUNTS`);
	console.log(`${'='.repeat(80)}`);
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'LIVE (changes will be written)'}`);
	if (PARENT_STATEMENT_ID) {
		console.log(`Scope: Statements under parent ${PARENT_STATEMENT_ID}`);
	} else {
		console.log(`Scope: All statements with evaluations`);
	}
	console.log('');

	// Query statements
	let query = db.collection('statements').where('evaluation.numberOfEvaluators', '>', 0);
	if (PARENT_STATEMENT_ID) {
		query = db.collection('statements')
			.where('parentId', '==', PARENT_STATEMENT_ID)
			.where('evaluation.numberOfEvaluators', '>', 0);
	}

	const statementsSnapshot = await query.get();
	console.log(`Found ${statementsSnapshot.size} statements with evaluations\n`);

	if (statementsSnapshot.empty) {
		console.log('No statements to process');
		return;
	}

	// Process statements
	const updates: Array<{
		statementId: string;
		statement: string;
		currentPro?: number;
		currentCon?: number;
		newPro: number;
		newCon: number;
	}> = [];

	let processed = 0;
	const total = statementsSnapshot.size;

	for (const doc of statementsSnapshot.docs) {
		const data = doc.data() as StatementData;
		const statementId = doc.id;

		// Count pro/con evaluators from evaluations collection
		const counts = await countProConEvaluators(statementId);

		// Check if update is needed
		const currentPro = data.evaluation?.numberOfProEvaluators;
		const currentCon = data.evaluation?.numberOfConEvaluators;

		if (currentPro !== counts.numberOfProEvaluators || currentCon !== counts.numberOfConEvaluators) {
			updates.push({
				statementId,
				statement: data.statement,
				currentPro,
				currentCon,
				newPro: counts.numberOfProEvaluators,
				newCon: counts.numberOfConEvaluators,
			});
		}

		processed++;
		if (processed % 100 === 0) {
			console.log(`Processed ${processed}/${total} statements...`);
		}
	}

	console.log(`\nStatements needing update: ${updates.length}\n`);

	// Preview changes
	if (updates.length > 0) {
		console.log(`${'─'.repeat(80)}`);
		console.log('PREVIEW OF CHANGES:');
		console.log(`${'─'.repeat(80)}\n`);

		console.log('Statement                                    | Current Pro | New Pro | Current Con | New Con');
		console.log(`${'─'.repeat(100)}`);

		// Show first 50 changes
		const previewUpdates = updates.slice(0, 50);
		for (const update of previewUpdates) {
			const title = update.statement.substring(0, 40).padEnd(40);
			const curPro = (update.currentPro?.toString() ?? 'N/A').padStart(11);
			const newPro = update.newPro.toString().padStart(7);
			const curCon = (update.currentCon?.toString() ?? 'N/A').padStart(11);
			const newCon = update.newCon.toString().padStart(7);

			console.log(`${title} | ${curPro} | ${newPro} | ${curCon} | ${newCon}`);
		}

		if (updates.length > 50) {
			console.log(`... and ${updates.length - 50} more`);
		}
	}

	// Apply changes
	if (!DRY_RUN && updates.length > 0) {
		console.log(`\n${'─'.repeat(80)}`);
		console.log('APPLYING CHANGES...');
		console.log(`${'─'.repeat(80)}\n`);

		// Process in batches
		let batchCount = 0;
		let batch: WriteBatch = db.batch();
		let batchItems = 0;

		for (const update of updates) {
			const ref = db.collection('statements').doc(update.statementId);
			batch.update(ref, {
				'evaluation.numberOfProEvaluators': update.newPro,
				'evaluation.numberOfConEvaluators': update.newCon,
				'lastUpdate': Date.now(),
			});
			batchItems++;

			if (batchItems >= BATCH_SIZE) {
				await batch.commit();
				batchCount++;
				console.log(`Committed batch ${batchCount} (${batchItems} updates)`);
				batch = db.batch();
				batchItems = 0;
			}
		}

		// Commit remaining
		if (batchItems > 0) {
			await batch.commit();
			batchCount++;
			console.log(`Committed batch ${batchCount} (${batchItems} updates)`);
		}

		console.log(`\nTotal batches committed: ${batchCount}`);
		console.log(`Total statements updated: ${updates.length}`);
	} else if (DRY_RUN) {
		console.log(`\nDRY RUN - No changes written. Set DRY_RUN = false to apply changes.`);
	}

	// Summary
	console.log(`\n${'='.repeat(80)}`);
	console.log('SUMMARY');
	console.log(`${'='.repeat(80)}`);
	console.log(`Total statements processed: ${processed}`);
	console.log(`Statements needing update: ${updates.length}`);
	console.log(`${'='.repeat(80)}\n`);
}

// Run
migrateProConCounts()
	.then(() => process.exit(0))
	.catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
