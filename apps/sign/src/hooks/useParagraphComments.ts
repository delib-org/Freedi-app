/**
 * useParagraphComments Hook
 *
 * Real-time Firestore listener for paragraph comments.
 * Automatically updates when new comments are added, edited, or deleted,
 * and when comment consensus scores change from evaluations.
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
 * Hook to listen to comments for a specific paragraph in real-time
 *
 * @param paragraphId - The paragraph ID
 * @param enabled - Whether to enable the listener (default: true)
 * @returns Array of comment statements, sorted by createdAt (ascending)
 *
 * @example
 * const comments = useParagraphComments('para_123');
 * // comments updates automatically when new comments arrive or evaluations change
 */
export function useParagraphComments(
  paragraphId: string | null,
  enabled: boolean = true
): { comments: Statement[]; isLoading: boolean } {
  const [comments, setComments] = useState<Statement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !paragraphId) {
      setComments([]);
      setIsLoading(false);

      return;
    }

    let unsubscribe: Unsubscribe | null = null;

    try {
      const firestore = getFirebaseFirestore();

      // Query comments for this paragraph
      // Comments use StatementType.statement (not .comment)
      const q = query(
        collection(firestore, Collections.statements),
        where('parentId', '==', paragraphId),
        where('statementType', '==', StatementType.statement),
        orderBy('createdAt', 'asc'),
        limit(QUERY_LIMITS.COMMENTS)
      );

      // Set up real-time listener
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const updatedComments: Statement[] = [];

          snapshot.forEach((doc) => {
            const statement = doc.data() as Statement;

            // Filter out hidden comments
            if (!statement.hide) {
              updatedComments.push(statement);
            }
          });

          setComments(updatedComments);
          setIsLoading(false);
        },
        (error) => {
          logError(error, {
            operation: 'hooks.useParagraphComments',
            paragraphId,
          });
          setIsLoading(false);
        }
      );
    } catch (error) {
      logError(error, {
        operation: 'hooks.useParagraphComments.setup',
        paragraphId,
      });
      setIsLoading(false);
    }

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [paragraphId, enabled]);

  return { comments, isLoading };
}
