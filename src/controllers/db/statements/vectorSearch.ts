import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { functions } from '../config';
import { logError } from '@/utils/errorHandling';

/**
 * Vector Search Controller
 *
 * Client-side functions for finding semantically similar statements
 * using Firestore vector search with Gemini embeddings.
 */

interface SimilarStatementResult {
  id: string;
  statement: string;
  description?: string;
  distance: number;
  similarity: number;
}

interface FindSimilarRequest {
  text: string;
  parentId?: string;
  topParentId?: string;
  limit?: number;
  minSimilarity?: number;
}

interface FindSimilarResponse {
  ok: boolean;
  results: SimilarStatementResult[];
  queryEmbeddingDimension: number;
  searchTime: number;
}

/**
 * Find statements semantically similar to the given text
 *
 * @param text - The text to find similar statements for
 * @param options - Optional search parameters
 * @param options.parentId - Filter by direct parent (question) ID
 * @param options.topParentId - Filter by top-level parent ID
 * @param options.limit - Maximum number of results (1-20, default: 5)
 * @param options.minSimilarity - Minimum similarity threshold (0-1, default: 0.6)
 * @returns Array of similar statements with similarity scores
 *
 * @example
 * ```typescript
 * // Find similar statements within a question
 * const results = await findSimilarStatements(
 *   "We should invest in education",
 *   { parentId: "question-123", limit: 5 }
 * );
 *
 * // Results include similarity scores
 * results.forEach(result => {
 *   console.info(`${result.statement} (${(result.similarity * 100).toFixed(1)}% similar)`);
 * });
 * ```
 */
export async function findSimilarStatements(
  text: string,
  options: {
    parentId?: string;
    topParentId?: string;
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<SimilarStatementResult[]> {
  try {
    if (!text || text.trim() === '') {
      console.error('findSimilarStatements: text parameter is required');

      return [];
    }

    const findSimilarFn = httpsCallable<FindSimilarRequest, FindSimilarResponse>(
      functions,
      'findSimilarStatementsVector'
    );

    const request: FindSimilarRequest = {
      text: text.trim(),
      parentId: options.parentId,
      topParentId: options.topParentId,
      limit: options.limit ?? 5,
      minSimilarity: options.minSimilarity ?? 0.6,
    };

    const result: HttpsCallableResult<FindSimilarResponse> = await findSimilarFn(request);

    if (!result.data.ok) {
      console.error('findSimilarStatements: API returned error');

      return [];
    }

    console.info(`Found ${result.data.results.length} similar statements in ${result.data.searchTime}ms`);

    return result.data.results;
  } catch (error) {
    logError(error, {
      operation: 'vectorSearch.findSimilarStatements',
      metadata: {
        textLength: text?.length,
        parentId: options.parentId,
        topParentId: options.topParentId,
      },
    });

    return [];
  }
}

/**
 * Suggest alternative statements based on user input
 *
 * This is a convenience wrapper that:
 * 1. Finds similar statements to the user's input
 * 2. Filters out low-confidence matches
 * 3. Returns formatted suggestions
 *
 * @param userInput - The user's input text
 * @param questionId - The question/parent statement ID to search within
 * @param maxSuggestions - Maximum number of suggestions (default: 5)
 * @returns Array of similar statement suggestions
 *
 * @example
 * ```typescript
 * // When user types a statement, suggest alternatives
 * const suggestions = await suggestAlternatives(
 *   userInput,
 *   currentQuestionId
 * );
 *
 * if (suggestions.length > 0) {
 *   showSuggestionModal(suggestions);
 * }
 * ```
 */
export async function suggestAlternatives(
  userInput: string,
  questionId: string,
  maxSuggestions = 5
): Promise<SimilarStatementResult[]> {
  return findSimilarStatements(userInput, {
    parentId: questionId,
    limit: maxSuggestions,
    minSimilarity: 0.65, // Higher threshold for suggestions
  });
}

/**
 * Check if a similar statement already exists
 *
 * Useful for preventing duplicate submissions
 *
 * @param text - The text to check
 * @param parentId - The parent statement ID to search within
 * @param similarityThreshold - Threshold for considering statements as duplicates (default: 0.85)
 * @returns The most similar statement if found above threshold, null otherwise
 *
 * @example
 * ```typescript
 * // Before creating a new statement
 * const existingSimilar = await checkForDuplicateStatement(
 *   newStatementText,
 *   parentQuestionId
 * );
 *
 * if (existingSimilar) {
 *   showMessage(`Similar statement already exists: "${existingSimilar.statement}"`);
 *   return;
 * }
 * ```
 */
export async function checkForDuplicateStatement(
  text: string,
  parentId: string,
  similarityThreshold = 0.85
): Promise<SimilarStatementResult | null> {
  const results = await findSimilarStatements(text, {
    parentId,
    limit: 1,
    minSimilarity: similarityThreshold,
  });

  return results.length > 0 ? results[0] : null;
}
