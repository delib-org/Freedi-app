/**
 * Swipe Slice Tests
 * Following CLAUDE.md - 80%+ coverage required
 */

import reducer, {
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
} from '../swipeSlice';
import { Statement } from '@freedi/shared-types';
import { SWIPE, RATING } from '@/constants/common';

describe('swipeSlice', () => {
  const mockStatement1: Statement = {
    statementId: 'stmt1',
    statement: 'Test statement 1',
    createdBy: 'user1',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  } as Statement;

  const mockStatement2: Statement = {
    statementId: 'stmt2',
    statement: 'Test statement 2',
    createdBy: 'user1',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
  } as Statement;

  const initialState = {
    currentQuestion: null,
    showQuestionIntro: true,
    hasStartedSwiping: false,
    socialActivities: [],
    currentCard: null,
    cardStack: [],
    evaluatedCardIds: [],
    userProposalCount: 0,
    showProposalPrompt: false,
    pendingEvaluations: [],
    isOnline: true,
    syncError: null,
    isLoading: false,
    error: null,
  };

  describe('setCardStack', () => {
    it('should set card stack and current card', () => {
      const state = reducer(
        initialState,
        setCardStack([mockStatement1, mockStatement2])
      );

      expect(state.cardStack).toHaveLength(2);
      expect(state.currentCard).toEqual(mockStatement1);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe(null);
    });

    it('should set current card to null if stack is empty', () => {
      const state = reducer(initialState, setCardStack([]));

      expect(state.cardStack).toHaveLength(0);
      expect(state.currentCard).toBe(null);
    });
  });

  describe('cardEvaluated', () => {
    it('should mark card as evaluated and move to next', () => {
      const stateWithCards = reducer(
        initialState,
        setCardStack([mockStatement1, mockStatement2])
      );

      const state = reducer(
        stateWithCards,
        cardEvaluated({ statementId: 'stmt1', rating: RATING.LIKE })
      );

      expect(state.evaluatedCardIds).toContain('stmt1');
      expect(state.currentCard).toEqual(mockStatement2);
      expect(state.cardStack).toHaveLength(1);
    });

    it('should show proposal prompt after interval', () => {
      const stateWithCards = reducer(
        initialState,
        setCardStack([mockStatement1, mockStatement2])
      );

      // Evaluate cards up to the interval
      let state = stateWithCards;
      for (let i = 0; i < SWIPE.PROPOSAL_PROMPT_INTERVAL; i++) {
        state = reducer(
          state,
          cardEvaluated({ statementId: `stmt${i}`, rating: RATING.LIKE })
        );
      }

      expect(state.showProposalPrompt).toBe(true);
    });

    it('should queue evaluation when offline', () => {
      const stateWithCards = reducer(
        initialState,
        setCardStack([mockStatement1, mockStatement2])
      );
      const offlineState = reducer(stateWithCards, setOnlineStatus(false));

      const state = reducer(
        offlineState,
        cardEvaluated({ statementId: 'stmt1', rating: RATING.LIKE })
      );

      expect(state.pendingEvaluations).toHaveLength(1);
      expect(state.pendingEvaluations[0]).toMatchObject({
        statementId: 'stmt1',
        rating: RATING.LIKE,
      });
    });
  });

  describe('proposalSubmitted', () => {
    it('should increment proposal count and hide prompt', () => {
      const stateWithPrompt = {
        ...initialState,
        showProposalPrompt: true,
      };

      const state = reducer(stateWithPrompt, proposalSubmitted());

      expect(state.userProposalCount).toBe(1);
      expect(state.showProposalPrompt).toBe(false);
    });
  });

  describe('dismissProposalPrompt', () => {
    it('should hide proposal prompt', () => {
      const stateWithPrompt = {
        ...initialState,
        showProposalPrompt: true,
      };

      const state = reducer(stateWithPrompt, dismissProposalPrompt());

      expect(state.showProposalPrompt).toBe(false);
    });
  });

  describe('offline sync', () => {
    it('should handle sync success', () => {
      const stateWithPending = {
        ...initialState,
        pendingEvaluations: [
          { statementId: 'stmt1', rating: RATING.LIKE, timestamp: Date.now() },
        ],
      };

      const state = reducer(stateWithPending, evaluationSynced('stmt1'));

      expect(state.pendingEvaluations).toHaveLength(0);
    });

    it('should handle sync failure', () => {
      const state = reducer(initialState, syncFailed('Network error'));

      expect(state.syncError).toBe('Network error');
    });

    it('should clear sync error on new sync attempt', () => {
      const stateWithError = {
        ...initialState,
        syncError: 'Previous error',
      };

      const state = reducer(stateWithError, syncPendingEvaluations());

      expect(state.syncError).toBe(null);
    });
  });

  describe('loading and error states', () => {
    it('should set loading state', () => {
      const state = reducer(initialState, setLoading(true));
      expect(state.isLoading).toBe(true);
    });

    it('should set error and clear loading', () => {
      const loadingState = { ...initialState, isLoading: true };
      const state = reducer(loadingState, setError('Test error'));

      expect(state.error).toBe('Test error');
      expect(state.isLoading).toBe(false);
    });
  });

  describe('resetSwipeState', () => {
    it('should reset state but keep offline info', () => {
      const fullState = {
        currentQuestion: mockStatement1,
        showQuestionIntro: false,
        hasStartedSwiping: true,
        socialActivities: [
          {
            id: '1',
            userId: 'user1',
            userName: 'User',
            action: 'voted' as const,
            timestamp: Date.now(),
          },
        ],
        currentCard: mockStatement1,
        cardStack: [mockStatement2],
        evaluatedCardIds: ['stmt1'],
        userProposalCount: 5,
        showProposalPrompt: true,
        pendingEvaluations: [
          { statementId: 'stmt3', rating: RATING.LIKE, timestamp: Date.now() },
        ],
        isOnline: false,
        syncError: 'Error',
        isLoading: false,
        error: 'Error',
      };

      const state = reducer(fullState, resetSwipeState());

      expect(state.currentQuestion).toBe(null);
      expect(state.showQuestionIntro).toBe(true);
      expect(state.hasStartedSwiping).toBe(false);
      expect(state.socialActivities).toHaveLength(0);
      expect(state.currentCard).toBe(null);
      expect(state.cardStack).toHaveLength(0);
      expect(state.evaluatedCardIds).toHaveLength(0);
      expect(state.userProposalCount).toBe(0);
      expect(state.error).toBe(null);

      // Should keep offline state
      expect(state.isOnline).toBe(false);
      expect(state.pendingEvaluations).toHaveLength(1);
    });
  });

  describe('question flow', () => {
    it('should set current question', () => {
      const state = reducer(initialState, setCurrentQuestion(mockStatement1));

      expect(state.currentQuestion).toEqual(mockStatement1);
      expect(state.showQuestionIntro).toBe(true);
      expect(state.hasStartedSwiping).toBe(false);
    });

    it('should start swiping', () => {
      const stateWithQuestion = reducer(initialState, setCurrentQuestion(mockStatement1));
      const state = reducer(stateWithQuestion, startSwiping());

      expect(state.showQuestionIntro).toBe(false);
      expect(state.hasStartedSwiping).toBe(true);
    });
  });

  describe('social activities', () => {
    it('should set social activities', () => {
      const activities = [
        {
          id: '1',
          userId: 'user1',
          userName: 'User 1',
          action: 'voted' as const,
          timestamp: Date.now(),
        },
        {
          id: '2',
          userId: 'user2',
          userName: 'User 2',
          action: 'suggested' as const,
          timestamp: Date.now(),
        },
      ];

      const state = reducer(initialState, setSocialActivities(activities));

      expect(state.socialActivities).toHaveLength(2);
      expect(state.socialActivities).toEqual(activities);
    });

    it('should add new social activity', () => {
      const newActivity = {
        id: '3',
        userId: 'user3',
        userName: 'User 3',
        action: 'proposed' as const,
        timestamp: Date.now(),
      };

      const state = reducer(initialState, addSocialActivity(newActivity));

      expect(state.socialActivities).toHaveLength(1);
      expect(state.socialActivities[0]).toEqual(newActivity);
    });

    it('should limit social activities to 20', () => {
      // Create state with 20 activities
      const activities = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        userId: `user${i}`,
        userName: `User ${i}`,
        action: 'voted' as const,
        timestamp: Date.now(),
      }));

      const stateWith20 = reducer(initialState, setSocialActivities(activities));

      // Add one more
      const newActivity = {
        id: '21',
        userId: 'user21',
        userName: 'User 21',
        action: 'voted' as const,
        timestamp: Date.now(),
      };

      const state = reducer(stateWith20, addSocialActivity(newActivity));

      expect(state.socialActivities).toHaveLength(20);
      expect(state.socialActivities[0]).toEqual(newActivity);
    });

    it('should add new activity to beginning of list', () => {
      const firstActivity = {
        id: '1',
        userId: 'user1',
        userName: 'User 1',
        action: 'voted' as const,
        timestamp: Date.now(),
      };

      const stateWithOne = reducer(initialState, addSocialActivity(firstActivity));

      const secondActivity = {
        id: '2',
        userId: 'user2',
        userName: 'User 2',
        action: 'suggested' as const,
        timestamp: Date.now(),
      };

      const state = reducer(stateWithOne, addSocialActivity(secondActivity));

      expect(state.socialActivities).toHaveLength(2);
      expect(state.socialActivities[0]).toEqual(secondActivity);
      expect(state.socialActivities[1]).toEqual(firstActivity);
    });
  });
});
