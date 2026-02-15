'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/shared/Modal';
import { VALIDATION } from '@/constants/common';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError, NetworkError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import type { FlowState, SimilarCheckResponse, MultiSuggestionResponse, SplitSuggestion } from '@/types/api';
import { SuggestionMode } from '@freedi/shared-types';
import SimilarSolutions from './SimilarSolutions';
import EnhancedLoader from './EnhancedLoader';
import SuccessMessage from './SuccessMessage';
import MultiSuggestionPreview from './MultiSuggestionPreview';
import InlineMarkdown from '../shared/InlineMarkdown';
import styles from './SolutionPromptModal.module.css';
import { trackSolutionSubmitted } from '@/lib/analytics';

interface SolutionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  userId: string;
  onSubmitSuccess: () => void;
  title?: string;
  questionText?: string;
  /** Controls UX friction when adding new suggestions vs merging */
  suggestionMode?: SuggestionMode;
  /** When true, shows "Add your answer later" instead of "Cancel" */
  requiresSolution?: boolean;
  hasCheckedUserSolutions?: boolean;
  userName?: string;
}

const MAX_ROWS = 8;
const LINE_HEIGHT = 24;

export default function SolutionPromptModal({
  isOpen,
  onClose,
  questionId,
  userId,
  onSubmitSuccess,
  title = 'Add Your Solution',
  questionText,
  suggestionMode = SuggestionMode.encourage,
  requiresSolution = false,
  hasCheckedUserSolutions: _hasCheckedUserSolutions = false,
  userName: _userName,
}: SolutionPromptModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [flowState, setFlowState] = useState<FlowState>({ step: 'input' });
  const [error, setError] = useState<string | null>(null);
  const [generatedTitleDesc, setGeneratedTitleDesc] = useState<{ title?: string; description?: string }>({});
  const [multiSuggestions, setMultiSuggestions] = useState<SplitSuggestion[]>([]);
  const [storedSimilarData, setStoredSimilarData] = useState<SimilarCheckResponse | null>(null);
  const [isFinalSubmit, setIsFinalSubmit] = useState(false);
  const [isQuestionExpanded, setIsQuestionExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const characterCount = text.length;
  const isValid =
    characterCount >= VALIDATION.MIN_SOLUTION_LENGTH &&
    characterCount <= VALIDATION.MAX_SOLUTION_LENGTH;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setText('');
      setFlowState({ step: 'input' });
      setError(null);
      setGeneratedTitleDesc({});
      setMultiSuggestions([]);
      setStoredSimilarData(null);
    }
  }, [isOpen]);

  // Auto-grow textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const maxHeight = LINE_HEIGHT * MAX_ROWS;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [text]);

  // Step 1: Check for multi-suggestions AND similar solutions in parallel
  const handleCheckSimilar = async () => {
    if (!isValid) return;

    setFlowState({ step: 'submitting' });
    setError(null);

    try {
      console.info('🚀 Starting parallel API calls for multi-suggestion and similar check...');

      // Run both API calls in parallel with Promise.all for better performance
      const [multiResponse, similarResponse] = await Promise.all([
        // Check for multiple suggestions
        fetch(`/api/statements/${questionId}/detect-multi`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userInput: text,
            userId,
          }),
        }),
        // Check for similar solutions
        fetch(`/api/statements/${questionId}/check-similar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userInput: text,
            userId,
          }),
        }),
      ]);

      console.info('📥 API responses received:', {
        multiStatus: multiResponse.status,
        similarStatus: similarResponse.status,
      });

      // Handle similar response errors first (they're more critical)
      if (!similarResponse.ok) {
        const data = await similarResponse.json();

        if (similarResponse.status === 400) {
          const errorMessage = data.error || ERROR_MESSAGES.INAPPROPRIATE_CONTENT;
          setError(errorMessage);
          setFlowState({ step: 'input' });

          logError(new ValidationError(errorMessage), {
            operation: 'SolutionPromptModal.handleCheckSimilar',
            userId,
            questionId,
            metadata: { status: similarResponse.status },
          });
          return;
        }

        if (similarResponse.status === 403) {
          const errorMessage = data.error || ERROR_MESSAGES.LIMIT_REACHED;
          setError(errorMessage);
          setFlowState({ step: 'input' });
          return;
        }

        throw new NetworkError(data.error || 'Failed to check for similar solutions');
      }

      // Parse similar response
      const similarData: SimilarCheckResponse = await similarResponse.json();

      // Store generated title/description for later use
      if (similarData.generatedTitle || similarData.generatedDescription) {
        setGeneratedTitleDesc({
          title: similarData.generatedTitle,
          description: similarData.generatedDescription,
        });
      }

      // Parse multi-response separately to handle errors gracefully
      let multiData: MultiSuggestionResponse = {
        ok: false,
        isMultipleSuggestions: false,
        suggestions: [],
        originalText: text,
      };

      if (multiResponse.ok) {
        try {
          multiData = await multiResponse.json();
          console.info('✅ Multi-suggestion detection result:', {
            ok: multiData.ok,
            isMultiple: multiData.isMultipleSuggestions,
            suggestionsCount: multiData.suggestions?.length,
          });
        } catch (parseError) {
          console.error('Failed to parse multi-suggestion response:', parseError);
        }
      } else {
        console.error('Multi-suggestion detection failed:', {
          status: multiResponse.status,
          statusText: multiResponse.statusText,
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

        setMultiSuggestions(splitSuggestions);
        // Store similar data for later (after multi-preview)
        setStoredSimilarData(similarData.similarStatements?.length > 0 ? similarData : null);
        setFlowState({
          step: 'multi-preview',
          suggestions: splitSuggestions,
          originalText: text,
          similarData: similarData.similarStatements?.length > 0 ? similarData : undefined,
        });
        return;
      }

      // No multiple suggestions - check for similar
      if (similarData.similarStatements && similarData.similarStatements.length > 0) {
        setFlowState({ step: 'similar', data: similarData });
      } else {
        // No similar solutions, proceed to submit with generated title/description
        await handleSelectSolution(null, text, similarData.generatedTitle, similarData.generatedDescription);
      }
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleCheckSimilar',
        userId,
        questionId,
      });
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CHECK_SIMILAR_FAILED);
      setFlowState({ step: 'input' });
    }
  };

  // Step 2: Submit solution (new or existing - for backward compatibility)
  const handleSelectSolution = async (
    statementId: string | null,
    solutionText?: string,
    genTitle?: string,
    genDescription?: string
  ) => {
    const textToSubmit = solutionText || text;
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    // Use passed values or stored values from check-similar response
    const titleToUse = genTitle || generatedTitleDesc.title;
    const descriptionToUse = genDescription || generatedTitleDesc.description;

    try {
      const response = await fetch(`/api/statements/${questionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solutionText: textToSubmit,
          userId,
          existingStatementId: statementId,
          generatedTitle: titleToUse,
          generatedDescription: descriptionToUse,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new NetworkError(data.error || ERROR_MESSAGES.SUBMIT_FAILED);
      }

      const data = await response.json();

      // Track successful solution submission
      trackSolutionSubmitted(questionId, userId, data.action === 'created');

      setFlowState({
        step: 'success',
        action: data.action,
        solutionText: textToSubmit,
      });
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleSelectSolution',
        userId,
        questionId,
        statementId: statementId || undefined,
      });
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.SUBMIT_FAILED);
      setFlowState({ step: 'input' });
    }
  };

  // Step 2b: Merge solution into existing statement (new default behavior)
  const handleMergeSolution = async (targetStatementId: string) => {
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    try {
      console.info('🔀 Merging solution into existing statement:', targetStatementId);

      const response = await fetch(`/api/statements/${questionId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStatementId,
          solutionText: text,
          userId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new NetworkError(data.error || ERROR_MESSAGES.MERGE_FAILED);
      }

      await response.json();

      // Track successful merge
      trackSolutionSubmitted(questionId, userId, false); // false = merged, not created

      setFlowState({
        step: 'success',
        action: 'merged',
        solutionText: text,
      });
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleMergeSolution',
        userId,
        metadata: { questionId, targetStatementId },
      });
      setError(err instanceof Error ? err.message : (ERROR_MESSAGES.MERGE_FAILED || ERROR_MESSAGES.SUBMIT_FAILED));
      setFlowState({ step: 'input' });
    }
  };

  const handleBack = () => {
    setFlowState({ step: 'input' });
    setIsFinalSubmit(false);
    setError(null);
  };

  // Handle confirming multiple suggestions - submit each one
  const handleConfirmMultiSuggestions = async (suggestions: SplitSuggestion[]) => {
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    try {
      // Submit each suggestion sequentially
      for (const suggestion of suggestions) {
        const solutionText = `${suggestion.title}: ${suggestion.description}`;

        const response = await fetch(`/api/statements/${questionId}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            solutionText,
            userId,
            existingStatementId: null,
            generatedTitle: suggestion.title,
            generatedDescription: suggestion.description,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new NetworkError(data.error || ERROR_MESSAGES.SUBMIT_FAILED);
        }

        const data = await response.json();
        trackSolutionSubmitted(questionId, userId, data.action === 'created');
      }

      setFlowState({
        step: 'success',
        action: 'created',
        solutionText: `${suggestions.length} suggestions`,
      });
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleConfirmMultiSuggestions',
        userId,
        questionId,
        metadata: { suggestionCount: suggestions.length },
      });
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.SUBMIT_FAILED);
      setFlowState({ step: 'input' });
    }
  };

  // Handle dismissing multi-suggestion preview (submit original as-is)
  const handleDismissMulti = async () => {
    // Check if we have stored similar data
    if (storedSimilarData && storedSimilarData.similarStatements?.length > 0) {
      // Show similar solutions
      setFlowState({ step: 'similar', data: storedSimilarData });
    } else {
      // Submit original directly
      await handleSelectSolution(null, text, generatedTitleDesc.title, generatedTitleDesc.description);
    }
  };

  const handleSuccess = () => {
    setText('');
    setFlowState({ step: 'input' });
    onClose();
    onSubmitSuccess();
  };

  const handleClose = () => {
    if (flowState.step === 'submitting') return; // Don't close while submitting
    setText('');
    setFlowState({ step: 'input' });
    setError(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={flowState.step === 'input' && !questionText ? (requiresSolution ? t('Share Your Perspective First') : title) : undefined}>
      <div className={styles.content}>
        {flowState.step === 'input' && (
          <>
            {/* Explanatory Context for "Add Solution First" Feature */}
            {requiresSolution && (
              <div className={styles.questionContext}>
                <p className={styles.questionText}>
                  {t('We value your independent thinking. Share your perspective before seeing others\' ideas to help generate more diverse and creative solutions.')}
                </p>
              </div>
            )}

            {/* Question Context Banner */}
            {questionText && (
              <div className={styles.questionContext}>
                <span className={styles.questionLabel}>{t('Please add your answer to the following question:')}</span>
                <p className={`${styles.questionText} ${isQuestionExpanded ? styles.questionTextExpanded : ''}`}>
                  <InlineMarkdown text={questionText} />
                </p>
                {questionText.length > 150 && (
                  <button
                    type="button"
                    className={styles.expandButton}
                    onClick={() => setIsQuestionExpanded(!isQuestionExpanded)}
                  >
                    {isQuestionExpanded ? t('Show less') : t('Show more')}
                  </button>
                )}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={requiresSolution ? t('What\'s your idea?') : t('Type your answer here...')}
              className={styles.textarea}
              rows={2}
              maxLength={VALIDATION.MAX_SOLUTION_LENGTH}
              autoFocus
            />

            <div className={styles.charCount}>
              <span className={characterCount < VALIDATION.MIN_SOLUTION_LENGTH && characterCount > 0 ? styles.invalid : ''}>
                {characterCount}/{VALIDATION.MAX_SOLUTION_LENGTH}
              </span>
              {characterCount > 0 && characterCount < VALIDATION.MIN_SOLUTION_LENGTH && (
                <span className={styles.hint}> ({t('minimum')} {VALIDATION.MIN_SOLUTION_LENGTH} {t('characters')})</span>
              )}
            </div>

            {error && <p className={styles.error}>{t(error)}</p>}

            <div className={styles.actions}>
              <button
                className={styles.cancelButton}
                onClick={handleClose}
              >
                {requiresSolution
                  ? t('Skip for now')
                  : t('Cancel')}
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleCheckSimilar}
                disabled={!isValid}
              >
                {requiresSolution ? t('Share My Idea') : t('Submit')}
              </button>
            </div>
          </>
        )}

        {flowState.step === 'submitting' && (
          <div className={styles.loaderContainer}>
            {isFinalSubmit ? (
              <div className={styles.simpleLoader}>
                <div className={styles.simpleSpinner} />
                <p>{t('Submitting...')}</p>
              </div>
            ) : (
              <EnhancedLoader />
            )}
          </div>
        )}

        {flowState.step === 'multi-preview' && (
          <MultiSuggestionPreview
            originalText={text}
            suggestions={multiSuggestions}
            onConfirm={handleConfirmMultiSuggestions}
            onDismiss={handleDismissMulti}
            onBack={handleBack}
            isSubmitting={false}
          />
        )}

        {flowState.step === 'similar' && (
          <SimilarSolutions
            userSuggestion={text}
            similarSolutions={flowState.data.similarStatements}
            onSelect={handleSelectSolution}
            onMerge={handleMergeSolution}
            onBack={handleBack}
            suggestionMode={suggestionMode}
          />
        )}

        {flowState.step === 'success' && (
          <SuccessMessage
            action={flowState.action}
            solutionText={flowState.solutionText}
            onComplete={handleSuccess}
          />
        )}
      </div>
    </Modal>
  );
}
