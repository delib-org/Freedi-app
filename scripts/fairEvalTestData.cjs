/**
 * Fair Evaluation Test Data Script
 *
 * This script creates test data for the fair evaluation feature and verifies
 * that the mathematical calculations are working correctly.
 *
 * Usage:
 *   node scripts/fairEvalTestData.cjs
 */

const sharedTypes = require('../packages/shared-types/dist/cjs/index.js');

const {
	calculateAnswerMetrics,
	calculateAllPayments,
	calculateCompleteToGoal,
	simulateFairAcceptance,
	getPositiveRating,
} = sharedTypes;

// Test Configuration
const TEST_CONFIG = {
	// Worked example from spec:
	// 5 users rate +1.0 (10 min each), 2 users rate +0.5 (6 min each)
	// Answer cost = 80
	// Expected: W=6.0, T=56, D=24, d=4
	workedExample: {
		answerCost: 80,
		users: [
			{ id: 'user1', rating: 1.0, balance: 10 },
			{ id: 'user2', rating: 1.0, balance: 10 },
			{ id: 'user3', rating: 1.0, balance: 10 },
			{ id: 'user4', rating: 1.0, balance: 10 },
			{ id: 'user5', rating: 1.0, balance: 10 },
			{ id: 'user6', rating: 0.5, balance: 6 },
			{ id: 'user7', rating: 0.5, balance: 6 },
		],
		expectedMetrics: {
			weightedSupporters: 6.0,
			totalContribution: 56,
			distanceToGoal: 24,
			distancePerSupporter: 4,
		},
	},
};

function runTests() {
	const results = [];

	console.log('\n🧪 Starting Fair Evaluation Tests\n');
	console.log('=' .repeat(60));

	// Test 1: Positive Rating Calculation
	console.log('\n📐 Test 1: Positive Rating Calculation');
	const posRatingTests = [
		{ input: 1.0, expected: 1.0 },
		{ input: 0.5, expected: 0.5 },
		{ input: 0, expected: 0 },
		{ input: -0.5, expected: 0 },
		{ input: -1.0, expected: 0 },
	];

	for (const test of posRatingTests) {
		const result = getPositiveRating(test.input);
		const passed = result === test.expected;
		results.push({
			name: `getPositiveRating(${test.input})`,
			passed,
			expected: test.expected,
			actual: result,
		});
		console.log(`  ${passed ? '✅' : '❌'} getPositiveRating(${test.input}) = ${result} (expected: ${test.expected})`);
	}

	// Test 2: Worked Example from Spec
	console.log('\n📐 Test 2: Worked Example from Specification');
	const { workedExample } = TEST_CONFIG;

	// Use correct property names: userId and walletBalance
	const userEvaluations = workedExample.users.map(user => ({
		userId: user.id,
		evaluation: user.rating,
		walletBalance: user.balance,
	}));

	const metrics = calculateAnswerMetrics(workedExample.answerCost, userEvaluations);

	const metricsTests = [
		{
			name: 'weightedSupporters (W)',
			expected: workedExample.expectedMetrics.weightedSupporters,
			actual: metrics.weightedSupporters,
		},
		{
			name: 'totalContribution (T)',
			expected: workedExample.expectedMetrics.totalContribution,
			actual: metrics.totalContribution,
		},
		{
			name: 'distanceToGoal (D)',
			expected: workedExample.expectedMetrics.distanceToGoal,
			actual: metrics.distanceToGoal,
		},
		{
			name: 'distancePerSupporter (d)',
			expected: workedExample.expectedMetrics.distancePerSupporter,
			actual: metrics.distancePerSupporter,
		},
	];

	for (const test of metricsTests) {
		const passed = Math.abs(test.expected - test.actual) < 0.001;
		results.push({
			name: test.name,
			passed,
			expected: test.expected,
			actual: test.actual,
		});
		console.log(`  ${passed ? '✅' : '❌'} ${test.name} = ${test.actual} (expected: ${test.expected})`);
	}

	// Test 3: Payment Calculation
	console.log('\n📐 Test 3: Payment Calculation (when goal reached)');

	// Scenario: Goal is reached (T >= C)
	// Use correct property names: userId and walletBalance
	const fullFundedUsers = [
		{ userId: 'user1', evaluation: 1.0, walletBalance: 20 },
		{ userId: 'user2', evaluation: 1.0, walletBalance: 20 },
		{ userId: 'user3', evaluation: 1.0, walletBalance: 20 },
		{ userId: 'user4', evaluation: 1.0, walletBalance: 20 },
		{ userId: 'user5', evaluation: 1.0, walletBalance: 20 },
	];
	// T = 5 * 1.0 * 20 = 100, C = 80
	// pᵢ = (80/100) * 20 * 1.0 = 16 each

	const fullMetrics = calculateAnswerMetrics(80, fullFundedUsers);
	console.log(`  Metrics: W=${fullMetrics.weightedSupporters}, T=${fullMetrics.totalContribution}, D=${fullMetrics.distanceToGoal}`);

	const payments = calculateAllPayments(80, fullFundedUsers);
	console.log(`  Calculated payments for ${payments.length} users:`);

	let totalPayment = 0;
	for (const payment of payments) {
		console.log(`    ${payment.userId}: ${payment.payment.toFixed(2)} minutes`);
		totalPayment += payment.payment;
	}

	const paymentSumTest = Math.abs(totalPayment - 80) < 0.001;
	results.push({
		name: 'Payment sum equals cost',
		passed: paymentSumTest,
		expected: 80,
		actual: totalPayment,
	});
	console.log(`  ${paymentSumTest ? '✅' : '❌'} Total payments = ${totalPayment.toFixed(2)} (expected: 80)`);

	// Test 4: Complete to Goal
	console.log('\n📐 Test 4: Complete to Goal Calculation');

	// Function uses distancePerSupporter (d), not distanceToGoal (D)
	// calculateCompleteToGoal returns { perUser, total }
	const completeResult = calculateCompleteToGoal(
		workedExample.expectedMetrics.distancePerSupporter, // d = 4
		workedExample.users.length // N = 7
	);

	console.log(`  Distance per supporter (d): ${workedExample.expectedMetrics.distancePerSupporter}`);
	console.log(`  Number of users: ${workedExample.users.length}`);
	console.log(`  Minutes per user: ${completeResult.perUser.toFixed(2)}`);
	console.log(`  Total minutes to add: ${completeResult.total.toFixed(2)}`);

	// Each user should contribute d = 4 minutes
	// Total = d × N = 4 × 7 = 28
	const expectedPerUser = workedExample.expectedMetrics.distancePerSupporter;
	const expectedTotal = expectedPerUser * workedExample.users.length;

	const perUserTest = Math.abs(completeResult.perUser - expectedPerUser) < 0.01;
	results.push({
		name: 'Complete to goal minutes per user',
		passed: perUserTest,
		expected: expectedPerUser.toFixed(2),
		actual: completeResult.perUser.toFixed(2),
	});
	console.log(`  ${perUserTest ? '✅' : '❌'} Minutes per user = ${completeResult.perUser.toFixed(2)} (expected: ${expectedPerUser.toFixed(2)})`);

	const totalTest = Math.abs(completeResult.total - expectedTotal) < 0.01;
	results.push({
		name: 'Complete to goal total minutes',
		passed: totalTest,
		expected: expectedTotal.toFixed(2),
		actual: completeResult.total.toFixed(2),
	});
	console.log(`  ${totalTest ? '✅' : '❌'} Total minutes = ${completeResult.total.toFixed(2)} (expected: ${expectedTotal.toFixed(2)})`);

	// Test 5: Simulation - Fair Acceptance Order
	console.log('\n📐 Test 5: Fair Acceptance Simulation');

	// simulateFairAcceptance expects:
	// - answers with { statementId, cost, evaluations }
	// - evaluations with { userId, evaluation, walletBalance }
	// - userBalances as Map<string, number>
	// - returns string[] (ordered statement IDs)
	const simulationAnswers = [
		{
			statementId: 'answer1',
			cost: 50,
			evaluations: [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user2', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user3', evaluation: 0.5, walletBalance: 10 },
			],
		},
		{
			statementId: 'answer2',
			cost: 100,
			evaluations: [
				{ userId: 'user1', evaluation: 0.5, walletBalance: 10 },
				{ userId: 'user2', evaluation: 0.3, walletBalance: 10 },
			],
		},
		{
			statementId: 'answer3',
			cost: 30,
			evaluations: [
				{ userId: 'user1', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user2', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user3', evaluation: 1.0, walletBalance: 10 },
				{ userId: 'user4', evaluation: 1.0, walletBalance: 10 },
			],
		},
	];

	// Create initial balances map
	const initialBalances = new Map([
		['user1', 10],
		['user2', 10],
		['user3', 10],
		['user4', 10],
	]);

	const acceptanceOrder = simulateFairAcceptance(simulationAnswers, initialBalances, 10);
	console.log(`  Acceptance order: ${acceptanceOrder.join(' -> ')}`);

	// Answer3 should be accepted first (lowest cost with T >= C)
	// answer3: cost=30, T = 4 * 1.0 * 10 = 40 >= 30, so D=0 (at goal)
	const orderTest = acceptanceOrder[0] === 'answer3';
	results.push({
		name: 'Simulation order (answer3 first)',
		passed: orderTest,
		expected: 'answer3',
		actual: acceptanceOrder[0],
	});
	console.log(`  ${orderTest ? '✅' : '❌'} First accepted: ${acceptanceOrder[0]} (expected: answer3)`);

	return results;
}

function runEdgeCaseTests() {
	const results = [];

	console.log('\n🧪 Edge Case Tests\n');
	console.log('=' .repeat(60));

	// Edge case 1: Empty evaluations
	console.log('\n📐 Edge Case 1: Empty Evaluations');
	const emptyMetrics = calculateAnswerMetrics(100, []);
	const emptyTest = emptyMetrics.weightedSupporters === 0 && emptyMetrics.totalContribution === 0;
	results.push({
		name: 'Empty evaluations',
		passed: emptyTest,
	});
	console.log(`  ${emptyTest ? '✅' : '❌'} W=${emptyMetrics.weightedSupporters}, T=${emptyMetrics.totalContribution}`);

	// Edge case 2: All negative evaluations
	console.log('\n📐 Edge Case 2: All Negative Evaluations');
	const negativeUsers = [
		{ userId: 'user1', evaluation: -1.0, walletBalance: 10 },
		{ userId: 'user2', evaluation: -0.5, walletBalance: 10 },
	];
	const negMetrics = calculateAnswerMetrics(100, negativeUsers);
	const negTest = negMetrics.weightedSupporters === 0 && negMetrics.totalContribution === 0;
	results.push({
		name: 'All negative evaluations',
		passed: negTest,
	});
	console.log(`  ${negTest ? '✅' : '❌'} W=${negMetrics.weightedSupporters}, T=${negMetrics.totalContribution}`);

	// Edge case 3: Zero balance users
	console.log('\n📐 Edge Case 3: Zero Balance Users');
	const zeroBalanceUsers = [
		{ userId: 'user1', evaluation: 1.0, walletBalance: 0 },
		{ userId: 'user2', evaluation: 1.0, walletBalance: 0 },
	];
	const zeroMetrics = calculateAnswerMetrics(100, zeroBalanceUsers);
	const zeroTest = zeroMetrics.totalContribution === 0;
	results.push({
		name: 'Zero balance users',
		passed: zeroTest,
	});
	console.log(`  ${zeroTest ? '✅' : '❌'} T=${zeroMetrics.totalContribution} (expected: 0)`);

	// Edge case 4: Exact goal match
	console.log('\n📐 Edge Case 4: Exact Goal Match');
	const exactUsers = [
		{ userId: 'user1', evaluation: 1.0, walletBalance: 50 },
		{ userId: 'user2', evaluation: 1.0, walletBalance: 50 },
	];
	const exactMetrics = calculateAnswerMetrics(100, exactUsers);
	const exactTest = exactMetrics.distanceToGoal === 0;
	results.push({
		name: 'Exact goal match',
		passed: exactTest,
	});
	console.log(`  ${exactTest ? '✅' : '❌'} D=${exactMetrics.distanceToGoal} (expected: 0)`);

	return results;
}

// Main execution
function main() {
	console.log('\n' + '=' .repeat(60));
	console.log('🧮 FAIR EVALUATION TEST SUITE');
	console.log('=' .repeat(60));
	console.log('\nThis script tests the fair evaluation mathematical calculations');
	console.log('without requiring Firebase connection.\n');

	const mainResults = runTests();
	const edgeResults = runEdgeCaseTests();

	const allResults = [...mainResults, ...edgeResults];
	const totalPassed = allResults.filter(r => r.passed).length;
	const totalFailed = allResults.filter(r => !r.passed).length;

	console.log('\n' + '=' .repeat(60));
	console.log('\n🏁 FINAL SUMMARY\n');
	console.log(`  Total tests: ${allResults.length}`);
	console.log(`  ✅ Passed: ${totalPassed}`);
	console.log(`  ❌ Failed: ${totalFailed}`);
	console.log(`  Success rate: ${((totalPassed / allResults.length) * 100).toFixed(1)}%`);
	console.log('\n' + '=' .repeat(60) + '\n');

	if (totalFailed > 0) {
		process.exit(1);
	}
}

main();
