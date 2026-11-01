import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import type { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useToast } from '@/components/shared/Toast';
import { UI, QUESTION_SEARCH } from '@/constants/common';
import {
  addRemovedQuestionId,
  dropRemovedQuestionIds,
  removeQuestionFromSurvey,
  restoreQuestionList,
  restoreQuestionSettings,
  QuestionSettingsMap,
  RemovedQuestion,
} from './questionRemoval';

interface UseQuestionRemovalArgs {
  selectedQuestions: Statement[];
  questionSettings: QuestionSettingsMap;
  setSelectedQuestions: Dispatch<SetStateAction<Statement[]>>;
  setQuestionSettings: Dispatch<SetStateAction<QuestionSettingsMap>>;
  setRemovedQuestionIds: Dispatch<SetStateAction<string[]>>;
}

interface UseQuestionRemovalResult {
  /** The question awaiting confirmation, or null when no dialog is open */
  pendingQuestion: Statement | null;
  requestRemoval: (questionId: string) => void;
  confirmRemoval: () => void;
  cancelRemoval: () => void;
}

/**
 * Two-step removal of a survey question: ask first, then remove and offer
 * an Undo toast that restores the question with its settings.
 */
export function useQuestionRemoval({
  selectedQuestions,
  questionSettings,
  setSelectedQuestions,
  setQuestionSettings,
  setRemovedQuestionIds,
}: UseQuestionRemovalArgs): UseQuestionRemovalResult {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const pendingQuestion = pendingId
    ? selectedQuestions.find((q) => q.statementId === pendingId) ?? null
    : null;

  const undoRemoval = useCallback(
    (removed: RemovedQuestion) => {
      setSelectedQuestions((prev) => restoreQuestionList(prev, removed));
      setQuestionSettings((prev) => restoreQuestionSettings(prev, removed));
      setRemovedQuestionIds((prev) => dropRemovedQuestionIds(prev, [removed.question.statementId]));
    },
    [setSelectedQuestions, setQuestionSettings, setRemovedQuestionIds]
  );

  const confirmRemoval = useCallback(() => {
    if (!pendingId) return;

    const result = removeQuestionFromSurvey(selectedQuestions, questionSettings, pendingId);
    setPendingId(null);
    if (!result.removed) return;

    const removed = result.removed;
    setSelectedQuestions(result.questions);
    setQuestionSettings(result.settings);
    setRemovedQuestionIds((prev) =>
      addRemovedQuestionId(prev, removed.question.statementId, QUESTION_SEARCH.MAX_REMOVED_IDS)
    );
    showToast({
      type: 'info',
      message: t('questionRemovedFromSurvey'),
      duration: UI.UNDO_REMOVE_TOAST_MS,
      action: { label: t('undo'), onClick: () => undoRemoval(removed) },
    });
  }, [
    pendingId,
    selectedQuestions,
    questionSettings,
    setSelectedQuestions,
    setQuestionSettings,
    setRemovedQuestionIds,
    showToast,
    t,
    undoRemoval,
  ]);

  const requestRemoval = useCallback((questionId: string) => setPendingId(questionId), []);
  const cancelRemoval = useCallback(() => setPendingId(null), []);

  return { pendingQuestion, requestRemoval, confirmRemoval, cancelRemoval };
}
