'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/shared/Modal';
import { VALIDATION } from '@/constants/common';
import { countWords } from '@/lib/utils/wordCount';
import { moderationMessageKey } from '@/lib/utils/moderationMessage';
import { useTranslation } from '@freedi/shared-i18n/next';
import { logError, NetworkError, ValidationError } from '@/lib/utils/errorHandling';
import { ERROR_MESSAGES } from '@/constants/common';
import type {
  FlowState,
  SimilarCheckResponse,
  MultiSuggestionResponse,
  SplitSuggestion,
  DetectedSuggestion,
  PieceSimilarity,
  PrepareSuggestionResponse,
} from '@/types/api';
import { SuggestionMode } from '@freedi/shared-types';
import { submitRating } from '@/controllers/swipeController';
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
  /** Additional description/context for the question (from paragraphs) */
  questionDescription?: string;
  /** Controls UX friction when adding new suggestions vs merging */
  suggestionMode?: SuggestionMode;
  /** Optional per-question minimum word count. Undefined/<=0 means no minimum. */
  minWords?: number;
  /** When true, shows "Add your answer later" instead of "Cancel" */
  requiresSolution?: boolean;
  hasCheckedUserSolutions?: boolean;
  userName?: string;
  /** Survey session id, so the author's +1 after an automatic merge carries its demographic anchor */
  surveyId?: string;
  /**
   * When the AI detects several answers in one submission, submit them as
   * separate suggestions without showing the "split?" preview.
   */
  autoSplitMultiSuggestions?: boolean;
  /**
   * When a similar suggestion already exists, merge into the closest one
   * without showing the "merge or add new?" screen, then record the author's
   * +1 on the merged suggestion.
   */
  autoMergeSimilar?: boolean;
}

/** The server refused the text (moderation, limit); the user has already been told. */
class PrepareRefused extends Error {}

interface PieceTarget {
  text: string;
  target: string | null;
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
  questionDescription,
  suggestionMode = SuggestionMode.encourage,
  minWords,
  requiresSolution = false,
  hasCheckedUserSolutions: _hasCheckedUserSolutions = false,
  userName,
  surveyId,
  autoSplitMultiSuggestions = false,
  autoMergeSimilar = false,
}: SolutionPromptModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [flowState, setFlowState] = useState<FlowState>({ step: 'input' });
  const [error, setError] = useState<string | null>(null);
  const [multiSuggestions, setMultiSuggestions] = useState<SplitSuggestion[]>([]);
  const [storedSimilarData, setStoredSimilarData] = useState<SimilarCheckResponse | null>(null);
  const [isFinalSubmit, setIsFinalSubmit] = useState(false);
  /**
   * Per split piece (keyed by SplitSuggestion id): the text the server saw and
   * the closest existing suggestion it found, or null for none. Lets auto-merge
   * submit pieces without another similarity round trip. A piece edited in the
   * preview no longer matches its `text` and is looked up again.
   */
  const [pieceTargets, setPieceTargets] = useState<Record<string, PieceTarget>>({});
  const [isQuestionExpanded, setIsQuestionExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const characterCount = text.length;
  const hasWordMinimum = typeof minWords === 'number' && minWords > 0;
  const wordCount = countWords(text);
  const meetsWordMinimum = !hasWordMinimum || wordCount >= (minWords as number);
  const isValid =
    characterCount >= VALIDATION.MIN_SOLUTION_LENGTH &&
    characterCount <= VALIDATION.MAX_SOLUTION_LENGTH &&
    meetsWordMinimum;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setText('');
      setFlowState({ step: 'input' });
      setError(null);
      setMultiSuggestions([]);
      setStoredSimilarData(null);
      setPieceTargets({});
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

  const pieceText = (piece: DetectedSuggestion): string => `${piece.title}: ${piece.description}`;

  /**
   * Act on what the server found: several answers in one submission, a
   * similar existing suggestion, or neither. Shared by the one-round-trip
   * prepare path and the older two-call path.
   */
  const applyAnalysis = async (
    multi: { isMultipleSuggestions: boolean; suggestions: DetectedSuggestion[] },
    similarData: SimilarCheckResponse,
    pieces?: PieceSimilarity[],
  ): Promise<void> => {
    if (multi.isMultipleSuggestions && multi.suggestions.length > 1) {
      const stamp = Date.now();
      const splitSuggestions: SplitSuggestion[] = multi.suggestions.map((s, i) => ({
        id: `suggestion-${i}-${stamp}`,
        title: s.title,
        description: s.description,
        originalText: s.originalText,
        isRemoved: false,
      }));

      const targets: Record<string, PieceTarget> = {};
      splitSuggestions.forEach((s, i) => {
        const piece = pieces?.[i];
        if (piece) {
          targets[s.id] = {
            text: pieceText(multi.suggestions[i]),
            target: piece.similarStatements[0]?.statementId ?? null,
          };
        }
      });
      setPieceTargets(targets);

      if (autoSplitMultiSuggestions) {
        // Admin chose automatic splitting: skip the preview entirely
        await handleConfirmMultiSuggestions(splitSuggestions, targets);
        return;
      }

      setMultiSuggestions(splitSuggestions);
      // Store similar data for later (after multi-preview)
      const hasSimilar = similarData.similarStatements?.length > 0;
      setStoredSimilarData(hasSimilar ? similarData : null);
      setFlowState({
        step: 'multi-preview',
        suggestions: splitSuggestions,
        originalText: text,
        similarData: hasSimilar ? similarData : undefined,
      });
      return;
    }

    if (similarData.similarStatements && similarData.similarStatements.length > 0) {
      if (autoMergeSimilar) {
        // Admin chose automatic merging: fold into the closest match and +1 it
        await handleAutoMerge(similarData.similarStatements[0].statementId, text);
      } else {
        setFlowState({ step: 'similar', data: similarData });
      }
    } else {
      // No similar solutions, proceed to submit
      await handleSelectSolution(null, text);
    }
  };

  /**
   * One round trip: moderation, split detection and similar suggestions
   * together. Returns null when the endpoint is not available (not deployed
   * yet, gateway error), so the caller can use the older two-call path.
   * Throws for a real refusal (moderation, limit reached), already reported.
   */
  const requestPrepare = async (): Promise<PrepareSuggestionResponse | null> => {
    const response = await fetch(`/api/statements/${questionId}/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput: text, userId, checkPieces: autoMergeSimilar }),
    });

    if (response.status === 400 || response.status === 403) {
      const data: PrepareSuggestionResponse = await response.json();
      const message =
        response.status === 400
          ? moderationMessageKey(data.category)
          : data.error || ERROR_MESSAGES.LIMIT_REACHED;
      setError(message);
      setFlowState({ step: 'input' });
      logError(new ValidationError(message), {
        operation: 'SolutionPromptModal.requestPrepare',
        userId,
        questionId,
        metadata: { status: response.status, category: data.category },
      });
      throw new PrepareRefused();
    }

    if (!response.ok) {
      logError(new NetworkError(`prepare returned ${response.status}`), {
        operation: 'SolutionPromptModal.requestPrepare.fallback',
        userId,
        questionId,
        metadata: { status: response.status },
      });

      return null;
    }

    const data: PrepareSuggestionResponse = await response.json();

    return data.ok ? data : null;
  };

  // Step 1: What does the server make of this text? One round trip when the
  // combined endpoint is up; the older two parallel calls otherwise.
  const handleCheckSimilar = async () => {
    if (!isValid) return;

    setFlowState({ step: 'submitting' });
    setError(null);

    try {
      const prepared = await requestPrepare();
      if (prepared) {
        console.info('✅ prepare result:', {
          isMultiple: prepared.multi.isMultipleSuggestions,
          pieces: prepared.multi.suggestions.length,
          similar: prepared.similar.similarStatements.length,
          responseTime: prepared.responseTime,
        });
        await applyAnalysis(
          prepared.multi,
          { ok: true, similarStatements: prepared.similar.similarStatements, userText: prepared.similar.userText },
          prepared.pieces,
        );

        return;
      }

      await handleCheckSimilarLegacy();
    } catch (err) {
      if (err instanceof PrepareRefused) return;
      logError(err, {
        operation: 'SolutionPromptModal.handleCheckSimilar',
        userId,
        questionId,
      });
      setError(err instanceof Error ? err.message : ERROR_MESSAGES.CHECK_SIMILAR_FAILED);
      setFlowState({ step: 'input' });
    }
  };

  // Older path: multi-detect and similar-check as two parallel calls
  const handleCheckSimilarLegacy = async () => {
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
          // Show a warm, category-based message in the user's UI language
          // (rendered via t()). The server's specific reason is kept for admins.
          const errorMessage = moderationMessageKey(data.category);
          setError(errorMessage);
          setFlowState({ step: 'input' });

          logError(new ValidationError(errorMessage), {
            operation: 'SolutionPromptModal.handleCheckSimilar',
            userId,
            questionId,
            metadata: { status: similarResponse.status, category: data.category },
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
          logError(parseError, {
            operation: 'SolutionPromptModal.handleCheckSimilar.parseMultiResponse',
            userId,
            questionId,
          });
        }
      } else if (multiResponse.status === 400) {
        // Content moderation blocked this input — do NOT allow submission
        const multiErrorData = await multiResponse.json().catch(() => ({ category: undefined }));
        const errorMessage = moderationMessageKey(multiErrorData.category);
        setError(errorMessage);
        setFlowState({ step: 'input' });

        return;
      } else {
        logError(new Error('Multi-suggestion detection failed'), {
          operation: 'SolutionPromptModal.handleCheckSimilar.multiDetection',
          userId,
          questionId,
          metadata: { status: multiResponse.status, statusText: multiResponse.statusText },
        });
      }

      await applyAnalysis(
        { isMultipleSuggestions: multiData.ok && multiData.isMultipleSuggestions, suggestions: multiData.suggestions },
        similarData,
        undefined,
      );
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleCheckSimilarLegacy',
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
  ) => {
    const textToSubmit = solutionText || text;
    setIsFinalSubmit(true);
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

  /**
   * Merge `solutionText` into an existing suggestion. Returns the id of the
   * suggestion that now carries the merged content.
   */
  const mergeInto = async (targetStatementId: string, solutionText: string): Promise<string> => {
    console.info('🔀 Merging solution into existing statement:', targetStatementId);

    const response = await fetch(`/api/statements/${questionId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetStatementId,
        solutionText,
        userId,
        userName,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new NetworkError(data.error || ERROR_MESSAGES.MERGE_FAILED);
    }

    const data: { statementId?: string } = await response.json();

    // Track successful merge
    trackSolutionSubmitted(questionId, userId, false); // false = merged, not created

    return data.statementId ?? targetStatementId;
  };

  /**
   * Automatic merge: fold the text into the closest existing suggestion and
   * record the author's +1 on it. The merge is the real outcome; a failed +1
   * is logged but does not undo it or block the participant.
   */
  const mergeAndAgree = async (targetStatementId: string, solutionText: string): Promise<void> => {
    const mergedStatementId = await mergeInto(targetStatementId, solutionText);

    try {
      await submitRating(questionId, mergedStatementId, 1, userId, userName, surveyId);
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.mergeAndAgree.rate',
        userId,
        statementId: mergedStatementId,
        metadata: { questionId },
      });
    }
  };

  /**
   * Find the closest existing suggestion for one piece of text, or null when
   * nothing is similar enough. Any failure counts as "nothing similar" so the
   * piece is still submitted as a new suggestion.
   */
  const findMergeTarget = async (solutionText: string): Promise<string | null> => {
    try {
      const response = await fetch(`/api/statements/${questionId}/check-similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: solutionText, userId }),
      });

      if (!response.ok) return null;

      const data: SimilarCheckResponse = await response.json();

      return data.similarStatements?.[0]?.statementId ?? null;
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.findMergeTarget',
        userId,
        metadata: { questionId },
      });

      return null;
    }
  };

  /** Create a brand-new suggestion (the author's +1 is written server-side). */
  const createSuggestion = async (solutionText: string): Promise<void> => {
    const response = await fetch(`/api/statements/${questionId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        solutionText,
        userId,
        existingStatementId: null,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new NetworkError(data.error || ERROR_MESSAGES.SUBMIT_FAILED);
    }

    const data = await response.json();
    trackSolutionSubmitted(questionId, userId, data.action === 'created');
  };

  /**
   * Submit one piece of a split submission: with auto-merge on, merge it into
   * a similar suggestion when one exists; otherwise create it.
   */
  const submitPiece = async (
    solutionText: string,
    precomputedTarget?: string | null,
  ): Promise<void> => {
    if (autoMergeSimilar) {
      const target =
        precomputedTarget !== undefined ? precomputedTarget : await findMergeTarget(solutionText);
      if (target) {
        await mergeAndAgree(target, solutionText);

        return;
      }
    }

    await createSuggestion(solutionText);
  };

  // Step 2b: Merge solution into existing statement (participant chose "merge")
  const handleMergeSolution = async (targetStatementId: string) => {
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    try {
      await mergeInto(targetStatementId, text);

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

  // Step 2c: Automatic merge (admin turned on autoMergeSimilar)
  const handleAutoMerge = async (targetStatementId: string, solutionText: string) => {
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    try {
      await mergeAndAgree(targetStatementId, solutionText);

      setFlowState({
        step: 'success',
        action: 'merged',
        solutionText,
      });
    } catch (err) {
      logError(err, {
        operation: 'SolutionPromptModal.handleAutoMerge',
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
  const handleConfirmMultiSuggestions = async (
    suggestions: SplitSuggestion[],
    targets: Record<string, PieceTarget> = pieceTargets,
  ) => {
    setIsFinalSubmit(true);
    setFlowState({ step: 'submitting' });

    try {
      // All pieces at once. A precomputed merge target is used only while the
      // piece still reads as the server saw it.
      await Promise.all(
        suggestions.map((suggestion) => {
          const solutionText = `${suggestion.title}: ${suggestion.description}`;
          const known = targets[suggestion.id];
          const precomputed = known && known.text === solutionText ? known.target : undefined;

          return submitPiece(solutionText, precomputed);
        }),
      );

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
      if (autoMergeSimilar) {
        await handleAutoMerge(storedSimilarData.similarStatements[0].statementId, text);
      } else {
        // Show similar solutions
        setFlowState({ step: 'similar', data: storedSimilarData });
      }
    } else {
      // Submit original directly
      await handleSelectSolution(null, text);
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
                {questionDescription && (
                  <p className={`${styles.questionDescription} ${isQuestionExpanded ? styles.questionTextExpanded : ''}`}>
                    <InlineMarkdown text={questionDescription} />
                  </p>
                )}
                {questionDescription && (
                  <button
                    type="button"
                    className={styles.expandButton}
                    aria-expanded={isQuestionExpanded}
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
              {hasWordMinimum && !meetsWordMinimum && (
                <span className={styles.hint}> ({t('minimum')} {minWords} {t('words')})</span>
              )}
            </div>

            {error && <p className={styles.error}>{t(error)}</p>}

            <div className={styles.actions}>
              <button
                className={styles.primaryButton}
                onClick={handleCheckSimilar}
                disabled={!isValid}
              >
                {t('Add Your Idea')}
              </button>
              <span className={styles.orSeparator}>— {t('or')} —</span>
              <button
                className={styles.cancelButton}
                onClick={handleClose}
              >
                {t('Skip for now')}
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
