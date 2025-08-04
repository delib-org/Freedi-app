import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';

// Base selectors
export const selectQuestionnaireState = (state: RootState) => state.questionnaire;

export const selectQuestionnaires = (state: RootState) => state.questionnaire.questionnaires;

export const selectCurrentQuestionnaire = (state: RootState) => state.questionnaire.currentQuestionnaire;

export const selectActiveQuestionnaire = (state: RootState) => state.questionnaire.activeQuestionnaire;

export const selectUserResponses = (state: RootState) => state.questionnaire.userResponses;

export const selectIsLoading = (state: RootState) => state.questionnaire.isLoading;

export const selectIsSaving = (state: RootState) => state.questionnaire.isSaving;

export const selectError = (state: RootState) => state.questionnaire.error;

// Memoized selectors
export const selectQuestionnaireById = createSelector(
    [selectQuestionnaires, (state: RootState, questionnaireId: string) => questionnaireId],
    (questionnaires, questionnaireId) => questionnaires[questionnaireId]
);

export const selectQuestionnairesArray = createSelector(
    [selectQuestionnaires],
    (questionnaires) => Object.values(questionnaires)
);

export const selectCurrentQuestion = createSelector(
    [selectActiveQuestionnaire],
    (activeQuestionnaire) => {
        if (!activeQuestionnaire.questionnaire) return null;
        
        const { currentQuestionIndex, questionnaire } = activeQuestionnaire;
        if (currentQuestionIndex >= questionnaire.questions.length) return null;
        
        return questionnaire.questions[currentQuestionIndex];
    }
);

export const selectQuestionnaireProgress = createSelector(
    [selectActiveQuestionnaire],
    (activeQuestionnaire) => {
        if (!activeQuestionnaire.questionnaire) return { current: 0, total: 0, percentage: 0 };
        
        const current = activeQuestionnaire.currentQuestionIndex + 1;
        const total = activeQuestionnaire.questionnaire.questions.length;
        const percentage = Math.round((current / total) * 100);
        
        return { current, total, percentage };
    }
);

export const selectIsQuestionnaireComplete = createSelector(
    [selectActiveQuestionnaire],
    (activeQuestionnaire) => {
        if (!activeQuestionnaire.questionnaire) return false;
        
        const totalQuestions = activeQuestionnaire.questionnaire.questions.length;
        const answeredQuestions = Object.keys(activeQuestionnaire.responses).length;
        
        return answeredQuestions === totalQuestions;
    }
);

export const selectUserResponseForQuestionnaire = createSelector(
    [selectUserResponses, (state: RootState, questionnaireId: string) => questionnaireId],
    (userResponses, questionnaireId) => userResponses[questionnaireId]
);

export const selectHasUserCompletedQuestionnaire = createSelector(
    [selectUserResponses, (state: RootState, questionnaireId: string) => questionnaireId],
    (userResponses, questionnaireId) => {
        const response = userResponses[questionnaireId];
        return response && response.completedAt !== undefined;
    }
);