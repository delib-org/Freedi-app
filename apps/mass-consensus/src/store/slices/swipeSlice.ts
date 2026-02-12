/**
 * Swipe Redux Slice
 * Manages state for swipe interaction with offline support
 * Following CLAUDE.md guidelines - no any types, proper error handling
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Statement } from '@freedi/shared-types';
import { SWIPE } from '@/constants/common';

interface PendingEvaluation {
  statementId: string;
  rating: number;
  timestamp: number;
}

export interface SocialActivity {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  action: 'voted' | 'suggested' | 'proposed';
  timestamp: number;
}

interface SwipeState {
  // Question flow
  currentQuestion: Statement | null;
  showQuestionIntro: boolean;
  hasStartedSwiping: boolean;

  // Current card being shown
  currentCard: Statement | null;

  // Stack of cards to evaluate
  cardStack: Statement[];

  // IDs of cards that have been evaluated
  evaluatedCardIds: string[];

  // Number of proposals user has submitted
  userProposalCount: number;

  // Whether to show proposal prompt
  showProposalPrompt: boolean;

  // Social feed
  socialActivities: SocialActivity[];

  // Offline support
  pendingEvaluations: PendingEvaluation[];
  isOnline: boolean;
  syncError: string | null;

  // Loading states
  isLoading: boolean;
  error: string | null;
}

const initialState: SwipeState = {
  currentQuestion: null,
  showQuestionIntro: true,
  hasStartedSwiping: false,
  currentCard: null,
  cardStack: [],
  evaluatedCardIds: [],
  userProposalCount: 0,
  showProposalPrompt: false,
  socialActivities: [],
  pendingEvaluations: [],
  isOnline: true,
  syncError: null,
  isLoading: false,
  error: null,
};

const swipeSlice = createSlice({
  name: 'swipe',
  initialState,
  reducers: {
    // Set the current question
    setCurrentQuestion: (state, action: PayloadAction<Statement>) => {
      state.currentQuestion = action.payload;
      state.showQuestionIntro = true;
      state.hasStartedSwiping = false;
    },

    // Start swiping (hide intro)
    startSwiping: (state) => {
      state.showQuestionIntro = false;
      state.hasStartedSwiping = true;
    },

    // Set social activities
    setSocialActivities: (state, action: PayloadAction<SocialActivity[]>) => {
      state.socialActivities = action.payload;
    },

    // Add new social activity (for real-time updates)
    addSocialActivity: (state, action: PayloadAction<SocialActivity>) => {
      // Add to beginning of list
      state.socialActivities.unshift(action.payload);
      // Keep only most recent 20
      if (state.socialActivities.length > 20) {
        state.socialActivities = state.socialActivities.slice(0, 20);
      }
    },

    // Set the initial card stack
    setCardStack: (state, action: PayloadAction<Statement[]>) => {
      state.cardStack = action.payload;
      state.currentCard = action.payload[0] || null;
      state.isLoading = false;
      state.error = null;
    },

    // Mark a card as evaluated
    cardEvaluated: (state, action: PayloadAction<{ statementId: string; rating: number }>) => {
      const { statementId, rating } = action.payload;

      // Add to evaluated list
      state.evaluatedCardIds.push(statementId);

      // Remove from stack
      state.cardStack = state.cardStack.filter(
        (card) => card.statementId !== statementId
      );

      // Set next card
      state.currentCard = state.cardStack[0] || null;

      // Check if should show proposal prompt
      if (state.evaluatedCardIds.length % SWIPE.PROPOSAL_PROMPT_INTERVAL === 0) {
        state.showProposalPrompt = true;
      }

      // If offline, queue for sync
      if (!state.isOnline) {
        state.pendingEvaluations.push({
          statementId,
          rating,
          timestamp: Date.now(),
        });
      }
    },

    // User submitted a proposal
    proposalSubmitted: (state) => {
      state.userProposalCount += 1;
      state.showProposalPrompt = false;
    },

    // Dismiss proposal prompt
    dismissProposalPrompt: (state) => {
      state.showProposalPrompt = false;
    },

    // Online/offline status
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },

    // Sync pending evaluations (called when coming back online)
    syncPendingEvaluations: (state) => {
      state.syncError = null;
      // Actual sync happens in async thunk
    },

    // Sync failed
    syncFailed: (state, action: PayloadAction<string>) => {
      state.syncError = action.payload;
    },

    // Individual evaluation synced successfully
    evaluationSynced: (state, action: PayloadAction<string>) => {
      state.pendingEvaluations = state.pendingEvaluations.filter(
        (e) => e.statementId !== action.payload
      );
    },

    // Loading state
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    // Error state
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    // Reset state (for new question/session)
    resetSwipeState: (state) => {
      state.currentQuestion = null;
      state.showQuestionIntro = true;
      state.hasStartedSwiping = false;
      state.currentCard = null;
      state.cardStack = [];
      state.evaluatedCardIds = [];
      state.userProposalCount = 0;
      state.showProposalPrompt = false;
      state.socialActivities = [];
      state.error = null;
      // Keep offline state and pending evaluations
    },
  },
});

export const {
  setCurrentQuestion,
  startSwiping,
  setSocialActivities,
  addSocialActivity,
  setCardStack,
  cardEvaluated,
  proposalSubmitted,
  dismissProposalPrompt,
  setOnlineStatus,
  syncPendingEvaluations,
  syncFailed,
  evaluationSynced,
  setLoading,
  setError,
  resetSwipeState,
} = swipeSlice.actions;

export default swipeSlice.reducer;
