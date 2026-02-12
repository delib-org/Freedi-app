/**
 * Comment Controller
 * Handles comment submission via API route (server-side Firebase Admin)
 * Works for both authenticated and anonymous users
 */

import { Statement } from '@freedi/shared-types';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { COMMENT } from '@/constants/common';

interface SubmitCommentParams {
  commentText: string;
  suggestionStatement: Statement;
  userId: string;
  userName: string;
  reasoning?: string;
}

/**
 * Submit a comment on a suggestion via API route
 * Comments are stored as child Statements with StatementType.comment
 */
export async function submitComment({
  commentText,
  suggestionStatement,
  userId,
  userName,
  reasoning,
}: SubmitCommentParams): Promise<{ statementId: string }> {
  try {
    const trimmedText = commentText.trim();

    if (trimmedText.length < COMMENT.MIN_LENGTH) {
      throw new ValidationError('Comment text too short', {
        length: trimmedText.length,
        minLength: COMMENT.MIN_LENGTH,
      });
    }

    if (trimmedText.length > COMMENT.MAX_LENGTH) {
      throw new ValidationError('Comment text too long', {
        length: trimmedText.length,
        maxLength: COMMENT.MAX_LENGTH,
      });
    }

    if (!suggestionStatement.statementId) {
      throw new ValidationError('Suggestion statement ID is required');
    }

    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    const response = await fetch('/api/comments/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commentText: trimmedText,
        suggestionId: suggestionStatement.statementId,
        topParentId: suggestionStatement.topParentId || suggestionStatement.parentId,
        userId,
        userName,
        reasoning,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit comment');
    }

    const data = await response.json();

    console.info('Comment submitted via API:', {
      statementId: data.statementId,
      parentId: suggestionStatement.statementId,
      userId,
    });

    return { statementId: data.statementId };
  } catch (error) {
    logError(error, {
      operation: 'commentController.submitComment',
      userId,
      statementId: suggestionStatement.statementId,
      metadata: {
        commentLength: commentText.length,
      },
    });
    throw error;
  }
}
