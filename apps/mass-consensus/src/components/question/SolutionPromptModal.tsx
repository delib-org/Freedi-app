'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/shared/Modal';
import { VALIDATION } from '@/constants/common';
import { logError, NetworkError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import type { FlowState, SimilarCheckResponse } from '@/types/api';
import SimilarSolutions from './SimilarSolutions';
import EnhancedLoader from './EnhancedLoader';
import SuccessMessage from './SuccessMessage';
import styles from './SolutionPromptModal.module.css';

interface SolutionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  questionId: string;
  userId: string;
  onSubmitSuccess: () => void;
  title?: string;
  description?: string;
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
  description = 'Share your idea for this question.',
}: SolutionPromptModalProps) {
  const [text, setText] = useState('');
  const [flowState, setFlowState] = useState<FlowState>({ step: 'input' });
  const [error, setError] = useState<string | null>(null);
  const [generatedTitleDesc, setGeneratedTitleDesc] = useState<{ title?: string; description?: string }>({});
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

  // Step 1: Check for similar solutions
  const handleCheckSimilar = async () => {
    if (!isValid) return;

    setFlowState({ step: 'submitting' });
    setError(null);

    try {
      const response = await fetch(`/api/statements/${questionId}/check-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInput: text,
          userId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();

        if (response.status === 400) {
          const errorMessage = data.error || ERROR_MESSAGES.INAPPROPRIATE_CONTENT;
          setError(errorMessage);
          setFlowState({ step: 'input' });

          logError(new ValidationError(errorMessage), {
            operation: 'SolutionPromptModal.handleCheckSimilar',
            userId,
            questionId,
            metadata: { status: response.status },
          });
          return;
        }

        if (response.status === 403) {
          const errorMessage = data.error || ERROR_MESSAGES.LIMIT_REACHED;
          setError(errorMessage);
          setFlowState({ step: 'input' });
          return;
        }

        throw new NetworkError(data.error || 'Failed to check for similar solutions');
      }

      const data: SimilarCheckResponse = await response.json();

      // Store generated title/description for later use
      if (data.generatedTitle || data.generatedDescription) {
        setGeneratedTitleDesc({
          title: data.generatedTitle,
          description: data.generatedDescription,
        });
      }

      if (data.similarStatements && data.similarStatements.length > 0) {
        setFlowState({ step: 'similar', data });
      } else {
        // No similar solutions, proceed to submit with generated title/description
        await handleSelectSolution(null, text, data.generatedTitle, data.generatedDescription);
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

  // Step 2: Submit solution (new or existing)
  const handleSelectSolution = async (
    statementId: string | null,
    solutionText?: string,
    genTitle?: string,
    genDescription?: string
  ) => {
    const textToSubmit = solutionText || text;
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

  const handleBack = () => {
    setFlowState({ step: 'input' });
    setError(null);
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
    <Modal isOpen={isOpen} onClose={handleClose} title={flowState.step === 'input' ? title : undefined}>
      <div className={styles.content}>
        {flowState.step === 'input' && (
          <>
            <p className={styles.description}>{description}</p>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your solution here..."
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
                <span className={styles.hint}> (minimum {VALIDATION.MIN_SOLUTION_LENGTH} characters)</span>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button
                className={styles.cancelButton}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleCheckSimilar}
                disabled={!isValid}
              >
                Submit
              </button>
            </div>
          </>
        )}

        {flowState.step === 'submitting' && (
          <div className={styles.loaderContainer}>
            <EnhancedLoader />
          </div>
        )}

        {flowState.step === 'similar' && (
          <SimilarSolutions
            userSuggestion={text}
            similarSolutions={flowState.data.similarStatements}
            onSelect={handleSelectSolution}
            onBack={handleBack}
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
