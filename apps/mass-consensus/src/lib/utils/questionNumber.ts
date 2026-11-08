/**
 * The 1-based number shown before a survey question ("1) …").
 * Returns undefined when there is nothing to count — a single-question
 * survey, or a question outside a survey — so callers show no number.
 */
export function getQuestionNumber(questionIndex: number, totalQuestions: number): number | undefined {
  if (totalQuestions <= 1 || questionIndex < 0 || questionIndex >= totalQuestions) {
    return undefined;
  }

  return questionIndex + 1;
}
