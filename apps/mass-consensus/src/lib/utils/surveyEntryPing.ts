import { participantFetch } from '@/lib/firebase/participantFetch';
/**
 * Survey entry ping — fire-and-forget POST that records the user entered a
 * survey (POST /api/surveys/[id]/enter). Enables real "entered" and bounce
 * counts in admin results.
 *
 * Guarded per page load so navigating between survey pages doesn't re-ping.
 */

const pingedSurveyIds = new Set<string>();

export function pingSurveyEntry(surveyId: string): void {
  if (typeof window === 'undefined') return;
  if (!surveyId || pingedSurveyIds.has(surveyId)) return;
  pingedSurveyIds.add(surveyId);

  participantFetch(`/api/surveys/${surveyId}/enter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }).catch(() => {
    // Non-blocking: entry tracking must never disturb the flow
  });
}
