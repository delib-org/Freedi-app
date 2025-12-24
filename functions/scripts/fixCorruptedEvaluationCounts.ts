/**
 * Script to fix corrupted evaluation counts where numberOfProEvaluators/numberOfConEvaluators
 * don't match the actual evaluation data.
 *
 * Usage:
 * FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/fixCorruptedEvaluationCounts.ts
 *
 * Or for production (BE CAREFUL!):
 * GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json npx tsx scripts/fixCorruptedEvaluationCounts.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, Evaluation } from '@freedi/shared-types';

// Initialize Firebase Admin
if (getApps().length === 0) {
	const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
	if (serviceAccountPath) {
		// Production - use service account
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const serviceAccount = require(serviceAccountPath);
		initializeApp({
			credential: cert(serviceAccount),
		});
	} else if (process.env.FIRESTORE_EMULATOR_HOST) {
		// Emulator
		initializeApp({ projectId: 'demo-test' });
	} else {
		console.error('No credentials provided. Set GOOGLE_APPLICATION_CREDENTIALS or FIRESTORE_EMULATOR_HOST');
		process.exit(1);
	}
}

const db = getFirestore();

interface FixResult {
	statementId: string;
	statement: string;
	before: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		totalEvaluators: number;
	};
	after: {
		numberOfEvaluators: number;
		numberOfProEvaluators: number;
		numberOfConEvaluators: number;
		totalEvaluators: number;
	};
	actualEvaluations: {
		total: number;
		pro: number;
		con: number;
		neutral: number;
	};
}

async function fixStatementEvaluationCounts(statementId: string): Promise<FixResult | null> {
	const statementRef = db.collection(Collections.statements).doc(statementId);
	const statementDoc = await statementRef.get();

	if (!statementDoc.exists) {
		console.error(`Statement ${statementId} not found`);
		return null;
	}

	const statement = statementDoc.data() as Statement;

	// Get all actual evaluations for this statement
	const evaluationsSnapshot = await db
		.collection(Collections.evaluations)
		.where('statementId', '==', statementId)
		.get();

	// Calculate actual counts from evaluation documents
	let actualProCount = 0;
	let actualConCount = 0;
	let actualNeutralCount = 0;
	let sumEvaluations = 0;
	let sumSquaredEvaluations = 0;
	let sumPro = 0;
	let sumCon = 0;

	evaluationsSnapshot.forEach((doc) => {
		const evaluation = doc.data() as Evaluation;
		const evalValue = evaluation.evaluation;

		if (evalValue > 0) {
			actualProCount++;
			sumPro += evalValue;
		} else if (evalValue < 0) {
			actualConCount++;
			sumCon += Math.abs(evalValue);
		} else {
			actualNeutralCount++;
		}

		sumEvaluations += evalValue;
		sumSquaredEvaluations += evalValue * evalValue;
	});

	const totalWithNonZeroEval = actualProCount + actualConCount;

	// Current values
	const currentEval = statement.evaluation || {
		numberOfEvaluators: 0,
		numberOfProEvaluators: 0,
		numberOfConEvaluators: 0,
	};

	const before = {
		numberOfEvaluators: currentEval.numberOfEvaluators || 0,
		numberOfProEvaluators: currentEval.numberOfProEvaluators || 0,
		numberOfConEvaluators: currentEval.numberOfConEvaluators || 0,
		totalEvaluators: statement.totalEvaluators || 0,
	};

	// Check if there's a mismatch
	const hasProMismatch = before.numberOfProEvaluators !== actualProCount;
	const hasConMismatch = before.numberOfConEvaluators !== actualConCount;
	const hasEvaluatorMismatch = before.numberOfEvaluators !== totalWithNonZeroEval;

	if (!hasProMismatch && !hasConMismatch && !hasEvaluatorMismatch) {
		console.info(`Statement ${statementId} has correct counts, skipping`);
		return null;
	}

	// Calculate correct averageEvaluation and agreement
	const averageEvaluation = totalWithNonZeroEval > 0 ? sumEvaluations / totalWithNonZeroEval : 0;

	// Mean - SEM with uncertainty floor (same as fn_evaluation.ts)
	const FLOOR_STD_DEV = 0.5;
	let agreement = 0;
	if (totalWithNonZeroEval > 0) {
		const mean = sumEvaluations / totalWithNonZeroEval;
		let sem = FLOOR_STD_DEV;

		if (totalWithNonZeroEval > 1) {
			const variance = sumSquaredEvaluations / totalWithNonZeroEval - mean * mean;
			const observedStdDev = Math.sqrt(Math.max(0, variance));
			const adjustedStdDev = Math.max(observedStdDev, FLOOR_STD_DEV);
			sem = adjustedStdDev / Math.sqrt(totalWithNonZeroEval);
		}

		const availableRange = mean + 1;
		const penalty = Math.min(sem, availableRange);
		agreement = mean - penalty;
	}

	// Update the statement
	await statementRef.update({
		'evaluation.numberOfEvaluators': totalWithNonZeroEval,
		'evaluation.numberOfProEvaluators': actualProCount,
		'evaluation.numberOfConEvaluators': actualConCount,
		'evaluation.sumEvaluations': sumEvaluations,
		'evaluation.sumSquaredEvaluations': sumSquaredEvaluations,
		'evaluation.sumPro': sumPro,
		'evaluation.sumCon': sumCon,
		'evaluation.averageEvaluation': averageEvaluation,
		'evaluation.agreement': agreement,
		totalEvaluators: totalWithNonZeroEval,
		consensus: agreement,
		lastUpdate: Date.now(),
	});

	const after = {
		numberOfEvaluators: totalWithNonZeroEval,
		numberOfProEvaluators: actualProCount,
		numberOfConEvaluators: actualConCount,
		totalEvaluators: totalWithNonZeroEval,
	};

	return {
		statementId,
		statement: statement.statement.substring(0, 50),
		before,
		after,
		actualEvaluations: {
			total: evaluationsSnapshot.size,
			pro: actualProCount,
			con: actualConCount,
			neutral: actualNeutralCount,
		},
	};
}

async function findAndFixCorruptedStatements(parentId?: string): Promise<void> {
	console.info('Looking for statements with corrupted evaluation counts...');

	let query = db.collection(Collections.statements).where('statementType', '==', 'option');

	if (parentId) {
		query = query.where('parentId', '==', parentId);
	}

	const snapshot = await query.get();
	console.info(`Found ${snapshot.size} option statements to check`);

	const results: FixResult[] = [];
	let checked = 0;

	for (const doc of snapshot.docs) {
		checked++;
		if (checked % 100 === 0) {
			console.info(`Checked ${checked}/${snapshot.size} statements...`);
		}

		const result = await fixStatementEvaluationCounts(doc.id);
		if (result) {
			results.push(result);
			console.info(`Fixed: ${result.statementId} - "${result.statement}"`);
			console.info(`  Before: pro=${result.before.numberOfProEvaluators}, con=${result.before.numberOfConEvaluators}, total=${result.before.numberOfEvaluators}`);
			console.info(`  After:  pro=${result.after.numberOfProEvaluators}, con=${result.after.numberOfConEvaluators}, total=${result.after.numberOfEvaluators}`);
		}
	}

	console.info('\n========== SUMMARY ==========');
	console.info(`Total checked: ${snapshot.size}`);
	console.info(`Total fixed: ${results.length}`);

	if (results.length > 0) {
		console.info('\nFixed statements:');
		for (const result of results) {
			console.info(`  - ${result.statementId}: pro ${result.before.numberOfProEvaluators} -> ${result.after.numberOfProEvaluators}, con ${result.before.numberOfConEvaluators} -> ${result.after.numberOfConEvaluators}`);
		}
	}
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--help')) {
	console.info(`
Usage: npx tsx scripts/fixCorruptedEvaluationCounts.ts [options]

Options:
  --statement <id>   Fix a specific statement by ID
  --parent <id>      Fix all options under a specific parent
  --all              Fix all option statements (be careful!)
  --help             Show this help message

Examples:
  npx tsx scripts/fixCorruptedEvaluationCounts.ts --statement dOX2A6HMUh3Qnfe3WA5Q
  npx tsx scripts/fixCorruptedEvaluationCounts.ts --parent IKfJPPyXA7tb
  `);
	process.exit(0);
}

if (args.includes('--statement')) {
	const statementIdIndex = args.indexOf('--statement') + 1;
	const statementId = args[statementIdIndex];
	if (!statementId) {
		console.error('Please provide a statement ID');
		process.exit(1);
	}
	fixStatementEvaluationCounts(statementId).then((result) => {
		if (result) {
			console.info('Fixed statement:', JSON.stringify(result, null, 2));
		} else {
			console.info('No fix needed or statement not found');
		}
		process.exit(0);
	});
} else if (args.includes('--parent')) {
	const parentIdIndex = args.indexOf('--parent') + 1;
	const parentId = args[parentIdIndex];
	if (!parentId) {
		console.error('Please provide a parent ID');
		process.exit(1);
	}
	findAndFixCorruptedStatements(parentId).then(() => process.exit(0));
} else if (args.includes('--all')) {
	console.warn('WARNING: This will check ALL option statements. Are you sure?');
	console.warn('Press Ctrl+C to cancel, or wait 5 seconds to continue...');
	setTimeout(() => {
		findAndFixCorruptedStatements().then(() => process.exit(0));
	}, 5000);
} else {
	console.info('Please specify --statement, --parent, or --all. Use --help for more info.');
	process.exit(1);
}
