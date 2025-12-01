/**
 * Script to recalculate consensus scores using the new Mean - SEM formula
 * with Uncertainty Floor for all options under a specific topParentId.
 *
 * Run with: npx tsx scripts/recalculateConsensus.ts
 *
 * NOTE: This script uses the Firebase Client SDK with service account credentials.
 * You need to set GOOGLE_APPLICATION_CREDENTIALS env var or download a service account key.
 *
 * To get a service account key:
 * 1. Go to Firebase Console > Project Settings > Service accounts
 * 2. Click "Generate new private key"
 * 3. Run: GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json npx tsx scripts/recalculateConsensus.ts
 */

import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Try to find service account key in common locations
function findServiceAccountKey(): ServiceAccount | null {
	const possiblePaths = [
		process.env.GOOGLE_APPLICATION_CREDENTIALS,
		path.join(__dirname, 'serviceAccountKey.json'),
		path.join(__dirname, '../serviceAccountKey.json'),
		path.join(__dirname, '../../serviceAccountKey.json'),
		path.join(process.env.HOME || '', '.config/firebase/serviceAccountKey.json'),
	].filter(Boolean) as string[];

	for (const keyPath of possiblePaths) {
		if (fs.existsSync(keyPath)) {
			console.log(`✓ Found service account key at: ${keyPath}`);
			return JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as ServiceAccount;
		}
	}

	return null;
}

// Initialize Firebase Admin
if (!getApps().length) {
	const serviceAccount = findServiceAccountKey();

	if (serviceAccount) {
		initializeApp({
			credential: cert(serviceAccount),
		});
		console.log('✓ Initialized Firebase Admin with service account');
	} else {
		console.error(`
❌ No service account key found!

To run this script, you need a service account key:

1. Go to Firebase Console > freedi-test > Project Settings > Service accounts
2. Click "Generate new private key"
3. Save the file and run:

   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json npx tsx scripts/recalculateConsensus.ts

   OR save as: functions/scripts/serviceAccountKey.json
`);
		process.exit(1);
	}
}

const db = getFirestore();

// The Uncertainty Floor constant
const FLOOR_STD_DEV = 0.5;

/**
 * Calculates the standard error of the mean (SEM) with Uncertainty Floor
 */
function calcStandardError(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	if (numberOfEvaluators <= 1) return FLOOR_STD_DEV;

	const mean = sumEvaluations / numberOfEvaluators;
	const variance = (sumSquaredEvaluations / numberOfEvaluators) - (mean * mean);
	const safeVariance = Math.max(0, variance);
	const observedStdDev = Math.sqrt(safeVariance);

	// Apply the Uncertainty Floor
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
	const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

	return sem;
}

/**
 * Calculates consensus score using Mean - SEM with Uncertainty Floor
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	return mean - sem;
}

async function recalculateConsensus(topParentId: string): Promise<void> {
	console.log(`\n🔄 Recalculating consensus for options under topParentId: ${topParentId}\n`);

	// Query all options under this topParentId
	const optionsSnapshot = await db.collection('statements')
		.where('topParentId', '==', topParentId)
		.where('statementType', '==', 'option')
		.get();

	if (optionsSnapshot.empty) {
		console.log('No options found under this topParentId');
		return;
	}

	console.log(`Found ${optionsSnapshot.size} options to process\n`);
	console.log('─'.repeat(80));
	console.log('| Statement (first 30 chars)          | Old Consensus | New Consensus | Change  |');
	console.log('─'.repeat(80));

	const batch = db.batch();
	let updatedCount = 0;

	for (const doc of optionsSnapshot.docs) {
		const data = doc.data();
		const evaluation = data.evaluation || {};

		const sumEvaluations = evaluation.sumEvaluations || 0;
		const sumSquaredEvaluations = evaluation.sumSquaredEvaluations || 0;
		const numberOfEvaluators = evaluation.numberOfEvaluators || 0;

		const oldConsensus = data.consensus || 0;
		const newConsensus = calcAgreement(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

		const statementText = (data.statement || '').substring(0, 30).padEnd(30);
		const change = newConsensus - oldConsensus;
		const changeStr = change >= 0 ? `+${change.toFixed(3)}` : change.toFixed(3);

		console.log(`| ${statementText} | ${oldConsensus.toFixed(3).padStart(13)} | ${newConsensus.toFixed(3).padStart(13)} | ${changeStr.padStart(7)} |`);

		// Update the document
		batch.update(doc.ref, {
			consensus: newConsensus,
			'evaluation.agreement': newConsensus,
			lastUpdate: Date.now()
		});
		updatedCount++;
	}

	console.log('─'.repeat(80));

	// Commit the batch
	await batch.commit();

	console.log(`\n✅ Successfully updated ${updatedCount} options\n`);
}

// Main execution
const TOP_PARENT_ID = '23sMIMXgmpg9';

recalculateConsensus(TOP_PARENT_ID)
	.then(() => {
		console.log('Script completed successfully');
		process.exit(0);
	})
	.catch((error) => {
		console.error('Error running script:', error);
		process.exit(1);
	});
