import { useState, useCallback, Dispatch, SetStateAction } from 'react';
import type { Statement } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/next';
import { useToast } from '@/components/shared/Toast';
import { UI } from '@/constants/common';
import {
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
    },
    [setSelectedQuestions, setQuestionSettings]
  );

  const confirmRemoval = useCallback(() => {
    if (!pendingId) return;

    const result = removeQuestionFromSurvey(selectedQuestions, questionSettings, pendingId);
    setPendingId(null);
    if (!result.removed) return;

    const removed = result.removed;
    setSelectedQuestions(result.questions);
    setQuestionSettings(result.settings);
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
    showToast,
    t,
    undoRemoval,
  ]);

  const requestRemoval = useCallback((questionId: string) => setPendingId(questionId), []);
  const cancelRemoval = useCallback(() => setPendingId(null), []);

  return { pendingQuestion, requestRemoval, confirmRemoval, cancelRemoval };
}
