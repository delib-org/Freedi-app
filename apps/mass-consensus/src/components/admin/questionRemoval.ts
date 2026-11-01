import type { Statement, QuestionOverrideSettings } from '@freedi/shared-types';

export type QuestionSettingsMap = Record<string, QuestionOverrideSettings>;

/** Everything needed to put a removed question back exactly where it was */
export interface RemovedQuestion {
  question: Statement;
  index: number;
  settings: QuestionOverrideSettings | undefined;
}

interface RemovalResult {
  questions: Statement[];
  settings: QuestionSettingsMap;
  removed: RemovedQuestion | null;
}

/** Removes a question and its per-question settings; reports what was removed */
export function removeQuestionFromSurvey(
  questions: Statement[],
  settings: QuestionSettingsMap,
  questionId: string
): RemovalResult {
  const index = questions.findIndex((q) => q.statementId === questionId);
  if (index === -1) {
    return { questions, settings, removed: null };
  }

  const nextSettings = { ...settings };
  delete nextSettings[questionId];

  return {
    questions: questions.filter((q) => q.statementId !== questionId),
    settings: nextSettings,
    removed: { question: questions[index], index, settings: settings[questionId] },
  };
}

/** Puts a removed question back at its original position (no-op if already present) */
export function restoreQuestionList(questions: Statement[], removed: RemovedQuestion): Statement[] {
  if (questions.some((q) => q.statementId === removed.question.statementId)) {
    return questions;
  }

  const insertAt = Math.min(removed.index, questions.length);

  return [...questions.slice(0, insertAt), removed.question, ...questions.slice(insertAt)];
}

/** Puts a removed question's settings back (keeps newer settings if any exist) */
export function restoreQuestionSettings(
  settings: QuestionSettingsMap,
  removed: RemovedQuestion
): QuestionSettingsMap {
  const questionId = removed.question.statementId;
  if (!removed.settings || settings[questionId]) {
    return settings;
  }

  return { ...settings, [questionId]: removed.settings };
}
