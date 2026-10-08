/**
 * Option cards an admin writes for a question — shared by
 * POST /api/questions/create (cards typed in the wizard) and
 * POST /api/questions/[id]/cards (cards added to an existing question).
 */

import { getAuth } from 'firebase-admin/auth';
import {
  CreateStatementParams,
  SourceApp,
  Statement,
  StatementType,
  createStatementObject,
  getRandomUID,
} from '@freedi/shared-types';
import { initializeFirebaseAdmin } from '@/lib/firebase/admin';
import { logError } from '@/lib/utils/errorHandling';

export type OptionCreator = CreateStatementParams['creator'];

/** The admin as a statement creator, from Firebase Auth; a plain "Admin" when the lookup fails. */
export async function getCreatorForUser(userId: string): Promise<OptionCreator> {
  initializeFirebaseAdmin();
  try {
    const userRecord = await getAuth().getUser(userId);

    return {
      uid: userId,
      displayName: userRecord.displayName || userRecord.email?.split('@')[0] || 'Admin',
      email: userRecord.email || '',
      photoURL: userRecord.photoURL || '',
      isAnonymous: false,
    };
  } catch (error) {
    logError(error, { operation: 'buildOptionStatements.getCreatorForUser', userId });

    return { uid: userId, displayName: 'Admin', email: '', photoURL: '', isAnonymous: false };
  }
}

/** Trim, drop empty lines. The caller decides what to do with an empty result. */
export function cleanOptionTexts(texts: readonly string[]): string[] {
  return texts.map((text) => text.trim()).filter((text) => text.length > 0);
}

/**
 * Build option statements for `texts`, in that order. One batch shares one
 * clock tick, so each card gets a millisecond more than the one before it —
 * the admin's order stays recoverable from `createdAt`.
 */
export function buildOptionStatements(
  question: Pick<Statement, 'statementId' | 'topParentId' | 'parents'>,
  texts: readonly string[],
  creator: OptionCreator
): Statement[] {
  const options: Statement[] = [];

  for (const [index, text] of texts.entries()) {
    const option = createStatementObject({
      statementId: getRandomUID(),
      statement: text,
      statementType: StatementType.option,
      parentId: question.statementId,
      topParentId: question.topParentId || question.statementId,
      parents: [...(question.parents || []), question.statementId],
      creatorId: creator.uid,
      creator,
      sourceApp: SourceApp.MASS_CONSENSUS,
    });

    if (option) {
      option.createdAt += index;
      options.push(option);
    }
  }

  return options;
}
