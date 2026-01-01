/**
 * Fair Evaluation Calculation Functions
 *
 * Pure functions for calculating fair evaluation metrics.
 * These are shared between client and server.
 *
 * Mathematical Formulas:
 * - Positive Rating: rᵢ = max(0, eᵢ) where eᵢ ∈ [-1, +1]
 * - Weighted Supporters: W = Σ rᵢ
 * - Contribution: cᵢ = rᵢ × mᵢ (rating × wallet balance)
 * - Total Contribution: T = Σ cᵢ
 * - Distance to Goal: D = max(0, C - T) where C = answer cost
 * - Distance per Supporter: d = D / W (∞ if W = 0)
 * - Payment: pᵢ = (C / T) × mᵢ × rᵢ
 */

// ============================================================================
// TYPES
// ============================================================================

export interface UserEvaluationData {
	userId: string;
	evaluation: number;      // -1 to +1 range
	walletBalance: number;   // Current balance in minutes
}

export interface AnswerMetricsResult {
	weightedSupporters: number;      // W: Sum of positive ratings
	totalContribution: number;       // T: Sum of weighted contributions
	distanceToGoal: number;          // D: How far from goal
	distancePerSupporter: number;    // d: Minutes needed per supporter
}

export interface PaymentResult {
	userId: string;
	positiveRating: number;          // rᵢ: User's support level
	walletBalance: number;           // mᵢ: User's balance before payment
	payment: number;                 // pᵢ: Amount to deduct
}

export interface CompleteToGoalResult {
	perUser: number;                 // Minutes to add per user
	total: number;                   // Total minutes to add
}

export interface SimulationAnswer {
	statementId: string;
	cost: number;
	evaluations: UserEvaluationData[];
}

// ============================================================================
// CORE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Convert evaluation (-1 to +1) to positive rating (0 to +1).
 * Only positive evaluations count as support.
 *
 * @param evaluation - User's evaluation between -1 and +1
 * @returns Positive rating between 0 and 1
 */
export function getPositiveRating(evaluation: number): number {
	return Math.max(0, evaluation);
}

/**
 * Calculate metrics for a single answer.
 *
 * @param answerCost - C: The cost of the answer in minutes
 * @param userEvaluations - Array of user evaluations with wallet balances
 * @returns Calculated metrics (W, T, D, d)
 */
export function calculateAnswerMetrics(
	answerCost: number,
	userEvaluations: UserEvaluationData[]
): AnswerMetricsResult {
	let weightedSupporters = 0;   // W
	let totalContribution = 0;     // T

	for (const user of userEvaluations) {
		const positiveRating = getPositiveRating(user.evaluation);
		weightedSupporters += positiveRating;
		totalContribution += positiveRating * user.walletBalance;
	}

	const distanceToGoal = Math.max(0, answerCost - totalContribution);
	const distancePerSupporter = weightedSupporters > 0
		? distanceToGoal / weightedSupporters
		: Infinity;

	return {
		weightedSupporters,
		totalContribution,
		distanceToGoal,
		distancePerSupporter,
	};
}

/**
 * Calculate payment amount for a single user when answer is accepted.
 *
 * Formula: pᵢ = (C / T) × mᵢ × rᵢ
 *
 * @param answerCost - C: The cost of the answer
 * @param totalContribution - T: Total weighted contribution from all supporters
 * @param userMinutes - mᵢ: User's current wallet balance
 * @param positiveRating - rᵢ: User's positive rating (0 to 1)
 * @returns Payment amount to deduct from user
 */
export function calculateUserPayment(
	answerCost: number,
	totalContribution: number,
	userMinutes: number,
	positiveRating: number
): number {
	// If no contribution (shouldn't happen when accepting), no payment
	if (totalContribution === 0) return 0;

	// If user didn't support (rating <= 0), no payment
	if (positiveRating <= 0) return 0;

	return (answerCost / totalContribution) * userMinutes * positiveRating;
}

/**
 * Calculate all payments for accepting an answer.
 * Total payments will equal the answer cost.
 *
 * @param answerCost - C: The cost of the answer
 * @param userEvaluations - Array of user evaluations with wallet balances
 * @returns Array of payment results for each supporting user
 */
export function calculateAllPayments(
	answerCost: number,
	userEvaluations: UserEvaluationData[]
): PaymentResult[] {
	const metrics = calculateAnswerMetrics(answerCost, userEvaluations);
	const results: PaymentResult[] = [];

	for (const user of userEvaluations) {
		const positiveRating = getPositiveRating(user.evaluation);

		if (positiveRating > 0) {
			const payment = calculateUserPayment(
				answerCost,
				metrics.totalContribution,
				user.walletBalance,
				positiveRating
			);

			results.push({
				userId: user.userId,
				positiveRating,
				walletBalance: user.walletBalance,
				payment,
			});
		}
	}

	return results;
}

/**
 * Calculate how many minutes need to be added to reach the goal.
 *
 * Per user: x = d = D / W
 * Total: Y = x × N = (D / W) × N
 *
 * @param distancePerSupporter - d: Distance to goal per supporter
 * @param totalUsers - N: Total number of users in the group
 * @returns Minutes to add per user and total
 */
export function calculateCompleteToGoal(
	distancePerSupporter: number,
	totalUsers: number
): CompleteToGoalResult {
	// If already at goal or no valid distance, no minutes needed
	if (!isFinite(distancePerSupporter) || distancePerSupporter <= 0) {
		return { perUser: 0, total: 0 };
	}

	return {
		perUser: distancePerSupporter,
		total: distancePerSupporter * totalUsers,
	};
}

/**
 * Verify that total payments equal the answer cost.
 * Useful for testing and validation.
 *
 * @param payments - Array of payment results
 * @param answerCost - Expected total cost
 * @param tolerance - Acceptable rounding error (default 0.01)
 * @returns True if payments sum to cost within tolerance
 */
export function verifyPaymentTotal(
	payments: PaymentResult[],
	answerCost: number,
	tolerance: number = 0.01
): boolean {
	const totalPayments = payments.reduce((sum, p) => sum + p.payment, 0);
	return Math.abs(totalPayments - answerCost) < tolerance;
}

// ============================================================================
// SIMULATION FUNCTION (for display ordering)
// ============================================================================

/**
 * Simulate the fair acceptance process to determine display order.
 * This is a read-only simulation that doesn't modify actual data.
 *
 * Algorithm:
 * 1. Accept any answer at goal (D = 0), highest T wins ties
 * 2. Find answer closest to goal (smallest d)
 * 3. Simulate adding minutes to bring it to goal
 * 4. Repeat for maxRounds
 *
 * @param answers - Array of answers with their evaluations
 * @param userBalances - Map of userId to current balance
 * @param maxRounds - Maximum simulation rounds (default 10)
 * @returns Ordered array of statement IDs (acceptance order)
 */
export function simulateFairAcceptance(
	answers: SimulationAnswer[],
	userBalances: Map<string, number>,
	maxRounds: number = 10
): string[] {
	// Create a mutable copy of balances
	const balances = new Map(userBalances);
	const acceptedAnswers: string[] = [];
	const metricsCache = new Map<string, AnswerMetricsResult>();

	// Helper to recalculate all answer metrics
	const recalculate = () => {
		for (const answer of answers) {
			if (acceptedAnswers.includes(answer.statementId)) continue;

			const evals = answer.evaluations.map(e => ({
				...e,
				walletBalance: balances.get(e.userId) ?? 0,
			}));
			metricsCache.set(answer.statementId, calculateAnswerMetrics(answer.cost, evals));
		}
	};

	// Helper to deduct payments for accepted answer
	const deductPayments = (answer: SimulationAnswer) => {
		const metrics = metricsCache.get(answer.statementId);
		if (!metrics) return;

		for (const user of answer.evaluations) {
			const positiveRating = getPositiveRating(user.evaluation);
			if (positiveRating > 0) {
				const currentBalance = balances.get(user.userId) ?? 0;
				const payment = calculateUserPayment(
					answer.cost,
					metrics.totalContribution,
					currentBalance,
					positiveRating
				);
				balances.set(user.userId, currentBalance - payment);
			}
		}
	};

	// Initial calculation
	recalculate();

	for (let round = 0; round < maxRounds; round++) {
		// Step 1: Find answers at goal (D = 0)
		const atGoal = answers.filter(a => {
			if (acceptedAnswers.includes(a.statementId)) return false;
			const m = metricsCache.get(a.statementId);
			return m && m.distanceToGoal === 0;
		});

		if (atGoal.length > 0) {
			// Accept answer with highest total contribution
			const winner = atGoal.reduce((best, curr) => {
				const bm = metricsCache.get(best.statementId);
				const cm = metricsCache.get(curr.statementId);
				if (!bm || !cm) return best;
				return cm.totalContribution > bm.totalContribution ? curr : best;
			});

			acceptedAnswers.push(winner.statementId);
			deductPayments(winner);
			recalculate();
			continue;
		}

		// Step 2: Find answer closest to goal (smallest d)
		const withSupport = answers.filter(a => {
			if (acceptedAnswers.includes(a.statementId)) return false;
			const m = metricsCache.get(a.statementId);
			return m && m.weightedSupporters > 0 && isFinite(m.distancePerSupporter);
		});

		if (withSupport.length === 0) {
			// No more answers can be brought to goal
			break;
		}

		const nextUp = withSupport.reduce((best, curr) => {
			const bm = metricsCache.get(best.statementId);
			const cm = metricsCache.get(curr.statementId);
			if (!bm || !cm) return best;
			return cm.distancePerSupporter < bm.distancePerSupporter ? curr : best;
		});

		const metrics = metricsCache.get(nextUp.statementId);
		if (!metrics) break;

		// Step 3: Simulate adding minutes to bring nextUp to goal
		const minutesToAdd = metrics.distancePerSupporter;

		// Add minutes to all users
		for (const userId of balances.keys()) {
			const currentBalance = balances.get(userId) ?? 0;
			balances.set(userId, currentBalance + minutesToAdd);
		}

		recalculate();
		// Loop continues, nextUp should now be at goal
	}

	return acceptedAnswers;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

export type FairEvalStatus = 'reached' | 'hasSupport' | 'noSupport';

/**
 * Determine the status of an answer for display purposes.
 *
 * @param metrics - The answer's calculated metrics
 * @returns Status string for UI rendering
 */
export function getAnswerStatus(metrics: AnswerMetricsResult): FairEvalStatus {
	if (metrics.distanceToGoal === 0) {
		return 'reached';
	}
	if (metrics.weightedSupporters > 0) {
		return 'hasSupport';
	}
	return 'noSupport';
}

/**
 * Calculate progress percentage for progress bar display.
 *
 * @param metrics - The answer's calculated metrics
 * @param answerCost - The cost of the answer
 * @returns Percentage (0-100) of progress toward goal
 */
export function getProgressPercentage(
	totalContribution: number,
	answerCost: number
): number {
	if (answerCost <= 0) return 100;
	return Math.min(100, (totalContribution / answerCost) * 100);
}
