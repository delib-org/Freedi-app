import {
	object,
	string,
	number,
	boolean,
	optional,
	enum_,
	InferOutput,
} from 'valibot';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Types of transactions in the fair evaluation wallet system
 */
export enum FairEvalTransactionType {
	join = 'join',           // Initial balance when joining group
	admin_add = 'admin_add', // Admin distributes minutes to group
	payment = 'payment',     // Deduction when answer is accepted
	refund = 'refund',       // Refund (edge cases)
}

/**
 * Determines the scope of the wallet
 * - topParent: Wallet is shared across the entire top-level group
 * - parent: Wallet is specific to the parent question
 * - self: Wallet is specific to the answer itself (rare)
 */
export enum WalletLevel {
	topParent = 'topParent',
	parent = 'parent',
	self = 'self',
}

// ============================================================================
// WALLET SCHEMA
// ============================================================================

/**
 * User's wallet balance within a group.
 * Each user has one wallet per topParentId (group scope).
 *
 * Collection: fairEvalWallets
 * Document ID: `${topParentId}--${userId}`
 */
export const FairEvalWalletSchema = object({
	walletId: string(),           // Composite: `${topParentId}--${userId}`
	userId: string(),
	topParentId: string(),        // Group scope
	balance: number(),            // Current available minutes
	totalReceived: number(),      // Lifetime minutes received
	totalSpent: number(),         // Lifetime minutes spent
	createdAt: number(),          // Timestamp in milliseconds
	lastUpdate: number(),         // Timestamp in milliseconds
});

export type FairEvalWallet = InferOutput<typeof FairEvalWalletSchema>;

// ============================================================================
// TRANSACTION SCHEMA
// ============================================================================

/**
 * Transaction metadata for payment events.
 * Provides detailed breakdown of how payment was calculated.
 */
export const FairEvalTransactionMetadataSchema = object({
	answerCost: optional(number()),            // C: Total cost of the answer
	weightedSupporters: optional(number()),    // W: Sum of positive ratings
	totalContribution: optional(number()),     // T: Sum of (rating × balance)
	paymentPerFullSupporter: optional(number()), // C / T: Base payment rate
	userSupportLevel: optional(number()),      // rᵢ: User's positive rating (0-1)
	userPayment: optional(number()),           // pᵢ: Actual amount user paid
});

export type FairEvalTransactionMetadata = InferOutput<typeof FairEvalTransactionMetadataSchema>;

/**
 * Individual transaction record for history tracking.
 *
 * Collection: fairEvalTransactions
 * Document ID: auto-generated
 */
export const FairEvalTransactionSchema = object({
	transactionId: string(),
	topParentId: string(),
	userId: string(),
	type: enum_(FairEvalTransactionType),
	amount: number(),             // Positive for credits, negative for debits
	balanceBefore: number(),
	balanceAfter: number(),
	answerStatementId: optional(string()),  // For payment transactions
	answerTitle: optional(string()),        // For display in history
	adminId: optional(string()),            // For admin_add transactions
	note: optional(string()),               // Optional description
	metadata: optional(FairEvalTransactionMetadataSchema),
	createdAt: number(),          // Timestamp in milliseconds
});

export type FairEvalTransaction = InferOutput<typeof FairEvalTransactionSchema>;

// ============================================================================
// ANSWER METRICS SCHEMA
// ============================================================================

/**
 * Cached metrics for an answer in the fair evaluation system.
 * These are calculated server-side and cached on the statement document.
 *
 * Stored as: statement.fairEvalMetrics
 */
export const FairEvalAnswerMetricsSchema = object({
	answerStatementId: string(),
	parentStatementId: string(),
	answerCost: number(),                    // C: Cost to accept this answer
	weightedSupporters: number(),            // W: Σ max(0, eᵢ) - sum of positive ratings
	totalContribution: number(),             // T: Σ (rᵢ × mᵢ) - sum of weighted contributions
	distanceToGoal: number(),                // D: max(0, C - T)
	distancePerSupporter: number(),          // d: D / W (Infinity if W = 0)
	isAccepted: boolean(),                   // True when accepted by admin
	acceptedAt: optional(number()),          // Timestamp when accepted
	acceptedBy: optional(string()),          // Admin who accepted
	lastCalculation: number(),               // Timestamp of last recalculation
});

export type FairEvalAnswerMetrics = InferOutput<typeof FairEvalAnswerMetricsSchema>;

// ============================================================================
// QUESTION SETTINGS SCHEMA
// ============================================================================

/**
 * Fair evaluation settings for a question/statement.
 * Enables fair evaluation mode and configures defaults.
 *
 * Stored as: statement.fairEvalSettings
 */
export const FairEvalQuestionSettingsSchema = object({
	isFairEvalQuestion: boolean(),           // True if fair eval is enabled
	walletLevel: optional(enum_(WalletLevel)), // Default: 'topParent'
	defaultAnswerCost: optional(number()),   // Default cost for new answers (e.g., 1000)
	initialWalletBalance: optional(number()), // Minutes given on join (default: 10)
});

export type FairEvalQuestionSettings = InferOutput<typeof FairEvalQuestionSettingsSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate wallet ID from topParentId and userId
 */
export function getWalletId(topParentId: string, userId: string): string {
	return `${topParentId}--${userId}`;
}

/**
 * Default initial wallet balance when a user joins
 */
export const DEFAULT_INITIAL_WALLET_BALANCE = 10;

/**
 * Default answer cost when not specified
 */
export const DEFAULT_ANSWER_COST = 1000;
