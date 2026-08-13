/**
 * What the app knows about a user's own suggestions under one question.
 * `hasSubmitted` gates the "add your own suggestion before you see the
 * others" prompt.
 */
export interface UserSolutionSummary {
  hasSubmitted: boolean;
  solutionCount: number;
}

/**
 * Summarize a user's suggestions under a question.
 *
 * The options a question's creator owns are the ones they seeded when they
 * set the question up — imported or AI-generated — not their own
 * participation. Counting them told the creator they had already
 * contributed, so walking their own survey never asked them for a
 * suggestion before showing everyone else's. They are treated here as a
 * first-time participant instead.
 *
 * @param userId - The user being asked about
 * @param questionCreatorId - Creator of the question, when known
 * @param solutionCount - Options under the question authored by userId
 */
export function summarizeUserSolutions(
  userId: string,
  questionCreatorId: string | undefined,
  solutionCount: number
): UserSolutionSummary {
  if (questionCreatorId !== undefined && questionCreatorId === userId) {
    return { hasSubmitted: false, solutionCount: 0 };
  }

  return { hasSubmitted: solutionCount > 0, solutionCount };
}
