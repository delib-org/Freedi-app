'use client';

import { useEffect, useState, useCallback } from 'react';
import { Statement } from '@freedi/shared-types';
import { getWinningSuggestion } from '@/lib/firebase/queries';
import { logError } from '@/lib/utils/errorHandling';

interface ParagraphReplacementHandlerProps {
  /** The official paragraph statement */
  officialParagraph: Statement;
  /** The document ID */
  documentId: string;
  /** Selection mode: auto, manual, or deadline */
  mode: 'auto' | 'manual' | 'deadline';
  /** Voting deadline timestamp (for deadline mode) */
  votingDeadline?: number;
  /** Whether current user is admin */
  isAdmin: boolean;
  /** Callback when official paragraph text should update */
  onTextUpdate: (paragraphId: string, newText: string) => void;
  /** Callback when admin manually accepts a suggestion */
  onManualAccept?: (paragraphId: string, suggestionId: string) => void;
}

/**
 * ParagraphReplacementHandler - Manages dynamic paragraph text replacement
 *
 * Handles three modes:
 * - 'auto': Official paragraph text updates in real-time to show winning suggestion
 * - 'manual': Admin must click "Accept" button to finalize
 * - 'deadline': Voting ends at deadline, then auto-finalizes winning suggestion
 *
 * Uses Firestore listeners for instant UI updates across all clients
 */
export default function ParagraphReplacementHandler({
  officialParagraph,
  documentId,
  mode,
  votingDeadline,
  isAdmin,
  onTextUpdate,
  onManualAccept,
}: ParagraphReplacementHandlerProps) {
  const [winningSuggestion, setWinningSuggestion] = useState<Statement | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  // Fetch winning suggestion on mount and when paragraph changes
  useEffect(() => {
    let mounted = true;

    const fetchWinningSuggestion = async () => {
      try {
        const suggestion = await getWinningSuggestion(officialParagraph.statementId);
        if (mounted) {
          setWinningSuggestion(suggestion);

          // In auto mode, update text immediately if suggestion has higher consensus
          if (
            mode === 'auto' &&
            suggestion &&
            suggestion.consensus > officialParagraph.consensus
          ) {
            onTextUpdate(officialParagraph.statementId, suggestion.statement);
          }
        }
      } catch (error) {
        logError(error, {
          operation: 'paragraphReplacementHandler.fetchWinningSuggestion',
          documentId,
          paragraphId: officialParagraph.statementId,
        });
      }
    };

    fetchWinningSuggestion();

    // Poll for updates every 5 seconds
    // TODO: Replace with Firestore listener for instant updates
    const interval = setInterval(fetchWinningSuggestion, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [officialParagraph.statementId, officialParagraph.consensus, documentId, mode, onTextUpdate]);

  // Deadline countdown timer
  useEffect(() => {
    if (mode !== 'deadline' || !votingDeadline) return;

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = votingDeadline - now;

      if (remaining <= 0) {
        setTimeRemaining('Voting ended');
        // Auto-finalize will be handled by Firebase Function
        return;
      }

      // Format time remaining
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m remaining`);
      } else if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${seconds}s remaining`);
      } else {
        setTimeRemaining(`${seconds}s remaining`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [mode, votingDeadline]);

  // Handle manual accept
  const handleAccept = useCallback(async () => {
    if (!winningSuggestion || !onManualAccept || isAccepting) return;

    setIsAccepting(true);
    try {
      await onManualAccept(officialParagraph.statementId, winningSuggestion.statementId);
      // Update text immediately after successful accept
      onTextUpdate(officialParagraph.statementId, winningSuggestion.statement);
    } catch (error) {
      logError(error, {
        operation: 'paragraphReplacementHandler.handleAccept',
        documentId,
        paragraphId: officialParagraph.statementId,
        suggestionId: winningSuggestion.statementId,
      });
    } finally {
      setIsAccepting(false);
    }
  }, [winningSuggestion, onManualAccept, isAccepting, officialParagraph.statementId, documentId, onTextUpdate]);

  // Don't render anything if no winning suggestion or not higher consensus
  if (
    !winningSuggestion ||
    winningSuggestion.consensus <= officialParagraph.consensus
  ) {
    return null;
  }

  // Auto mode: no UI needed (text updates automatically)
  if (mode === 'auto') {
    return null;
  }

  // Manual mode: show accept button for admin
  if (mode === 'manual' && isAdmin) {
    return (
      <div className="replacement-handler replacement-handler--manual">
        <div className="replacement-handler__content">
          <span className="replacement-handler__label">
            Higher consensus suggestion available ({Math.round(winningSuggestion.consensus * 100)}% vs {Math.round(officialParagraph.consensus * 100)}%)
          </span>
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="replacement-handler__accept-button"
          >
            {isAccepting ? 'Accepting...' : 'Accept Suggestion'}
          </button>
        </div>
        <div className="replacement-handler__preview">
          <strong>Preview:</strong> {winningSuggestion.statement}
        </div>
      </div>
    );
  }

  // Deadline mode: show countdown and preview
  if (mode === 'deadline') {
    return (
      <div className="replacement-handler replacement-handler--deadline">
        <div className="replacement-handler__content">
          <span className="replacement-handler__label">
            Winning suggestion ({Math.round(winningSuggestion.consensus * 100)}%)
          </span>
          <span className="replacement-handler__countdown">
            {timeRemaining}
          </span>
        </div>
        <div className="replacement-handler__preview">
          <strong>Will replace current text:</strong> {winningSuggestion.statement}
        </div>
        {isAdmin && timeRemaining === 'Voting ended' && (
          <button
            type="button"
            onClick={handleAccept}
            disabled={isAccepting}
            className="replacement-handler__accept-button"
          >
            {isAccepting ? 'Finalizing...' : 'Finalize Now'}
          </button>
        )}
      </div>
    );
  }

  return null;
}
