/**
 * Script to sync consensus field with evaluation.agreement
 *
 * This script does NOT recalculate agreement from raw evaluations.
 * It simply:
 * 1. Clamps existing evaluation.agreement to [-1, 1]
 * 2. Copies evaluation.agreement to consensus field
 * 3. Re-sorts and updates results[] arrays
 *
 * Safe to run even with merged statements since we don't touch evaluation calculations.
 *
 * Run with: npx tsx scripts/syncConsensusWithAgreement.ts
 */

import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DRY_RUN = true; // Set to false to actually write changes
const TOP_PARENT_ID = '8nTPbsPSv371'; // The carcur discussion

// Try to find service account key
function findServiceAccountKey(): ServiceAccount | null {
	const possiblePaths = [
		process.env.GOOGLE_APPLICATION_CREDENTIALS,
		path.join(__dirname, 'serviceAccountKey.json'),
		path.join(__dirname, '../serviceAccountKey.json'),
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
		initializeApp({ credential: cert(serviceAccount) });
		console.log('✓ Initialized Firebase Admin');
	} else {
		console.error('❌ No service account key found!');
		process.exit(1);
	}
}

const db = getFirestore();

interface StatementData {
	statementId: string;
	statement: string;
	parentId: string;
	consensus?: number;
	evaluation?: {
		agreement?: number;
		numberOfEvaluators?: number;
		averageEvaluation?: number;
		sumEvaluations?: number;
	};
	statementType?: string;
	results?: Array<{
		statementId: string;
		statement: string;
		consensus: number;
	}>;
}

/**
 * Clamp value to [-1, 1] range
 */
function clamp(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

/**
 * Create a SimpleStatement for results array
 */
function toSimpleStatement(stmt: StatementData): { statementId: string; statement: string; consensus: number; parentId: string } {
	const agreement = stmt.evaluation?.agreement ?? stmt.consensus ?? 0;
	return {
		statementId: stmt.statementId,
		statement: stmt.statement,
		parentId: stmt.parentId,
		consensus: clamp(agreement),
	};
}

async function syncConsensusWithAgreement(): Promise<void> {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`SYNC CONSENSUS WITH EVALUATION.AGREEMENT`);
	console.log(`${'='.repeat(80)}`);
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'LIVE (changes will be written)'}`);
	console.log(`Top Parent ID: ${TOP_PARENT_ID}\n`);

	// 1. Get all statements under this topParentId
	const statementsSnapshot = await db.collection('statements')
		.where('topParentId', '==', TOP_PARENT_ID)
		.get();

	console.log(`Found ${statementsSnapshot.size} statements\n`);

	const allStatements: StatementData[] = statementsSnapshot.docs.map(doc => ({
		...doc.data() as StatementData,
		statementId: doc.id,
	}));

	// 2. Find statements that need consensus synced
	const needsSync: StatementData[] = [];
	const outOfRange: StatementData[] = [];

	for (const stmt of allStatements) {
		const agreement = stmt.evaluation?.agreement;
		const consensus = stmt.consensus ?? 0;

		if (agreement !== undefined) {
			// Check if out of range
			if (agreement < -1 || agreement > 1) {
				outOfRange.push(stmt);
			}

			// Check if consensus doesn't match agreement
			const clampedAgreement = clamp(agreement);
			if (Math.abs(consensus - clampedAgreement) > 0.0001) {
				needsSync.push(stmt);
			}
		}
	}

	console.log(`Statements with out-of-range agreement: ${outOfRange.length}`);
	for (const stmt of outOfRange) {
		console.log(`  - ${stmt.statement.substring(0, 40)}: agreement=${stmt.evaluation?.agreement?.toFixed(4)}`);
	}

	console.log(`\nStatements needing consensus sync: ${needsSync.length}`);

	// 3. Find parent statements that have results[] arrays
	const parentsWithResults = allStatements.filter(s => s.results && s.results.length > 0);
	console.log(`Parent statements with results[]: ${parentsWithResults.length}\n`);

	// 4. Preview changes
	console.log(`${'─'.repeat(80)}`);
	console.log('PREVIEW OF CHANGES:');
	console.log(`${'─'.repeat(80)}`);

	// Show sample of consensus sync changes
	console.log('\nConsensus sync samples (first 10):');
	for (const stmt of needsSync.slice(0, 10)) {
		const oldConsensus = stmt.consensus ?? 0;
		const newConsensus = clamp(stmt.evaluation?.agreement ?? 0);
		console.log(`  ${stmt.statement.substring(0, 35).padEnd(35)} | old=${oldConsensus.toFixed(4)} → new=${newConsensus.toFixed(4)}`);
	}

	// Show results[] re-sorting preview for each parent
	for (const parent of parentsWithResults) {
		console.log(`\nResults for: ${parent.statement.substring(0, 50)}`);

		// Get child options
		const childOptions = allStatements.filter(s =>
			s.parentId === parent.statementId &&
			(s.statementType === 'option' || !s.statementType)
		);

		// Sort by evaluation.agreement (clamped)
		const sorted = [...childOptions]
			.filter(s => s.evaluation?.numberOfEvaluators && s.evaluation.numberOfEvaluators > 0)
			.sort((a, b) => {
				const aVal = clamp(a.evaluation?.agreement ?? a.consensus ?? 0);
				const bVal = clamp(b.evaluation?.agreement ?? b.consensus ?? 0);
				return bVal - aVal;
			});

		console.log('  NEW order (top 10 by evaluation.agreement):');
		for (let i = 0; i < Math.min(10, sorted.length); i++) {
			const s = sorted[i];
			const agreement = clamp(s.evaluation?.agreement ?? 0);
			const numEvals = s.evaluation?.numberOfEvaluators ?? 0;
			console.log(`    ${i + 1}. agreement=${agreement.toFixed(4)}, evals=${numEvals.toString().padStart(2)} | ${s.statement.substring(0, 45)}`);
		}
	}

	// 5. Apply changes if not dry run
	if (!DRY_RUN) {
		console.log(`\n${'─'.repeat(80)}`);
		console.log('APPLYING CHANGES...');
		console.log(`${'─'.repeat(80)}\n`);

		const batch = db.batch();
		let updateCount = 0;

		// Update consensus for all statements that need it
		for (const stmt of needsSync) {
			const newConsensus = clamp(stmt.evaluation?.agreement ?? 0);
			const ref = db.collection('statements').doc(stmt.statementId);
			batch.update(ref, {
				consensus: newConsensus,
				lastUpdate: Date.now(),
			});
			updateCount++;
		}

		// Update results[] arrays for parents
		for (const parent of parentsWithResults) {
			const childOptions = allStatements.filter(s =>
				s.parentId === parent.statementId &&
				(s.statementType === 'option' || !s.statementType)
			);

			// Sort by evaluation.agreement, filter to those with evaluators
			const sorted = [...childOptions]
				.filter(s => s.evaluation?.numberOfEvaluators && s.evaluation.numberOfEvaluators > 0)
				.sort((a, b) => {
					const aVal = clamp(a.evaluation?.agreement ?? a.consensus ?? 0);
					const bVal = clamp(b.evaluation?.agreement ?? b.consensus ?? 0);
					return bVal - aVal;
				});

			// Take top results (same count as current)
			const topCount = parent.results?.length ?? 5;
			const newResults = sorted.slice(0, topCount).map(toSimpleStatement);

			const ref = db.collection('statements').doc(parent.statementId);
			batch.update(ref, {
				results: newResults,
				totalResults: newResults.length,
				lastUpdate: Date.now(),
			});
			updateCount++;
		}

		await batch.commit();
		console.log(`✓ Updated ${updateCount} statements`);
	} else {
		console.log(`\n⚠️  DRY RUN - No changes written. Set DRY_RUN = false to apply changes.`);
	}

	console.log(`\n${'='.repeat(80)}`);
	console.log('DONE');
	console.log(`${'='.repeat(80)}\n`);
}

// Run
syncConsensusWithAgreement()
	.then(() => process.exit(0))
	.catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
