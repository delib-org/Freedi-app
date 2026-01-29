/**
 * useParagraphSuggestions Hook
 *
 * Real-time Firestore listener for paragraph suggestions.
 * Automatically updates when new suggestions are added or consensus changes.
 * Uses onSnapshot for instant updates (<500ms latency).
 */

'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { Collections, Statement, StatementType } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { QUERY_LIMITS } from '@/constants/common';

/**
 * Hook to listen to suggestions for a specific official paragraph in real-time
 *
 * @param paragraphId - The official paragraph ID
 * @param enabled - Whether to enable the listener (default: true)
 * @returns Array of suggestion statements, sorted by consensus (descending)
 *
 * @example
 * const suggestions = useParagraphSuggestions('para_123');
 * // suggestions updates automatically when votes come in
 */
export function useParagraphSuggestions(
  paragraphId: string | null,
  enabled: boolean = true
): Statement[] {
  const [suggestions, setSuggestions] = useState<Statement[]>([]);

  useEffect(() => {
    if (!enabled || !paragraphId) {
      setSuggestions([]);
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    try {
      // Get Firestore instance (auto-initializes and connects to emulator)
      const firestore = getFirebaseFirestore();

      // Query suggestions for this paragraph
      const q = query(
        collection(firestore, Collections.statements),
        where('parentId', '==', paragraphId),
        where('statementType', '==', StatementType.option),
        orderBy('consensus', 'desc'),
        limit(QUERY_LIMITS.SUGGESTIONS)
      );

      // Set up real-time listener
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const updatedSuggestions: Statement[] = [];

          snapshot.forEach((doc) => {
            const statement = doc.data() as Statement;

            // Filter out official paragraphs and hidden statements
            if (!statement.doc?.isOfficialParagraph && !statement.hide) {
              updatedSuggestions.push(statement);
            }
          });

          setSuggestions(updatedSuggestions);
        },
        (error) => {
          logError(error, {
            operation: 'hooks.useParagraphSuggestions',
            paragraphId,
          });
        }
      );
    } catch (error) {
      logError(error, {
        operation: 'hooks.useParagraphSuggestions.setup',
        paragraphId,
      });
    }

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [paragraphId, enabled]);

  return suggestions;
}

/**
 * Hook to listen to all suggestions for a document (across all paragraphs)
 *
 * @param documentId - The document ID
 * @param enabled - Whether to enable the listener (default: true)
 * @returns Map of paragraphId -> array of suggestions
 *
 * @example
 * const suggestionsByParagraph = useDocumentSuggestions('doc_456');
 * const suggestionsForPara1 = suggestionsByParagraph['para_123'] || [];
 */
export function useDocumentSuggestions(
  documentId: string | null,
  enabled: boolean = true
): Record<string, Statement[]> {
  const [suggestionMap, setSuggestionMap] = useState<Record<string, Statement[]>>({});

  useEffect(() => {
    if (!enabled || !documentId) {
      setSuggestionMap({});
      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    try {
      // Get Firestore instance (auto-initializes and connects to emulator)
      const firestore = getFirebaseFirestore();

      // Query all suggestions for this document
      const q = query(
        collection(firestore, Collections.statements),
        where('topParentId', '==', documentId),
        where('statementType', '==', StatementType.option),
        orderBy('consensus', 'desc')
      );

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const newSuggestionMap: Record<string, Statement[]> = {};

          snapshot.forEach((doc) => {
            const statement = doc.data() as Statement;

            // Filter out official paragraphs and hidden statements
            if (statement.doc?.isOfficialParagraph || statement.hide) {
              return;
            }

            // Group by parentId (the official paragraph ID)
            const paragraphId = statement.parentId;
            if (!newSuggestionMap[paragraphId]) {
              newSuggestionMap[paragraphId] = [];
            }
            newSuggestionMap[paragraphId]!.push(statement);
          });

          setSuggestionMap(newSuggestionMap);
        },
        (error) => {
          logError(error, {
            operation: 'hooks.useDocumentSuggestions',
            documentId,
          });
        }
      );
    } catch (error) {
      logError(error, {
        operation: 'hooks.useDocumentSuggestions.setup',
        documentId,
      });
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [documentId, enabled]);

  return suggestionMap;
}

/**
 * Hook to get the winning suggestion for a paragraph in real-time
 *
 * @param paragraphId - The official paragraph ID
 * @param enabled - Whether to enable the listener (default: true)
 * @returns The suggestion with highest consensus, or null
 *
 * @example
 * const winningSuggestion = useWinningSuggestion('para_123');
 * if (winningSuggestion) {
 *   console.log('Winning text:', winningSuggestion.statement);
 *   console.log('Consensus:', winningSuggestion.consensus);
 * }
 */
export function useWinningSuggestion(
  paragraphId: string | null,
  enabled: boolean = true
): Statement | null {
  const suggestions = useParagraphSuggestions(paragraphId, enabled);

  // First suggestion is winning (already sorted by consensus descending)
  return suggestions.length > 0 ? suggestions[0]! : null;
}
