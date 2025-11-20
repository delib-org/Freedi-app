'use client';

import { useState } from 'react';
import { Statement } from 'delib-npm';
import type { FlowState, SimilarCheckResponse } from '@/types/api';
import AddSolutionForm from './AddSolutionForm';
import EnhancedLoader from './EnhancedLoader';
import SimilarSolutions from './SimilarSolutions';
import SuccessMessage from './SuccessMessage';

interface AddSolutionFlowProps {
  questionId: string;
  userId: string;
  onComplete: () => void;
}

/**
 * Manages the complete flow for adding a solution with similar detection
 */
export default function AddSolutionFlow({
  questionId,
  userId,
  onComplete,
}: AddSolutionFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>({ step: 'input' });
  const [userInput, setUserInput] = useState('');

  // Step 1: Check for similar solutions via API proxy (avoids CORS)
  const handleCheckSimilar = async (solutionText: string) => {
    // Validate inputs before making request
    if (!solutionText || !userId) {
      alert('Please provide a valid solution and ensure you are logged in.');
      return;
    }

    setUserInput(solutionText);

    // Show submitting state while checking
    setFlowState({ step: 'submitting' });

    try {
      // Call Next.js API route which proxies to Cloud Function
      const response = await fetch(`/api/statements/${questionId}/check-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: solutionText,
          userId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        // Handle specific error codes
        if (response.status === 400) {
          // Inappropriate content or validation error
          alert(data.error || 'Your submission contains inappropriate content. Please revise.');
          setFlowState({ step: 'input' });
          return;
        }

        if (response.status === 403) {
          // Limit reached
          alert(data.error || "You've reached the maximum number of solutions for this question.");
          setFlowState({ step: 'input' });
          return;
        }

        throw new Error(data.error || 'Failed to check for similar solutions');
      }

      const data: SimilarCheckResponse = await response.json();

      // Show results or proceed to submit if no similar found
      if (data.similarStatements && data.similarStatements.length > 0) {
        setFlowState({ step: 'similar', data });
      } else {
        // No similar solutions, proceed directly to submit
        await handleSelectSolution(null);
      }
    } catch (error) {
      console.error('[AddSolutionFlow] Similar check error:', error);
      // On error, reset to input form
      alert('Unable to check for similar solutions. Please try again.');
      setFlowState({ step: 'input' });
    }
  };

  // Step 2: User selects their solution or an existing one
  const handleSelectSolution = async (statementId: string | null) => {
    setFlowState({ step: 'submitting' });

    try {
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionText: userInput,
          userId,
          existingStatementId: statementId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit solution');
      }

      const data = await response.json();

      // Show success message
      setFlowState({
        step: 'success',
        action: data.action,
        solutionText: userInput,
      });
    } catch (error) {
      console.error('[AddSolutionFlow] Submit error:', error);
      alert(error instanceof Error ? error.message : 'Failed to submit solution');
      setFlowState({ step: 'input' });
    }
  };

  // Handle going back to edit
  const handleBack = () => {
    setFlowState({ step: 'input' });
  };

  // Handle completion
  const handleSuccess = () => {
    setUserInput('');
    setFlowState({ step: 'input' });
    onComplete();
  };

  // Render based on current flow state
  return (
    <>
      {flowState.step === 'input' && (
        <AddSolutionForm
          questionId={questionId}
          userId={userId}
          onSubmit={handleCheckSimilar}
        />
      )}

      {flowState.step === 'similar' && (
        <SimilarSolutions
          userSuggestion={userInput}
          similarSolutions={flowState.data.similarStatements}
          onSelect={handleSelectSolution}
          onBack={handleBack}
        />
      )}

      {flowState.step === 'submitting' && (
        <EnhancedLoader />
      )}

      {flowState.step === 'success' && (
        <SuccessMessage
          action={flowState.action}
          solutionText={flowState.solutionText}
          onComplete={handleSuccess}
        />
      )}
    </>
  );
}
