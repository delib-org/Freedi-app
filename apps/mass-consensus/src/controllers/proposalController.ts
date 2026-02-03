/**
 * Proposal Controller
 * Handles proposal submission and tracking
 * Following CLAUDE.md guidelines:
 * - Proper error handling with logError()
 * - Firebase utilities (no manual refs)
 * - Named constants
 * - Types from @freedi/shared-types
 */

import { setDoc, doc } from 'firebase/firestore';
import { Statement, StatementType, Collections } from '@freedi/shared-types';
import { logError, ValidationError } from '@/lib/utils/errorHandling';
import { db } from '@/lib/firebase/client';
import { VALIDATION } from '@/constants/common';

/**
 * Submit a new proposal
 * @param proposalText - The proposal text
 * @param questionId - The question this proposal is for
 * @param userId - ID of the user submitting the proposal
 * @param userName - Name of the user submitting the proposal
 */
export async function submitProposal(
  proposalText: string,
  questionId: string,
  userId: string,
  userName: string
): Promise<{ statementId: string }> {
  try {
    // Validate proposal text
    const trimmedText = proposalText.trim();

    if (trimmedText.length < VALIDATION.MIN_STATEMENT_LENGTH) {
      throw new ValidationError('Proposal text too short', {
        length: trimmedText.length,
        minLength: VALIDATION.MIN_STATEMENT_LENGTH,
      });
    }

    if (trimmedText.length > VALIDATION.MAX_STATEMENT_LENGTH) {
      throw new ValidationError('Proposal text too long', {
        length: trimmedText.length,
        maxLength: VALIDATION.MAX_STATEMENT_LENGTH,
      });
    }

    if (!questionId) {
      throw new ValidationError('Question ID is required');
    }

    if (!userId) {
      throw new ValidationError('User ID is required');
    }

    // Generate statement ID
    const statementId = `proposal_${userId}_${Date.now()}`;
    const statementRef = doc(db, Collections.statements, statementId);
    const createdAt = Date.now();
    const lastUpdate = createdAt;

    // Create proposal statement
    const proposal: Partial<Statement> = {
      statementId,
      statement: trimmedText,
      parentId: questionId,
      statementType: StatementType.option,
      createdBy: userId,
      creator: {
        displayName: userName,
        uid: userId,
      },
      createdAt,
      lastUpdate,
      lastChildUpdate: createdAt,
    };

    // Save to Firestore
    await setDoc(statementRef, proposal);

    console.info('Proposal saved to Firestore:', {
      statementId,
      questionId,
      userId,
      textLength: trimmedText.length,
    });

    return { statementId };
  } catch (error) {
    logError(error, {
      operation: 'proposalController.submitProposal',
      questionId,
      userId,
      metadata: {
        proposalLength: proposalText.length,
      },
    });
    throw error; // Re-throw so caller can handle
  }
}

/**
 * Validate proposal text
 * @param proposalText - The proposal text to validate
 */
export function validateProposal(proposalText: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const trimmedText = proposalText.trim();

  if (trimmedText.length < VALIDATION.MIN_STATEMENT_LENGTH) {
    errors.push(
      `Proposal must be at least ${VALIDATION.MIN_STATEMENT_LENGTH} characters`
    );
  }

  if (trimmedText.length > VALIDATION.MAX_STATEMENT_LENGTH) {
    errors.push(
      `Proposal must be no more than ${VALIDATION.MAX_STATEMENT_LENGTH} characters`
    );
  }

  // Check for spam patterns (all caps, repeated characters, etc.)
  const repeatedChars = /(.)\1{10,}/;
  if (repeatedChars.test(trimmedText)) {
    errors.push('Proposal contains too many repeated characters');
  }

  const allCaps = trimmedText === trimmedText.toUpperCase() && trimmedText.length > 20;
  if (allCaps) {
    errors.push('Please avoid writing in all capitals');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
