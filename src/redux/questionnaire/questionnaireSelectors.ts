import { createSelector } from '@reduxjs/toolkit';
import { RootState } from '../store';

// Base selectors
export const selectQuestionnaireState = (state: RootState) => state.questionnaire;

export const selectQuestionnaires = (state: RootState) => state.questionnaire.questionnaires;

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
