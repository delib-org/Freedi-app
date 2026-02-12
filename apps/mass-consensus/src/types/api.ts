import { Statement } from '@freedi/shared-types';

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
 * Detected suggestion from multi-suggestion detection
 */
export interface DetectedSuggestion {
  title: string;
  description: string;
  originalText: string;
}

/**
 * Split suggestion with editing state
 */
export interface SplitSuggestion {
  id: string;
  title: string;
  description: string;
  originalText: string;
  isRemoved: boolean;
}

/**
 * Response from multi-suggestion detection
 */
export interface MultiSuggestionResponse {
  ok: boolean;
  isMultipleSuggestions: boolean;
  suggestions: DetectedSuggestion[];
  originalText: string;
  responseTime?: number;
  error?: string;
}

/**
 * Comment data returned from queries (subset of Statement fields)
 */
export interface CommentData {
  statementId: string;
  statement: string;
  reasoning?: string;
  createdAt: number;
  creator?: { displayName?: string; uid?: string };
  creatorId: string;
}

/**
 * Flow state for the add solution workflow
 */
export type FlowState =
  | { step: 'input' }
  | { step: 'checking' }
  | { step: 'multi-preview'; suggestions: SplitSuggestion[]; originalText: string; similarData?: SimilarCheckResponse }
  | { step: 'similar'; data: SimilarCheckResponse }
  | { step: 'submitting' }
  | { step: 'success'; action: 'created' | 'evaluated' | 'merged'; solutionText: string }
  | { step: 'evaluate' };
