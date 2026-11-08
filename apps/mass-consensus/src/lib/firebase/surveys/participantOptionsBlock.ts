import { getFirestoreAdmin } from '../admin';
import { logError } from '@/lib/utils/errorHandling';
import { Survey } from '@/types/survey';
import { SURVEYS_COLLECTION } from './surveyHelpers';

/**
 * Is adding participant options blocked for this question by any survey that
 * carries it ("admin options only")?
 *
 * Server-side source of truth for the API routes and the standalone question
 * page, which have no merged survey settings at hand. A question may sit in
 * several surveys; one blocking it is enough, since the Statement is shared.
 *
 * Fails open: a lookup error is logged and treated as "not blocked", so a
 * Firestore hiccup never refuses an honest submission.
 */
export async function isAddBlockedForQuestion(questionId: string): Promise<boolean> {
  try {
    const db = getFirestoreAdmin();
    const snapshot = await db
      .collection(SURVEYS_COLLECTION)
      .where('questionIds', 'array-contains', questionId)
      .get();

    return snapshot.docs.some((doc) => {
      const survey = doc.data() as Partial<Survey>;

      return survey.questionSettings?.[questionId]?.blockParticipantOptions === true;
    });
  } catch (error) {
    logError(error, {
      operation: 'participantOptionsBlock.isAddBlockedForQuestion',
      questionId,
    });

    return false;
  }
}
