/**
 * useOptimisticVote Hook
 *
 * Provides optimistic UI updates for voting on suggestions.
 * Immediately updates the UI when user votes, then syncs with server.
 * Rolls back on API failure and shows error feedback.
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  setSuggestionEvaluation,
  removeSuggestionEvaluation,
  getUserEvaluation,
} from '@/controllers/db/evaluations/setSuggestionEvaluation';
import { useUIStore } from '@/store/uiStore';
import { logError } from '@/lib/utils/errorHandling';

interface UseOptimisticVoteParams {
  suggestionId: string;
  paragraphId: string;
  userId: string | null;
  userDisplayName: string | null;
  initialPositiveCount?: number;
  initialNegativeCount?: number;
  isOwner: boolean;
}

interface OptimisticVoteState {
  /** Current user's evaluation: 1 (upvote), -1 (downvote), or null (no vote) */
  userEvaluation: number | null;
  /** Optimistic positive vote count */
  positiveCount: number;
  /** Optimistic negative vote count */
  negativeCount: number;
  /** Whether consensus is being recalculated (show loader) */
  isConsensusLoading: boolean;
  /** Whether a vote operation is in progress */
  isVoting: boolean;
  /** Handle vote action */
  handleVote: (vote: number) => Promise<void>;
}

/**
 * Custom hook for optimistic vote updates
 *
 * @example
 * const {
 *   userEvaluation,
 *   positiveCount,
 *   negativeCount,
 *   isConsensusLoading,
 *   isVoting,
 *   handleVote,
 * } = useOptimisticVote({
 *   suggestionId: 'sugg_123',
 *   paragraphId: 'para_456',
 *   userId: 'user_789',
 *   userDisplayName: 'John Doe',
 *   initialPositiveCount: 5,
 *   initialNegativeCount: 2,
 *   isOwner: false,
 * });
 */
export function useOptimisticVote({
  suggestionId,
  paragraphId,
  userId,
  userDisplayName,
  initialPositiveCount = 0,
  initialNegativeCount = 0,
  isOwner,
}: UseOptimisticVoteParams): OptimisticVoteState {
  // Optimistic state (what we show immediately)
  const [optimisticEvaluation, setOptimisticEvaluation] = useState<number | null>(null);
  const [optimisticPositive, setOptimisticPositive] = useState(initialPositiveCount);
  const [optimisticNegative, setOptimisticNegative] = useState(initialNegativeCount);

  // Loading states
  const [isConsensusLoading, setIsConsensusLoading] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  // Track if we have an in-flight optimistic update
  const hasOptimisticUpdate = useRef(false);

  // UI Store for toast notifications and interactions
  const showToast = useUIStore((state) => state.showToast);
  const addUserInteraction = useUIStore((state) => state.addUserInteraction);

  // Sync with server counts when they change (real-time updates)
  useEffect(() => {
    // Only sync if we don't have an optimistic update in progress
    if (!hasOptimisticUpdate.current) {
      setOptimisticPositive(initialPositiveCount);
      setOptimisticNegative(initialNegativeCount);
    }
  }, [initialPositiveCount, initialNegativeCount]);

  // Fetch user's existing evaluation from Firestore on mount
  useEffect(() => {
    if (!userId) {
      setOptimisticEvaluation(null);

      return;
    }

    let isMounted = true;

    const fetchEvaluation = async () => {
      try {
        const evaluation = await getUserEvaluation({
          suggestionId,
          userId,
        });

        if (isMounted) {
          // Only update optimistic if no in-flight update
          if (!hasOptimisticUpdate.current) {
            setOptimisticEvaluation(evaluation);
          }
        }
      } catch (err) {
        logError(err, {
          operation: 'useOptimisticVote.fetchEvaluation',
          userId,
          metadata: { suggestionId },
        });
      }
    };

    fetchEvaluation();

    return () => {
      isMounted = false;
    };
  }, [suggestionId, userId]);

  /**
   * Calculate the delta for vote counts based on old and new evaluation
   */
  const calculateVoteDelta = useCallback(
    (oldEval: number | null, newEval: number | null) => {
      let positiveDelta = 0;
      let negativeDelta = 0;

      // Remove old vote effect
      if (oldEval === 1) positiveDelta -= 1;
      if (oldEval === -1) negativeDelta -= 1;

      // Add new vote effect
      if (newEval === 1) positiveDelta += 1;
      if (newEval === -1) negativeDelta += 1;

      return { positiveDelta, negativeDelta };
    },
    []
  );

  /**
   * Handle vote with optimistic update
   */
  const handleVote = useCallback(
    async (vote: number) => {
      // Prevent voting if not logged in, owner, or already voting
      if (!userId || isOwner || isVoting) {
        return;
      }

      const previousEvaluation = optimisticEvaluation;
      const previousPositive = optimisticPositive;
      const previousNegative = optimisticNegative;

      // Determine new evaluation: toggle off if same vote, otherwise set new vote
      const newEvaluation = previousEvaluation === vote ? null : vote;

      // Calculate vote count changes
      const { positiveDelta, negativeDelta } = calculateVoteDelta(
        previousEvaluation,
        newEvaluation
      );

      // OPTIMISTIC UPDATE: Update UI immediately
      hasOptimisticUpdate.current = true;
      setIsVoting(true);
      setOptimisticEvaluation(newEvaluation);
      setOptimisticPositive((prev) => Math.max(0, prev + positiveDelta));
      setOptimisticNegative((prev) => Math.max(0, prev + negativeDelta));

      // Show consensus loading indicator
      setIsConsensusLoading(true);

      try {
        const displayName = userDisplayName || 'Anonymous';

        if (newEvaluation === null) {
          // Remove evaluation
          await removeSuggestionEvaluation({
            suggestionId,
            userId,
          });
        } else {
          // Create or update evaluation
          await setSuggestionEvaluation({
            suggestionId,
            userId,
            userDisplayName: displayName,
            evaluation: newEvaluation,
          });
          // Mark paragraph as interacted
          addUserInteraction(paragraphId);
        }

        // Clear consensus loading after a short delay to allow real-time update
        setTimeout(() => {
          setIsConsensusLoading(false);
          hasOptimisticUpdate.current = false;
        }, 1500);
      } catch (err) {
        // ROLLBACK: Revert optimistic update on failure
        logError(err, {
          operation: 'useOptimisticVote.handleVote',
          userId,
          metadata: { suggestionId, vote, previousEvaluation, newEvaluation },
        });

        setOptimisticEvaluation(previousEvaluation);
        setOptimisticPositive(previousPositive);
        setOptimisticNegative(previousNegative);
        setIsConsensusLoading(false);
        hasOptimisticUpdate.current = false;

        // Show error feedback
        showToast('error', 'Failed to save your vote. Please try again.');
      } finally {
        setIsVoting(false);
      }
    },
    [
      userId,
      isOwner,
      isVoting,
      optimisticEvaluation,
      optimisticPositive,
      optimisticNegative,
      calculateVoteDelta,
      suggestionId,
      userDisplayName,
      addUserInteraction,
      paragraphId,
      showToast,
    ]
  );

  return {
    userEvaluation: optimisticEvaluation,
    positiveCount: optimisticPositive,
    negativeCount: optimisticNegative,
    isConsensusLoading,
    isVoting,
    handleVote,
  };
}
