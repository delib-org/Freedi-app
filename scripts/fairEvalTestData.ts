/**
 * Fair Evaluation Test Data Script
 *
 * Creates realistic test data for the fair evaluation feature:
 * 1. Test group + 10 users + subscriptions
 * 2. 3 answers with different costs
 * 3. Simulated evaluations
 * 4. Runs full acceptance flow
 * 5. Verifies payments and recalculations
 *
 * Run with: FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/fairEvalTestData.ts
 */

import admin from 'firebase-admin';
import { Collections, Role, StatementType } from 'delib-npm';
import {
	FairEvalWallet,
	FairEvalTransaction,
	FairEvalTransactionType,
	FairEvalAnswerMetrics,
	getWalletId,
	calculateAnswerMetrics,
	calculateAllPayments,
	UserEvaluationData,
} from '@freedi/shared-types';

// Initialize Firebase Admin
if (!admin.apps.length) {
	admin.initializeApp({
		projectId: 'freedi-test',
	});
}

// Connect to emulator if running locally
if (process.env.FIRESTORE_EMULATOR_HOST) {
	const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
	console.info('🔧 Connected to Firestore emulator:', emulatorHost);
} else {
	console.info('⚠️  Warning: Not connected to emulator. Set FIRESTORE_EMULATOR_HOST=localhost:8080');
	process.exit(1);
}

const db = admin.firestore();

// ============================================================================
// TEST DATA CONFIGURATION
// ============================================================================

const TEST_GROUP_ID = 'fair-eval-test-group';
const INITIAL_BALANCE = 10;
const NUM_USERS = 10;

interface TestUser {
	id: string;
	displayName: string;
	email: string;
}

interface TestAnswer {
	id: string;
	statement: string;
	cost: number;
	evaluations: { userId: string; rating: number }[];
}

// Create test users
const testUsers: TestUser[] = Array.from({ length: NUM_USERS }, (_, i) => ({
	id: `test-user-${i + 1}`,
	displayName: `Test User ${i + 1}`,
	email: `testuser${i + 1}@example.com`,
}));

// Create test answers with different scenarios
const testAnswers: TestAnswer[] = [
	{
		id: 'answer-at-goal',
		statement: 'Answer that should reach goal with current contributions',
		cost: 50, // Low cost, easily reached
		evaluations: [
			{ userId: 'test-user-1', rating: 1.0 },
			{ userId: 'test-user-2', rating: 1.0 },
			{ userId: 'test-user-3', rating: 1.0 },
			{ userId: 'test-user-4', rating: 1.0 },
			{ userId: 'test-user-5', rating: 1.0 },
			// 5 users × 10 balance × 1.0 rating = 50 contribution = exactly goal
		],
	},
	{
		id: 'answer-has-support',
		statement: 'Answer with support but needs more contributions',
		cost: 80, // Matches spec example
		evaluations: [
			{ userId: 'test-user-1', rating: 1.0 },
			{ userId: 'test-user-2', rating: 1.0 },
			{ userId: 'test-user-3', rating: 1.0 },
			{ userId: 'test-user-4', rating: 1.0 },
			{ userId: 'test-user-5', rating: 1.0 },
			{ userId: 'test-user-6', rating: 0.5 },
			{ userId: 'test-user-7', rating: 0.5 },
			// W = 6.0, T = 56, D = 24, d = 4
		],
	},
	{
		id: 'answer-no-support',
		statement: 'Answer with no positive support',
		cost: 60,
		evaluations: [
			{ userId: 'test-user-8', rating: 0 },
			{ userId: 'test-user-9', rating: -0.5 },
			{ userId: 'test-user-10', rating: -1.0 },
		],
	},
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateId(): string {
	return Math.random().toString(36).substring(2, 15);
}

async function clearTestData(): Promise<void> {
	console.info('\n🧹 Clearing existing test data...');

	const collections = [
		Collections.statements,
		Collections.statementsSubscribe,
		Collections.evaluations,
		Collections.fairEvalWallets,
		Collections.fairEvalTransactions,
	];

	for (const collection of collections) {
		const snapshot = await db
			.collection(collection)
			.where('topParentId', '==', TEST_GROUP_ID)
			.get();

		if (snapshot.empty) {
			// Also check for the group itself
			const groupDoc = await db.collection(collection).doc(TEST_GROUP_ID).get();
			if (groupDoc.exists) {
				await groupDoc.ref.delete();
			}
			continue;
		}

		const batch = db.batch();
		snapshot.docs.forEach(doc => batch.delete(doc.ref));
		await batch.commit();
		console.info(`  Deleted ${snapshot.size} documents from ${collection}`);
	}
}

// ============================================================================
// DATA CREATION FUNCTIONS
// ============================================================================

async function createTestGroup(): Promise<void> {
	console.info('\n📁 Creating test group...');

	const groupStatement = {
		statementId: TEST_GROUP_ID,
		statement: 'Fair Evaluation Test Group',
		statementType: StatementType.group,
		creatorId: 'admin-user',
		topParentId: TEST_GROUP_ID,
		parentId: 'root',
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		statementSettings: {
			enableFairEvaluation: true,
			initialWalletBalance: INITIAL_BALANCE,
			defaultAnswerCost: 60,
		},
	};

	await db.collection(Collections.statements).doc(TEST_GROUP_ID).set(groupStatement);
	console.info(`  Created group: ${TEST_GROUP_ID}`);
}

async function createTestUsers(): Promise<void> {
	console.info('\n👥 Creating test users and wallets...');

	const batch = db.batch();

	for (const user of testUsers) {
		// Create subscription
		const subscriptionId = `${TEST_GROUP_ID}--${user.id}`;
		const subscription = {
			statementsSubscribeId: subscriptionId,
			statementId: TEST_GROUP_ID,
			userId: user.id,
			role: Role.member,
			topParentId: TEST_GROUP_ID,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
			user: {
				uid: user.id,
				displayName: user.displayName,
				email: user.email,
			},
		};

		batch.set(
			db.collection(Collections.statementsSubscribe).doc(subscriptionId),
			subscription
		);

		// Create wallet
		const walletId = getWalletId(TEST_GROUP_ID, user.id);
		const wallet: FairEvalWallet = {
			walletId,
			userId: user.id,
			topParentId: TEST_GROUP_ID,
			balance: INITIAL_BALANCE,
			totalReceived: INITIAL_BALANCE,
			totalSpent: 0,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		};

		batch.set(db.collection(Collections.fairEvalWallets).doc(walletId), wallet);

		// Create join transaction
		const transactionRef = db.collection(Collections.fairEvalTransactions).doc();
		const transaction: FairEvalTransaction = {
			transactionId: transactionRef.id,
			topParentId: TEST_GROUP_ID,
			userId: user.id,
			type: FairEvalTransactionType.join,
			amount: INITIAL_BALANCE,
			balanceBefore: 0,
			balanceAfter: INITIAL_BALANCE,
			note: 'Initial balance on join',
			createdAt: Date.now(),
		};

		batch.set(transactionRef, transaction);
	}

	await batch.commit();
	console.info(`  Created ${testUsers.length} users with wallets`);
}

async function createQuestionAndAnswers(): Promise<void> {
	console.info('\n❓ Creating question and answers...');

	// Create parent question
	const questionId = `${TEST_GROUP_ID}-question`;
	const question = {
		statementId: questionId,
		statement: 'What is the best approach to solve this problem?',
		statementType: StatementType.question,
		creatorId: 'admin-user',
		topParentId: TEST_GROUP_ID,
		parentId: TEST_GROUP_ID,
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		statementSettings: {
			enableFairEvaluation: true,
			defaultAnswerCost: 60,
		},
	};

	await db.collection(Collections.statements).doc(questionId).set(question);
	console.info(`  Created question: ${questionId}`);

	// Create answers
	for (const answer of testAnswers) {
		const answerDoc = {
			statementId: answer.id,
			statement: answer.statement,
			statementType: StatementType.option,
			creatorId: 'test-user-1',
			topParentId: TEST_GROUP_ID,
			parentId: questionId,
			answerCost: answer.cost,
			createdAt: Date.now(),
			lastUpdate: Date.now(),
		};

		await db.collection(Collections.statements).doc(answer.id).set(answerDoc);
		console.info(`  Created answer: ${answer.id} (cost: ${answer.cost})`);
	}
}

async function createEvaluations(): Promise<void> {
	console.info('\n⭐ Creating evaluations...');

	const batch = db.batch();
	let evalCount = 0;

	for (const answer of testAnswers) {
		for (const evaluation of answer.evaluations) {
			const evaluationId = `${answer.id}--${evaluation.userId}`;
			const evalDoc = {
				evaluationId,
				statementId: answer.id,
				parentId: `${TEST_GROUP_ID}-question`,
				topParentId: TEST_GROUP_ID,
				evaluatorId: evaluation.userId,
				evaluation: evaluation.rating,
				createdAt: Date.now(),
				lastUpdate: Date.now(),
			};

			batch.set(db.collection(Collections.evaluations).doc(evaluationId), evalDoc);
			evalCount++;
		}
	}

	await batch.commit();
	console.info(`  Created ${evalCount} evaluations`);
}

async function calculateAndUpdateMetrics(): Promise<void> {
	console.info('\n📊 Calculating and updating metrics...');

	for (const answer of testAnswers) {
		// Get evaluations with balances
		const evaluations: UserEvaluationData[] = answer.evaluations.map(e => ({
			userId: e.userId,
			evaluation: e.rating,
			walletBalance: INITIAL_BALANCE, // All users start with same balance
		}));

		const metrics = calculateAnswerMetrics(answer.cost, evaluations);

		const fairEvalMetrics: FairEvalAnswerMetrics = {
			answerStatementId: answer.id,
			parentStatementId: `${TEST_GROUP_ID}-question`,
			answerCost: answer.cost,
			weightedSupporters: metrics.weightedSupporters,
			totalContribution: metrics.totalContribution,
			distanceToGoal: metrics.distanceToGoal,
			distancePerSupporter: metrics.distancePerSupporter,
			isAccepted: false,
			lastCalculation: Date.now(),
		};

		await db.collection(Collections.statements).doc(answer.id).update({
			fairEvalMetrics,
		});

		console.info(`  ${answer.id}:`);
		console.info(`    W = ${metrics.weightedSupporters.toFixed(1)}`);
		console.info(`    T = ${metrics.totalContribution}`);
		console.info(`    D = ${metrics.distanceToGoal}`);
		console.info(`    d = ${metrics.distancePerSupporter === Infinity ? '∞' : metrics.distancePerSupporter.toFixed(2)}`);
	}
}

async function simulateAcceptance(): Promise<void> {
	console.info('\n✅ Simulating answer acceptance...');

	// Find the answer that's at goal
	const atGoalAnswer = testAnswers.find(a => a.id === 'answer-at-goal');
	if (!atGoalAnswer) return;

	// Get evaluations with balances
	const evaluations: UserEvaluationData[] = atGoalAnswer.evaluations.map(e => ({
		userId: e.userId,
		evaluation: e.rating,
		walletBalance: INITIAL_BALANCE,
	}));

	const metrics = calculateAnswerMetrics(atGoalAnswer.cost, evaluations);

	if (metrics.distanceToGoal > 0) {
		console.info(`  ⚠️  Answer not at goal (D = ${metrics.distanceToGoal}), skipping acceptance`);
		return;
	}

	// Calculate payments
	const payments = calculateAllPayments(atGoalAnswer.cost, evaluations);

	console.info(`  Processing ${payments.length} payments for ${atGoalAnswer.id}:`);

	const batch = db.batch();

	for (const payment of payments) {
		console.info(`    ${payment.userId}: -${payment.payment.toFixed(2)} min`);

		// Update wallet
		const walletId = getWalletId(TEST_GROUP_ID, payment.userId);
		const walletRef = db.collection(Collections.fairEvalWallets).doc(walletId);

		batch.update(walletRef, {
			balance: admin.firestore.FieldValue.increment(-payment.payment),
			totalSpent: admin.firestore.FieldValue.increment(payment.payment),
			lastUpdate: Date.now(),
		});

		// Create transaction record
		const transactionRef = db.collection(Collections.fairEvalTransactions).doc();
		const txn: FairEvalTransaction = {
			transactionId: transactionRef.id,
			topParentId: TEST_GROUP_ID,
			userId: payment.userId,
			type: FairEvalTransactionType.payment,
			amount: -payment.payment,
			balanceBefore: INITIAL_BALANCE,
			balanceAfter: INITIAL_BALANCE - payment.payment,
			answerStatementId: atGoalAnswer.id,
			answerTitle: atGoalAnswer.statement,
			createdAt: Date.now(),
		};

		batch.set(transactionRef, txn);
	}

	// Mark answer as accepted
	const updatedMetrics: FairEvalAnswerMetrics = {
		answerStatementId: atGoalAnswer.id,
		parentStatementId: `${TEST_GROUP_ID}-question`,
		answerCost: atGoalAnswer.cost,
		weightedSupporters: metrics.weightedSupporters,
		totalContribution: metrics.totalContribution,
		distanceToGoal: 0,
		distancePerSupporter: 0,
		isAccepted: true,
		acceptedAt: Date.now(),
		acceptedBy: 'admin-user',
		lastCalculation: Date.now(),
	};

	batch.update(db.collection(Collections.statements).doc(atGoalAnswer.id), {
		fairEvalMetrics: updatedMetrics,
	});

	await batch.commit();

	const totalDeducted = payments.reduce((sum, p) => sum + p.payment, 0);
	console.info(`  Total deducted: ${totalDeducted.toFixed(2)} min (should equal cost: ${atGoalAnswer.cost})`);
}

async function verifyData(): Promise<void> {
	console.info('\n🔍 Verifying created data...');

	// Count wallets
	const walletsSnapshot = await db
		.collection(Collections.fairEvalWallets)
		.where('topParentId', '==', TEST_GROUP_ID)
		.get();
	console.info(`  Wallets: ${walletsSnapshot.size}`);

	// Count transactions
	const transactionsSnapshot = await db
		.collection(Collections.fairEvalTransactions)
		.where('topParentId', '==', TEST_GROUP_ID)
		.get();
	console.info(`  Transactions: ${transactionsSnapshot.size}`);

	// Check wallet balances
	console.info('\n  Wallet Balances:');
	for (const doc of walletsSnapshot.docs) {
		const wallet = doc.data() as FairEvalWallet;
		console.info(`    ${wallet.userId}: ${wallet.balance.toFixed(2)} min`);
	}

	// Check answer statuses
	console.info('\n  Answer Statuses:');
	for (const answer of testAnswers) {
		const answerDoc = await db.collection(Collections.statements).doc(answer.id).get();
		const data = answerDoc.data();
		const metrics = data?.fairEvalMetrics as FairEvalAnswerMetrics | undefined;

		if (metrics) {
			const status = metrics.isAccepted ? '✅ Accepted' :
				metrics.distanceToGoal === 0 ? '🎯 At Goal' :
					metrics.weightedSupporters > 0 ? '📈 Has Support' : '⚪ No Support';
			console.info(`    ${answer.id}: ${status}`);
		}
	}
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main(): Promise<void> {
	console.info('═══════════════════════════════════════════════════════════════');
	console.info('          Fair Evaluation Test Data Script');
	console.info('═══════════════════════════════════════════════════════════════');

	try {
		await clearTestData();
		await createTestGroup();
		await createTestUsers();
		await createQuestionAndAnswers();
		await createEvaluations();
		await calculateAndUpdateMetrics();
		await simulateAcceptance();
		await verifyData();

		console.info('\n═══════════════════════════════════════════════════════════════');
		console.info('          ✅ Test data created successfully!');
		console.info('═══════════════════════════════════════════════════════════════');
		console.info('\nTest Group ID:', TEST_GROUP_ID);
		console.info('Question ID:', `${TEST_GROUP_ID}-question`);
		console.info('\nYou can now test the fair evaluation UI with this data.');

	} catch (error) {
		console.error('\n❌ Error creating test data:', error);
		process.exit(1);
	}
}

main().then(() => process.exit(0));
