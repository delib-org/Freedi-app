'use client';

/**
 * Test Page for Swipe Components
 * Demonstrates all Phase 1-3 components working together with Firebase
 */

import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import SwipeCard from '@/components/swipe/SwipeCard';
import RatingButton from '@/components/swipe/RatingButton';
import QuestionIntro from '@/components/swipe/QuestionIntro';
import SurveyProgress from '@/components/swipe/SurveyProgress';
import SocialFeed, { SocialActivity } from '@/components/swipe/SocialFeed';
import ProposalModal from '@/components/swipe/ProposalModal';
import {
  setCurrentQuestion,
  startSwiping,
  setCardStack,
  cardEvaluated,
  setSocialActivities,
  addSocialActivity,
  setLoading,
  setError,
} from '@/store/slices/swipeSlice';
import {
  selectShowQuestionIntro,
  selectCurrentCard,
  selectEvaluatedCardsCount,
  selectTotalCardsCount,
  selectShowProposalPrompt,
  selectSocialActivities,
  selectIsLoading,
  selectError,
} from '@/store/slices/swipeSelectors';
import { submitRating, loadCardBatch } from '@/controllers/swipeController';
import { submitProposal } from '@/controllers/proposalController';
import { RATING } from '@/constants/common';
import type { RatingValue } from '@/components/swipe/RatingButton';

export default function TestSwipePage() {
  const dispatch = useDispatch();
  const showIntro = useSelector(selectShowQuestionIntro);
  const currentCard = useSelector(selectCurrentCard);
  const evaluatedCount = useSelector(selectEvaluatedCardsCount);
  const totalCount = useSelector(selectTotalCardsCount);
  const showProposalPrompt = useSelector(selectShowProposalPrompt);
  const socialActivities = useSelector(selectSocialActivities);
  const isLoading = useSelector(selectIsLoading);
  const error = useSelector(selectError);

  const [showProposalModal, setShowProposalModal] = useState(false);
  const [questionId, setQuestionId] = useState<string>('');
  const [currentQuestion, setCurrentQuestionState] = useState<Statement | null>(null);

  // Mock user (replace with real auth)
  const mockUser = {
    uid: 'test-user-' + Date.now(),
    displayName: 'Test User',
  };

  // Load question ID from URL or prompt
  useEffect(() => {
    // Check URL params
    const params = new URLSearchParams(window.location.search);
    const qId = params.get('questionId');

    if (qId) {
      setQuestionId(qId);
    } else {
      // Prompt user for question ID
      const userInput = prompt('Enter a Question ID to test with:');
      if (userInput) {
        setQuestionId(userInput);
        // Update URL
        window.history.replaceState({}, '', `?questionId=${userInput}`);
      }
    }
  }, []);

  // Load question and cards from Firebase
  useEffect(() => {
    if (!questionId) return;

    const loadData = async () => {
      dispatch(setLoading(true));

      try {
        // In a real app, you'd load the question from Firebase
        // For now, create a mock question with the ID
        const question: Statement = {
          statementId: questionId,
          statement: `Question: ${questionId}`,
          description: 'Loaded from Firebase',
          createdBy: 'admin',
          createdAt: Date.now(),
          lastUpdate: Date.now(),
        } as Statement;

        setCurrentQuestionState(question);
        dispatch(setCurrentQuestion(question));

        // Load actual statements from Firebase
        const statements = await loadCardBatch(questionId, 10, mockUser.uid);
        dispatch(setCardStack(statements));

        // Mock social activities (in real app, load from Firebase)
        const mockActivities: SocialActivity[] = [
          {
            id: '1',
            userId: 'user1',
            userName: 'Alice',
            action: 'voted',
            timestamp: Date.now() - 1000 * 60 * 2,
          },
          {
            id: '2',
            userId: 'user2',
            userName: 'Bob',
            action: 'suggested',
            timestamp: Date.now() - 1000 * 60 * 5,
          },
        ];
        dispatch(setSocialActivities(mockActivities));

        dispatch(setLoading(false));
      } catch (err) {
        console.error('Failed to load data:', err);
        dispatch(setError('Failed to load question data. Make sure the question exists in Firestore.'));
        dispatch(setLoading(false));
      }
    };

    loadData();
  }, [questionId, dispatch]);

  const handleStart = () => {
    dispatch(startSwiping());
  };

  const handleSwipe = async (rating: RatingValue) => {
    if (!currentCard || !currentQuestion) return;

    try {
      // Save rating to Firebase
      await submitRating(currentQuestion.statementId, currentCard.statementId, rating, mockUser.uid);

      // Add to evaluated in Redux
      dispatch(cardEvaluated({ statementId: currentCard.statementId, rating }));

      // Add to social feed
      dispatch(
        addSocialActivity({
          id: `activity-${Date.now()}`,
          userId: mockUser.uid,
          userName: mockUser.displayName,
          action: 'voted',
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      console.error('Failed to submit rating:', err);
      dispatch(setError('Failed to submit rating. Please try again.'));
    }
  };

  const handleProposalSubmit = async (proposalText: string) => {
    if (!currentQuestion) {
      dispatch(setError('No question loaded'));
      return;
    }

    try {
      // Save proposal to Firebase
      await submitProposal(
        proposalText,
        currentQuestion.statementId,
        mockUser.uid,
        mockUser.displayName
      );

      // Add to social feed
      dispatch(
        addSocialActivity({
          id: `proposal-${Date.now()}`,
          userId: mockUser.uid,
          userName: mockUser.displayName,
          action: 'proposed',
          timestamp: Date.now(),
        })
      );

      console.log('Proposal saved to Firestore successfully');
    } catch (err) {
      console.error('Failed to submit proposal:', err);
      dispatch(setError('Failed to submit proposal. Please try again.'));
      throw err; // Re-throw to keep modal open on error
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>
          Swipe Components - Firebase Integration
        </h1>

        {/* Error display */}
        {error && (
          <div
            style={{
              padding: '1rem',
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: '8px',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>Loading data from Firebase...</p>
          </div>
        )}

        {/* Show nothing if no question loaded yet */}
        {!questionId && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>Please provide a Question ID in the URL or refresh to be prompted.</p>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              Example: ?questionId=your-question-id
            </p>
          </div>
        )}

        {/* Main content - only show if we have a question */}
        {questionId && !isLoading && (
          <>
            {/* Show intro or swipe interface */}
            {showIntro && currentQuestion ? (
          <div style={{ marginBottom: '2rem' }}>
            <QuestionIntro question={currentQuestion} onStart={handleStart} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
            {/* Main swipe area */}
            <div>
              {/* Progress */}
              <div style={{ marginBottom: '1rem' }}>
                <SurveyProgress current={evaluatedCount} total={totalCount} />
              </div>

              {/* Current card or completion message */}
              {currentCard ? (
                <div style={{ marginBottom: '1rem' }}>
                  <SwipeCard
                    statement={currentCard}
                    onSwipe={handleSwipe}
                    totalCards={totalCount}
                    currentIndex={evaluatedCount}
                  />

                  {/* Rating buttons */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '12px',
                      marginTop: '1rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <RatingButton
                      rating={RATING.STRONGLY_DISAGREE}
                      onClick={handleSwipe}
                    />
                    <RatingButton
                      rating={RATING.DISAGREE}
                      onClick={handleSwipe}
                    />
                    <RatingButton
                      rating={RATING.NEUTRAL}
                      onClick={handleSwipe}
                    />
                    <RatingButton
                      rating={RATING.AGREE}
                      onClick={handleSwipe}
                    />
                    <RatingButton
                      rating={RATING.STRONGLY_AGREE}
                      onClick={handleSwipe}
                    />
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '3rem',
                    background: 'white',
                    borderRadius: '16px',
                  }}
                >
                  <h2>🎉 All done!</h2>
                  <p>You've evaluated all proposals.</p>
                  <button
                    onClick={() => setShowProposalModal(true)}
                    style={{
                      marginTop: '1rem',
                      padding: '12px 24px',
                      background: '#5f88e5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                    }}
                  >
                    Submit Your Own Idea
                  </button>
                </div>
              )}

              {/* Test proposal modal button */}
              <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                <button
                  onClick={() => setShowProposalModal(true)}
                  style={{
                    padding: '12px 24px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '1rem',
                  }}
                >
                  Test Proposal Modal
                </button>
              </div>
            </div>

            {/* Social feed sidebar */}
            <div>
              <SocialFeed activities={socialActivities} />
            </div>
          </div>
        )}

            {/* Proposal Modal */}
            <ProposalModal
              isOpen={showProposalModal}
              onClose={() => setShowProposalModal(false)}
              onSubmit={handleProposalSubmit}
            />
          </>
        )}
      </div>
    </div>
  );
}
