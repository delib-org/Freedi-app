/**
 * Swipe Selectors
 * Following CLAUDE.md guidelines - use memoized selectors
 */

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../index';

// Basic selectors
export const selectCurrentQuestion = (state: RootState) => state.swipe.currentQuestion;
export const selectShowQuestionIntro = (state: RootState) => state.swipe.showQuestionIntro;
export const selectHasStartedSwiping = (state: RootState) => state.swipe.hasStartedSwiping;
export const selectSocialActivities = (state: RootState) => state.swipe.socialActivities;
export const selectCurrentCard = (state: RootState) => state.swipe.currentCard;
export const selectCardStack = (state: RootState) => state.swipe.cardStack;
export const selectEvaluatedCardIds = (state: RootState) => state.swipe.evaluatedCardIds;
export const selectShowProposalPrompt = (state: RootState) => state.swipe.showProposalPrompt;
export const selectUserProposalCount = (state: RootState) => state.swipe.userProposalCount;
export const selectPendingEvaluations = (state: RootState) => state.swipe.pendingEvaluations;
export const selectIsOnline = (state: RootState) => state.swipe.isOnline;
export const selectSyncError = (state: RootState) => state.swipe.syncError;
export const selectIsLoading = (state: RootState) => state.swipe.isLoading;
export const selectError = (state: RootState) => state.swipe.error;

// Memoized selectors
export const selectRemainingCardsCount = createSelector(
  [selectCardStack],
  (cardStack) => cardStack.length
);

export const selectEvaluatedCardsCount = createSelector(
  [selectEvaluatedCardIds],
  (evaluatedIds) => evaluatedIds.length
);

export const selectTotalCardsCount = createSelector(
  [selectRemainingCardsCount, selectEvaluatedCardsCount],
  (remaining, evaluated) => remaining + evaluated
);

export const selectHasPendingSync = createSelector(
  [selectPendingEvaluations],
  (pending) => pending.length > 0
);

export const selectCanShowNextCard = createSelector(
  [selectCurrentCard, selectIsLoading],
  (currentCard, isLoading) => currentCard !== null && !isLoading
);

export const selectShouldShowIntro = createSelector(
  [selectShowQuestionIntro, selectCurrentQuestion],
  (showIntro, currentQuestion) => showIntro && currentQuestion !== null
);

export const selectProgressPercentage = createSelector(
  [selectEvaluatedCardsCount, selectTotalCardsCount],
  (evaluated, total) => {
    if (total === 0) return 0;
    return Math.round((evaluated / total) * 100);
  }
);

export const selectRecentSocialActivities = createSelector(
  [selectSocialActivities],
  (activities) => activities.slice(0, 20)
);
