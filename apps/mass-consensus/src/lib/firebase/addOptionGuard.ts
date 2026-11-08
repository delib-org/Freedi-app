import { ADD_OPTION_CODES, ERROR_MESSAGES } from '@/constants/common';
import { isAddBlockedForQuestion } from './surveys/participantOptionsBlock';

/** The 403 the add-option routes answer with on an "admin options only" question */
export interface AddOptionRefusal {
  status: 403;
  body: {
    error: string;
    code: typeof ADD_OPTION_CODES.DISABLED;
  };
}

/**
 * The refusal a route must return when participants may not add options to
 * this question, or null when adding is allowed.
 *
 * Shared by submit, merge and prepare so a tab opened before the admin
 * switched the block on gets the same answer from every path. Only NEW
 * options are refused: a +1 on an existing option (submit with
 * `existingStatementId`) must not go through this guard.
 */
export async function getAddOptionRefusal(questionId: string): Promise<AddOptionRefusal | null> {
  const blocked = await isAddBlockedForQuestion(questionId);
  if (!blocked) return null;

  return {
    status: 403,
    body: {
      error: ERROR_MESSAGES.ADD_DISABLED,
      code: ADD_OPTION_CODES.DISABLED,
    },
  };
}
