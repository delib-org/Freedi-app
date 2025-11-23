import { Statement } from 'delib-npm';

/**
 * Request body for checking similar solutions
 */
export interface SimilarCheckRequest {
  userInput: string;
  userId: string;
}

/**
 * Response from similar solutions check
 */
export interface SimilarCheckResponse {
  ok: boolean;
  similarStatements: Statement[];
  userText: string;
  generatedTitle?: string;
  generatedDescription?: string;
  cached?: boolean;
  responseTime?: number;
}

/**
 * Request body for submitting a solution
 */
export interface SubmitSolutionRequest {
  userInput: string;
  userId: string;
  existingStatementId?: string;
}

/**
 * Response from solution submission
 */
export interface SubmitSolutionResponse {
  success: boolean;
  action: 'created' | 'evaluated';
  statementId: string;
}

/**
 * Generic error response
 */
export interface ErrorResponse {
  error: string;
  code?: string;
}

/**
 * Loading stage for the enhanced loader
 */
export type LoadingStage = 'content-check' | 'similarity-search' | 'comparison' | 'finalizing';

/**
 * Flow state for the add solution workflow
 */
export type FlowState =
  | { step: 'input' }
  | { step: 'similar'; data: SimilarCheckResponse }
  | { step: 'submitting' }
  | { step: 'success'; action: 'created' | 'evaluated'; solutionText: string }
  | { step: 'evaluate' };
