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

import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { Collections, Statement, Evaluation } from '@freedi/shared-types';
// Pure counting rule + N walk shared with the callable, so this script writes
// exactly what the live trigger and "Recalculate" write.
import {
	hasCounterMismatch,
	recomputeOptionCounters,
} from '../src/evaluation/recomputeOptionCounters';
import { resolveQuestionPopulation } from '../src/evaluation/resolveQuestionPopulation';

// Initialize Firebase Admin
if (getApps().length === 0) {
	const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
	const projectId = process.env.FIREBASE_PROJECT_ID;
	if (serviceAccountPath) {
		// Production - use service account key file
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const serviceAccount = require(serviceAccountPath);
		initializeApp({
			credential: cert(serviceAccount),
		});
	} else if (projectId) {
		// Use Application Default Credentials with explicit project ID
		initializeApp({
			credential: applicationDefault(),
			projectId,
		});
	} else if (process.env.FIRESTORE_EMULATOR_HOST) {
		// Emulator
		initializeApp({ projectId: 'demo-test' });
	} else {
		console.error(
			'No credentials provided. Set GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_PROJECT_ID, or FIRESTORE_EMULATOR_HOST',
		);
		process.exit(1);
	}
}

const db = getFirestore();

// N is explicit per question; resolve it once per parent, not once per option.
const populationByParent = new Map<string, number | undefined>();

async function populationFor(parentId: string | undefined): Promise<number | undefined> {
	if (!parentId) return undefined;
	if (!populationByParent.has(parentId)) {
		populationByParent.set(parentId, await resolveQuestionPopulation(db, parentId));
	}

	return populationByParent.get(parentId);
}

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

	// EVERY evaluation document is a participant, zeros included.
	const evals = evaluationsSnapshot.docs.map((doc) => doc.data() as Evaluation);
	const counters = recomputeOptionCounters(evals, await populationFor(statement.parentId));
	const actualNeutralCount = evals.filter((e) => e.evaluation === 0).length;

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

	if (!hasCounterMismatch(statement.evaluation, counters)) {
		console.info(`Statement ${statementId} has correct counts, skipping`);

		return null;
	}

	// Update the statement
	await statementRef.update({
		'evaluation.numberOfEvaluators': counters.numberOfEvaluators,
		'evaluation.numberOfProEvaluators': counters.numberOfProEvaluators,
		'evaluation.numberOfConEvaluators': counters.numberOfConEvaluators,
		'evaluation.sumEvaluations': counters.sumEvaluations,
		'evaluation.sumSquaredEvaluations': counters.sumSquaredEvaluations,
		'evaluation.sumPro': counters.sumPro,
		'evaluation.sumCon': counters.sumCon,
		'evaluation.averageEvaluation': counters.averageEvaluation,
		'evaluation.agreement': counters.agreement,
		'evaluation.agreementIndex': counters.agreementIndex,
		'evaluation.stakeholderCount': counters.stakeholderCount ?? FieldValue.delete(),
		totalEvaluators: counters.numberOfEvaluators,
		consensus: counters.agreement,
		lastUpdate: Date.now(),
	});

	const after = {
		numberOfEvaluators: counters.numberOfEvaluators,
		numberOfProEvaluators: counters.numberOfProEvaluators,
		numberOfConEvaluators: counters.numberOfConEvaluators,
		totalEvaluators: counters.numberOfEvaluators,
	};

	return {
		statementId,
		statement: statement.statement.substring(0, 50),
		before,
		after,
		actualEvaluations: {
			total: evaluationsSnapshot.size,
			pro: counters.numberOfProEvaluators,
			con: counters.numberOfConEvaluators,
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
			console.info(
				`  Before: pro=${result.before.numberOfProEvaluators}, con=${result.before.numberOfConEvaluators}, total=${result.before.numberOfEvaluators}`,
			);
			console.info(
				`  After:  pro=${result.after.numberOfProEvaluators}, con=${result.after.numberOfConEvaluators}, total=${result.after.numberOfEvaluators}`,
			);
		}
	}

	console.info('\n========== SUMMARY ==========');
	console.info(`Total checked: ${snapshot.size}`);
	console.info(`Total fixed: ${results.length}`);

	if (results.length > 0) {
		console.info('\nFixed statements:');
		for (const result of results) {
			console.info(
				`  - ${result.statementId}: pro ${result.before.numberOfProEvaluators} -> ${result.after.numberOfProEvaluators}, con ${result.before.numberOfConEvaluators} -> ${result.after.numberOfConEvaluators}`,
			);
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
