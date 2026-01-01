/**
 * Zustand store for demographics state in Sign app
 */

import { create } from 'zustand';
import {
  DemographicMode,
  SignDemographicQuestion,
  SurveyCompletionStatus,
  DemographicAnswer,
  QuestionWithAnswer,
} from '@/types/demographics';
import { logError } from '@/lib/utils/errorHandling';

export interface DemographicStatus {
  isLoaded: boolean;
  mode: DemographicMode;
  isRequired: boolean;
  isComplete: boolean;
  totalQuestions: number;
  answeredQuestions: number;
}

interface DemographicState {
  // Status
  status: DemographicStatus;
  setStatus: (status: Partial<DemographicStatus>) => void;
  resetStatus: () => void;

  // Questions
  questions: SignDemographicQuestion[];
  setQuestions: (questions: SignDemographicQuestion[]) => void;

  // Current answers (for form state during survey)
  currentAnswers: Record<string, string | string[]>;
  setAnswer: (questionId: string, value: string | string[]) => void;
  clearAnswers: () => void;

  // Submitted answers (from DB)
  submittedAnswers: QuestionWithAnswer[];
  setSubmittedAnswers: (answers: QuestionWithAnswer[]) => void;

  // Modal visibility
  isSurveyModalOpen: boolean;
  openSurveyModal: () => void;
  closeSurveyModal: () => void;

  // Loading/submitting states
  isLoading: boolean;
  setLoading: (value: boolean) => void;
  isSubmitting: boolean;
  setSubmitting: (value: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Data fetching
  fetchStatus: (documentId: string) => Promise<void>;
  fetchQuestions: (documentId: string) => Promise<void>;
  fetchAnswers: (documentId: string) => Promise<void>;
  submitAnswers: (documentId: string, answers: DemographicAnswer[]) => Promise<boolean>;
}

const initialStatus: DemographicStatus = {
  isLoaded: false,
  mode: 'disabled',
  isRequired: false,
  isComplete: true,
  totalQuestions: 0,
  answeredQuestions: 0,
};

export const useDemographicStore = create<DemographicState>((set, get) => ({
  // Status
  status: { ...initialStatus },
  setStatus: (newStatus) =>
    set((state) => ({
      status: { ...state.status, ...newStatus },
    })),
  resetStatus: () => set({ status: { ...initialStatus } }),

  // Questions
  questions: [],
  setQuestions: (questions) => set({ questions }),

  // Current answers
  currentAnswers: {},
  setAnswer: (questionId, value) =>
    set((state) => ({
      currentAnswers: { ...state.currentAnswers, [questionId]: value },
    })),
  clearAnswers: () => set({ currentAnswers: {} }),

  // Submitted answers
  submittedAnswers: [],
  setSubmittedAnswers: (answers) => set({ submittedAnswers: answers }),

  // Modal
  isSurveyModalOpen: false,
  openSurveyModal: () => set({ isSurveyModalOpen: true }),
  closeSurveyModal: () => set({ isSurveyModalOpen: false }),

  // Loading states
  isLoading: false,
  setLoading: (value) => set({ isLoading: value }),
  isSubmitting: false,
  setSubmitting: (value) => set({ isSubmitting: value }),

  // Error state
  error: null,
  setError: (error) => set({ error }),

  // Fetch survey status
  fetchStatus: async (documentId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await fetch(`/api/demographics/status/${documentId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      const completionStatus: SurveyCompletionStatus = data.status;
      const mode: DemographicMode = data.mode;

      set({
        status: {
          isLoaded: true,
          mode,
          isRequired: completionStatus.isRequired,
          isComplete: completionStatus.isComplete,
          totalQuestions: completionStatus.totalQuestions,
          answeredQuestions: completionStatus.answeredQuestions,
        },
        isLoading: false,
      });

      // Auto-open modal if survey is required and incomplete
      if (completionStatus.isRequired && !completionStatus.isComplete) {
        set({ isSurveyModalOpen: true });
      }
    } catch (error) {
      logError(error, { operation: 'demographicStore.fetchStatus', documentId });
      set({
        error: 'Failed to load survey status',
        isLoading: false,
        status: { ...initialStatus, isLoaded: true },
      });
    }
  },

  // Fetch questions
  fetchQuestions: async (documentId: string) => {
    try {
      set({ isLoading: true, error: null });

      const response = await fetch(`/api/demographics/questions/${documentId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }

      const data = await response.json();

      set({
        questions: data.questions || [],
        status: {
          ...get().status,
          mode: data.mode,
          isRequired: data.required,
        },
        isLoading: false,
      });
    } catch (error) {
      logError(error, { operation: 'demographicStore.fetchQuestions', documentId });
      set({
        error: 'Failed to load survey questions',
        isLoading: false,
      });
    }
  },

  // Fetch user's answers
  fetchAnswers: async (documentId: string) => {
    try {
      const response = await fetch(`/api/demographics/answers/${documentId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch answers');
      }

      const data = await response.json();
      const answers: QuestionWithAnswer[] = data.answers || [];

      // Pre-populate current answers from submitted answers
      const currentAnswers: Record<string, string | string[]> = {};
      answers.forEach((answer) => {
        if (answer.userQuestionId) {
          if (answer.userAnswerOptions && answer.userAnswerOptions.length > 0) {
            currentAnswers[answer.userQuestionId] = answer.userAnswerOptions;
          } else if (answer.userAnswer) {
            currentAnswers[answer.userQuestionId] = answer.userAnswer;
          }
        }
      });

      set({
        submittedAnswers: answers,
        currentAnswers,
      });
    } catch (error) {
      logError(error, { operation: 'demographicStore.fetchAnswers', documentId });
    }
  },

  // Submit answers
  submitAnswers: async (documentId: string, answers: DemographicAnswer[]) => {
    try {
      set({ isSubmitting: true, error: null });

      const response = await fetch(`/api/demographics/answers/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit answers');
      }

      // Refresh status after submission
      await get().fetchStatus(documentId);

      set({
        isSubmitting: false,
        isSurveyModalOpen: false,
      });

      return true;
    } catch (error) {
      logError(error, { operation: 'demographicStore.submitAnswers', documentId });
      set({
        error: 'Failed to submit survey answers',
        isSubmitting: false,
      });

      return false;
    }
  },
}));

// Selectors
export const selectIsInteractionBlocked = (state: DemographicState) =>
  state.status.isLoaded && state.status.isRequired && !state.status.isComplete;

export const selectShouldShowSurveyModal = (state: DemographicState) =>
  state.status.isLoaded && state.status.isRequired && !state.status.isComplete;

export const selectIsDemographicsEnabled = (state: DemographicState) =>
  state.status.mode !== 'disabled';

export const selectProgress = (state: DemographicState) => ({
  total: state.status.totalQuestions,
  answered: state.status.answeredQuestions,
  percentage:
    state.status.totalQuestions > 0
      ? Math.round((state.status.answeredQuestions / state.status.totalQuestions) * 100)
      : 0,
});
