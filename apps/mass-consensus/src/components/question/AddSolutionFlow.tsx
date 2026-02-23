'use client';

import { useState } from 'react';
import type { FlowState, SimilarCheckResponse, MultiSuggestionResponse, SplitSuggestion } from '@/types/api';
import { SuggestionMode } from '@freedi/shared-types';
import { logError, NetworkError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import { useToast } from '@/components/shared/Toast';
import { useTranslation } from '@freedi/shared-i18n/next';
import AddSolutionForm from './AddSolutionForm';
import EnhancedLoader from './EnhancedLoader';
import SimilarSolutions from './SimilarSolutions';
import SuccessMessage from './SuccessMessage';
import MultiSuggestionPreview from './MultiSuggestionPreview';

interface AddSolutionFlowProps {
  questionId: string;
  userId: string;
  onComplete: () => void;
  /** Controls UX friction when adding new suggestions vs merging */
  suggestionMode?: SuggestionMode;
}

/**
 * Manages the complete flow for adding a solution with similar detection
 * and multi-suggestion detection (running in parallel with Promise.all)
 */
export default function AddSolutionFlow({
  questionId,
  userId,
  onComplete,
  suggestionMode = SuggestionMode.encourage,
}: AddSolutionFlowProps) {
  const [flowState, setFlowState] = useState<FlowState>({ step: 'input' });
  const [userInput, setUserInput] = useState('');
  const { showToast } = useToast();
  const { t } = useTranslation();

  // Step 1: Check for multi-suggestions AND similar solutions in parallel
  const handleCheckSimilar = async (solutionText: string) => {
    console.info('🔍 handleCheckSimilar called with:', { solutionText, userId, questionId });

    // Validate inputs before making request
    if (!solutionText || !userId) {
      showToast({
        type: 'error',
        message: ERROR_MESSAGES.MISSING_INPUT,
      });
      return;
    }

    setUserInput(solutionText);

    // Show checking state while processing
    setFlowState({ step: 'checking' });

    try {
      console.info('🚀 Starting parallel API calls...');

      // Run both API calls in parallel with Promise.all for better performance
      // Use cache: 'no-store' to prevent Next.js from caching these dynamic API calls
      const [multiResponse, similarResponse] = await Promise.all([
        // Check for multiple suggestions
        fetch(`/api/statements/${questionId}/detect-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userInput: solutionText,
            userId,
          }),
          cache: 'no-store',
        }),
        // Check for similar solutions
        fetch(`/api/statements/${questionId}/check-similar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userInput: solutionText,
            userId,
          }),
          cache: 'no-store',
        }),
      ]);

      console.info('📥 API responses received:', {
        multiStatus: multiResponse.status,
        similarStatus: similarResponse.status,
      });

      // Handle similar response errors first (they're more critical)
      if (!similarResponse.ok) {
        const similarData = await similarResponse.json();

        // Handle specific error codes
        if (similarResponse.status === 400) {
          const errorMessage = similarData.error || ERROR_MESSAGES.INAPPROPRIATE_CONTENT;
          showToast({
            type: 'error',
            title: t('Invalid Content'),
            message: errorMessage,
          });
          setFlowState({ step: 'input' });

          logError(new ValidationError(errorMessage), {
            operation: 'AddSolutionFlow.handleCheckSimilar',
            userId,
            questionId,
            metadata: { status: similarResponse.status },
          });
          return;
        }

        if (similarResponse.status === 403) {
          const errorMessage = similarData.error || ERROR_MESSAGES.LIMIT_REACHED;
          showToast({
            type: 'warning',
            title: t('Limit Reached'),
            message: errorMessage,
          });
          setFlowState({ step: 'input' });

          logError(new ValidationError(errorMessage), {
            operation: 'AddSolutionFlow.handleCheckSimilar',
            userId,
            questionId,
            metadata: { status: similarResponse.status },
          });
          return;
        }

        throw new NetworkError(similarData.error || 'Failed to check for similar solutions', {
          status: similarResponse.status,
          questionId,
        });
      }

      // Parse both responses
      const similarData: SimilarCheckResponse = await similarResponse.json();

      // Parse multi-response separately to handle errors gracefully
      let multiData: MultiSuggestionResponse = {
        ok: false,
        isMultipleSuggestions: false,
        suggestions: [],
        originalText: solutionText,
      };

      if (multiResponse.ok) {
        try {
          multiData = await multiResponse.json();
          console.info('Multi-suggestion detection result:', {
            ok: multiData.ok,
            isMultiple: multiData.isMultipleSuggestions,
            suggestionsCount: multiData.suggestions?.length,
          });
        } catch (parseError) {
          logError(parseError, {
            operation: 'AddSolutionFlow.handleCheckSimilar.parseMultiResponse',
            userId,
            questionId,
          });
        }
      } else if (multiResponse.status === 400) {
        // Content moderation blocked this input — do NOT allow submission
        const multiErrorData = await multiResponse.json().catch(() => ({ error: '' }));
        const errorMessage = multiErrorData.error || ERROR_MESSAGES.INAPPROPRIATE_CONTENT;
        showToast({
          type: 'error',
          title: t('Invalid Content'),
          message: errorMessage,
        });
        setFlowState({ step: 'input' });

        return;
      } else {
        logError(new Error('Multi-suggestion detection failed'), {
          operation: 'AddSolutionFlow.handleCheckSimilar.multiDetection',
          userId,
          questionId,
          metadata: { status: multiResponse.status, statusText: multiResponse.statusText },
        });
      }

      // Process results: Multi-suggestion check takes priority
      if (multiData.ok && multiData.isMultipleSuggestions && multiData.suggestions.length > 1) {
        // Convert to SplitSuggestion format with IDs
        const splitSuggestions: SplitSuggestion[] = multiData.suggestions.map((s, i) => ({
          id: `suggestion-${i}-${Date.now()}`,
          title: s.title,
          description: s.description,
          originalText: s.originalText,
          isRemoved: false,
        }));

        // Show multi-suggestion preview, store similar data for later
        setFlowState({
          step: 'multi-preview',
          suggestions: splitSuggestions,
          originalText: solutionText,
          similarData: similarData.similarStatements?.length > 0 ? similarData : undefined,
        });
        return;
      }

      // No multiple suggestions - check for similar
      if (similarData.similarStatements && similarData.similarStatements.length > 0) {
        setFlowState({ step: 'similar', data: similarData });
      } else {
        // No similar solutions, proceed directly to submit
        await handleSelectSolution(null, solutionText);
      }
    } catch (error) {
      logError(error, {
        operation: 'AddSolutionFlow.handleCheckSimilar',
        userId,
        questionId,
        metadata: { solutionTextLength: solutionText.length },
      });

      // On error, reset to input form
      showToast({
        type: 'error',
        title: t('Check Failed'),
        message: ERROR_MESSAGES.CHECK_SIMILAR_FAILED,
      });
      setFlowState({ step: 'input' });
    }
  };

  // Step 2: User selects their solution or an existing one
  // solutionText parameter is used when called directly from handleCheckSimilar
  // to avoid React state timing issues
  const handleSelectSolution = async (statementId: string | null, solutionText?: string) => {
    const textToSubmit = solutionText || userInput;
    setFlowState({ step: 'submitting' });

    try {
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionText: textToSubmit,
          userId,
          existingStatementId: statementId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new NetworkError(data.error || ERROR_MESSAGES.SUBMIT_FAILED, {
          status: response.status,
          statementId,
          questionId,
        });
      }

      const data = await response.json();

      // Show success message
      setFlowState({
        step: 'success',
        action: data.action,
        solutionText: textToSubmit,
      });
    } catch (error) {
      logError(error, {
        operation: 'AddSolutionFlow.handleSelectSolution',
        userId,
        questionId,
        statementId: statementId || undefined,
        metadata: { solutionTextLength: textToSubmit.length },
      });

      const errorMessage =
        error instanceof Error ? error.message : ERROR_MESSAGES.SUBMIT_FAILED;
      showToast({
        type: 'error',
        title: t('Submission Failed'),
        message: errorMessage,
      });
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

  // Handle confirming multiple suggestions
  const handleConfirmMultiSuggestions = async (suggestions: SplitSuggestion[]) => {
    setFlowState({ step: 'submitting' });

    try {
      // Submit each suggestion sequentially
      for (const suggestion of suggestions) {
        const solutionText = `${suggestion.title}: ${suggestion.description}`;
        await handleSelectSolution(null, solutionText);
      }
    } catch (error) {
      logError(error, {
        operation: 'AddSolutionFlow.handleConfirmMultiSuggestions',
        userId,
        questionId,
        metadata: { suggestionCount: suggestions.length },
      });

      showToast({
        type: 'error',
        title: t('Submission Failed'),
        message: ERROR_MESSAGES.SUBMIT_FAILED,
      });
      setFlowState({ step: 'input' });
    }
  };

  // Handle dismissing multi-suggestion preview (submit original as-is)
  const handleDismissMulti = async () => {
    // Check if we have stored similar data
    if (flowState.step === 'multi-preview' && flowState.similarData) {
      // Show similar solutions if available
      setFlowState({ step: 'similar', data: flowState.similarData });
    } else {
      // Otherwise submit original directly
      await handleSelectSolution(null, userInput);
    }
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

      {flowState.step === 'checking' && (
        <EnhancedLoader />
      )}

      {flowState.step === 'multi-preview' && (
        <MultiSuggestionPreview
          originalText={flowState.originalText}
          suggestions={flowState.suggestions}
          onConfirm={handleConfirmMultiSuggestions}
          onDismiss={handleDismissMulti}
          onBack={handleBack}
          isSubmitting={false}
        />
      )}

      {flowState.step === 'similar' && (
        <SimilarSolutions
          userSuggestion={userInput}
          similarSolutions={flowState.data.similarStatements}
          onSelect={handleSelectSolution}
          onBack={handleBack}
          suggestionMode={suggestionMode}
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
