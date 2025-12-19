/**
 * Script to recalculate agreement using the new proportional penalty formula
 *
 * Target: Sub-statements of a specific parent statement
 *
 * New Formula:
 *   availableRange = mean + 1
 *   penalty = min(SEM, availableRange)
 *   agreement = mean - penalty
 *
 * Run with: npx tsx scripts/recalculateAgreement.ts
 */

import { initializeApp, cert, getApps, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const DRY_RUN = false; // Set to false to actually write changes
const PARENT_STATEMENT_ID = 'IKfJPPyXA7tb';
const FLOOR_STD_DEV = 0.5;

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

interface EvaluationData {
	sumEvaluations?: number;
	sumSquaredEvaluations?: number;
	numberOfEvaluators?: number;
	agreement?: number;
	averageEvaluation?: number;
}

interface StatementData {
	statementId: string;
	statement: string;
	parentId: string;
	topParentId?: string;
	consensus?: number;
	evaluation?: EvaluationData;
	hide?: boolean;
}

/**
 * Calculate Standard Error with floor
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
	const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
	const sem = adjustedStdDev / Math.sqrt(numberOfEvaluators);

	return sem;
}

/**
 * Calculate agreement using the new proportional penalty formula
 */
function calcAgreement(
	sumEvaluations: number,
	sumSquaredEvaluations: number,
	numberOfEvaluators: number
): number {
	if (numberOfEvaluators === 0) return 0;

	const mean = sumEvaluations / numberOfEvaluators;
	const sem = calcStandardError(sumEvaluations, sumSquaredEvaluations, numberOfEvaluators);

	// Proportional penalty bounded by available range to -1
	const availableRange = mean + 1;
	const penalty = Math.min(sem, availableRange);
	const agreement = mean - penalty;

	return agreement;
}

async function recalculateAgreement(): Promise<void> {
	console.log(`\n${'='.repeat(80)}`);
	console.log(`RECALCULATE AGREEMENT - Proportional Penalty Formula`);
	console.log(`${'='.repeat(80)}`);
	console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'LIVE (changes will be written)'}`);
	console.log(`Parent Statement ID: ${PARENT_STATEMENT_ID}\n`);

	// First, check the parent statement itself
	const parentDoc = await db.collection('statements').doc(PARENT_STATEMENT_ID).get();
	if (parentDoc.exists) {
		const parentData = parentDoc.data() as StatementData;
		console.log(`Parent statement: "${parentData.statement?.substring(0, 60)}..."`);
		console.log(`Parent's topParentId: ${parentData.topParentId}\n`);
	} else {
		console.log(`Parent statement ${PARENT_STATEMENT_ID} not found!\n`);
	}

	// 1. Get all statements under this parent - try both topParentId and parentId
	const [byTopParent, byParent] = await Promise.all([
		db.collection('statements').where('topParentId', '==', PARENT_STATEMENT_ID).get(),
		db.collection('statements').where('parentId', '==', PARENT_STATEMENT_ID).get(),
	]);

	console.log(`Found ${byTopParent.size} statements by topParentId`);
	console.log(`Found ${byParent.size} statements by parentId\n`);

	// Merge results (avoid duplicates)
	const seenIds = new Set<string>();
	const allDocs = [...byTopParent.docs, ...byParent.docs].filter(doc => {
		if (seenIds.has(doc.id)) return false;
		seenIds.add(doc.id);
		return true;
	});

	const statementsSnapshot = { size: allDocs.length, docs: allDocs };

	const allStatements: StatementData[] = statementsSnapshot.docs.map(doc => ({
		...doc.data() as StatementData,
		statementId: doc.id,
	}));

	// 2. Filter to statements with evaluation data
	const statementsWithEvaluation = allStatements.filter(s =>
		s.evaluation?.numberOfEvaluators &&
		s.evaluation.numberOfEvaluators > 0 &&
		s.evaluation.sumEvaluations !== undefined &&
		s.evaluation.sumSquaredEvaluations !== undefined
	);

	console.log(`Statements with evaluation data: ${statementsWithEvaluation.length}\n`);

	// 3. Calculate changes
	const changes: Array<{
		stmt: StatementData;
		oldAgreement: number;
		newAgreement: number;
		mean: number;
		sem: number;
	}> = [];

	for (const stmt of statementsWithEvaluation) {
		const eval_ = stmt.evaluation!;
		const oldAgreement = eval_.agreement ?? stmt.consensus ?? 0;

		const newAgreement = calcAgreement(
			eval_.sumEvaluations!,
			eval_.sumSquaredEvaluations!,
			eval_.numberOfEvaluators!
		);

		const mean = eval_.sumEvaluations! / eval_.numberOfEvaluators!;
		const sem = calcStandardError(
			eval_.sumEvaluations!,
			eval_.sumSquaredEvaluations!,
			eval_.numberOfEvaluators!
		);

		// Only include if there's a meaningful difference
		if (Math.abs(oldAgreement - newAgreement) > 0.0001) {
			changes.push({
				stmt,
				oldAgreement,
				newAgreement,
				mean,
				sem,
			});
		}
	}

	console.log(`Statements needing update: ${changes.length}\n`);

	// 4. Preview changes
	console.log(`${'─'.repeat(80)}`);
	console.log('PREVIEW OF CHANGES:');
	console.log(`${'─'.repeat(80)}\n`);

	// Sort by change magnitude for visibility
	changes.sort((a, b) => Math.abs(b.oldAgreement - b.newAgreement) - Math.abs(a.oldAgreement - a.newAgreement));

	console.log('Statement                                    | Evals | Mean   | SEM    | Old    | New    | Diff');
	console.log(`${'─'.repeat(100)}`);

	for (const change of changes) {
		const title = change.stmt.statement.substring(0, 40).padEnd(40);
		const evals = change.stmt.evaluation!.numberOfEvaluators!.toString().padStart(5);
		const mean = change.mean.toFixed(3).padStart(6);
		const sem = change.sem.toFixed(3).padStart(6);
		const old = change.oldAgreement.toFixed(3).padStart(6);
		const newVal = change.newAgreement.toFixed(3).padStart(6);
		const diff = (change.newAgreement - change.oldAgreement).toFixed(3).padStart(6);

		console.log(`${title} | ${evals} | ${mean} | ${sem} | ${old} | ${newVal} | ${diff}`);
	}

	// Show out-of-range corrections
	const outOfRange = changes.filter(c => c.oldAgreement < -1 || c.oldAgreement > 1);
	if (outOfRange.length > 0) {
		console.log(`\n${'─'.repeat(80)}`);
		console.log(`OUT-OF-RANGE CORRECTIONS (${outOfRange.length}):`);
		console.log(`${'─'.repeat(80)}`);
		for (const c of outOfRange) {
			console.log(`  ${c.stmt.statement.substring(0, 50)}: ${c.oldAgreement.toFixed(3)} -> ${c.newAgreement.toFixed(3)}`);
		}
	}

	// 5. Apply changes if not dry run
	if (!DRY_RUN) {
		console.log(`\n${'─'.repeat(80)}`);
		console.log('APPLYING CHANGES...');
		console.log(`${'─'.repeat(80)}\n`);

		const batch = db.batch();
		let updateCount = 0;

		for (const change of changes) {
			const ref = db.collection('statements').doc(change.stmt.statementId);
			batch.update(ref, {
				'evaluation.agreement': change.newAgreement,
				'consensus': change.newAgreement,
				'lastUpdate': Date.now(),
			});
			updateCount++;
		}

		await batch.commit();
		console.log(`Updated ${updateCount} statements`);
	} else {
		console.log(`\nDRY RUN - No changes written. Set DRY_RUN = false to apply changes.`);
	}

	// Summary stats
	console.log(`\n${'='.repeat(80)}`);
	console.log('SUMMARY');
	console.log(`${'='.repeat(80)}`);
	console.log(`Total statements: ${allStatements.length}`);
	console.log(`With evaluation data: ${statementsWithEvaluation.length}`);
	console.log(`Needing update: ${changes.length}`);
	console.log(`Out-of-range corrections: ${outOfRange.length}`);
	console.log(`${'='.repeat(80)}\n`);
}

// Run
recalculateAgreement()
	.then(() => process.exit(0))
	.catch(err => {
		console.error('Error:', err);
		process.exit(1);
	});
