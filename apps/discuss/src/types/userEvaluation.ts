/**
 * Interface for tracking user's evaluation progress on a statement/question
 * Stored in the userEvaluations collection
 */
export interface UserEvaluation {
  /** Composite ID: ${userId}--${parentStatementId} */
  documentId?: string;

  /** User ID (can be anonymous user ID) */
  userId: string;

  /** The parent statement/question ID */
  parentStatementId: string;

  /** Array of statement IDs that the user has evaluated */
  evaluatedOptionsIds: string[];

  /** Last time this document was updated (milliseconds) */
  lastUpdated: number;

  /** Optional: Count of evaluated options for quick access */
  evaluatedCount?: number;
}