'use client';

/**
 * CommentModal Component
 * Bottom sheet modal for submitting comments on suggestion cards.
 * Three-state flow: Input -> AI Loading -> Review
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { COMMENT } from '@/constants/common';

type ModalState = 'input' | 'loading' | 'review';

export interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  suggestionText: string;
  questionText: string;
  onSubmit: (originalText: string, rewrittenText: string) => Promise<void>;
}

const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  suggestionText,
  questionText,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [commentText, setCommentText] = useState('');
  const [modalState, setModalState] = useState<ModalState>('input');
  const [rewrittenText, setRewrittenText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const charCount = commentText.length;
  const isValid = charCount >= COMMENT.MIN_LENGTH && charCount <= COMMENT.MAX_LENGTH;
  const isNearMax = charCount > COMMENT.MAX_LENGTH * 0.9;
  const isOverMax = charCount > COMMENT.MAX_LENGTH;

  const handleClose = useCallback(() => {
    setCommentText('');
    setRewrittenText('');
    setModalState('input');
    setIsSubmitting(false);
    onClose();
  }, [onClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current && modalState === 'input') {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isOpen, modalState]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting && modalState !== 'loading') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, modalState, handleClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen) return;
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    modal.addEventListener('keydown', handleTab as EventListener);

    return () => modal.removeEventListener('keydown', handleTab as EventListener);
  }, [isOpen, modalState]);

  // Body scroll lock
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSendForRewrite = async () => {
    if (!isValid) return;

    setModalState('loading');

    try {
      const response = await fetch('/api/ai/rewrite-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: commentText.trim(),
          suggestionText,
          questionText,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRewrittenText(data.rewrittenText || commentText.trim());
      } else {
        // Fallback: use original text
        setRewrittenText(commentText.trim());
      }

      setModalState('review');
    } catch {
      // Fallback: skip rewrite, use original text
      setRewrittenText(commentText.trim());
      setModalState('review');
    }
  };

  const handleAcceptRewrite = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(commentText.trim(), rewrittenText);
      handleClose();
    } catch {
      // Error handled by parent
      setIsSubmitting(false);
    }
  };

  const handleSubmitOriginal = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(commentText.trim(), commentText.trim());
      handleClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    setModalState('input');
    setRewrittenText('');
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting && modalState !== 'loading') {
      handleClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="comment-modal"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="comment-modal-title"
    >
      <div className="comment-modal__content" ref={modalRef}>
        <div className="comment-modal__header">
          <h2 id="comment-modal-title" className="comment-modal__title">
            {t('Add comment')}
          </h2>
          <button
            type="button"
            className="comment-modal__close"
            onClick={handleClose}
            disabled={isSubmitting || modalState === 'loading'}
            aria-label={t('Close')}
          >
            &times;
          </button>
        </div>

        {/* Quoted suggestion */}
        <div className="comment-modal__quote" dir="auto">
          {suggestionText}
        </div>

        {/* Input state */}
        {modalState === 'input' && (
          <>
            <textarea
              ref={inputRef}
              className="comment-modal__input"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t('Share your thoughts...')}
              maxLength={COMMENT.MAX_LENGTH}
              dir="auto"
              aria-label={t('Comment text')}
              aria-describedby="comment-char-count"
            />

            <div
              id="comment-char-count"
              className={clsx('comment-modal__char-count', {
                'comment-modal__char-count--warning': isNearMax && !isOverMax,
                'comment-modal__char-count--error': isOverMax,
              })}
            >
              {charCount} / {COMMENT.MAX_LENGTH}
            </div>

            <div className="comment-modal__actions">
              <button
                type="button"
                className="comment-modal__button comment-modal__button--secondary"
                onClick={handleClose}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                className="comment-modal__button comment-modal__button--primary"
                onClick={handleSendForRewrite}
                disabled={!isValid}
              >
                {t('Submit')}
              </button>
            </div>
          </>
        )}

        {/* Loading state */}
        {modalState === 'loading' && (
          <div className="comment-modal__loading">
            <div className="comment-modal__spinner" />
            <p className="comment-modal__loading-text">
              {t('Rewriting your comment...')}
            </p>
          </div>
        )}

        {/* Review state */}
        {modalState === 'review' && (
          <div className="comment-modal__review">
            <div className="comment-modal__review-section">
              <div className="comment-modal__review-label">{t('Your original comment')}</div>
              <p className="comment-modal__review-text" dir="auto">{commentText.trim()}</p>
            </div>

            {rewrittenText !== commentText.trim() && (
              <div className="comment-modal__review-section comment-modal__review-rewritten">
                <div className="comment-modal__review-label">{t('Constructive version')}</div>
                <p className="comment-modal__review-text" dir="auto">{rewrittenText}</p>
              </div>
            )}

            <div className="comment-modal__actions">
              <button
                type="button"
                className="comment-modal__button comment-modal__button--secondary"
                onClick={handleEdit}
                disabled={isSubmitting}
              >
                {t('Edit')}
              </button>
              {rewrittenText !== commentText.trim() && (
                <button
                  type="button"
                  className="comment-modal__button comment-modal__button--outline"
                  onClick={handleSubmitOriginal}
                  disabled={isSubmitting}
                >
                  {t('Submit Original')}
                </button>
              )}
              <button
                type="button"
                className="comment-modal__button comment-modal__button--primary"
                onClick={handleAcceptRewrite}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('Submitting...') : t('Accept')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentModal;
