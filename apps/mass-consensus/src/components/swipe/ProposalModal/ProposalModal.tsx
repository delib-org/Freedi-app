/**
 * ProposalModal Component
 * Modal for users to submit new proposal ideas
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { VALIDATION } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';
import EnhancedLoader from '@/components/question/EnhancedLoader';

export interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (proposalText: string) => Promise<void>;
  className?: string;
}

const ProposalModal: React.FC<ProposalModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  className,
}) => {
  const { t } = useTranslation();
  const [proposalText, setProposalText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Character count and validation
  const charCount = proposalText.length;
  const minLength = VALIDATION.MIN_STATEMENT_LENGTH;
  const maxLength = VALIDATION.MAX_STATEMENT_LENGTH;
  const isValid = charCount >= minLength && charCount <= maxLength;
  const isNearMax = charCount > maxLength * 0.9;
  const isOverMax = charCount > maxLength;

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Delay focus slightly for smoother animation
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose]);

  // Trap focus within modal
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
  }, [isOpen]);

  // Prevent body scroll when modal is open
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

  const handleSubmit = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(proposalText.trim());
      setProposalText('');
      onClose();
    } catch (error) {
      // Error is handled by parent component
      logError(error, { operation: 'ProposalModal.handleSubmit' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={clsx('proposal-modal', className)}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-modal-title"
    >
      {isSubmitting ? (
        <EnhancedLoader onCancel={() => setIsSubmitting(false)} />
      ) : (
        <div className="proposal-modal__content" ref={modalRef}>
          <div className="proposal-modal__header">
            <h2 id="proposal-modal-title" className="proposal-modal__title">
              {t('Share Your Idea')}
            </h2>
            <button
              type="button"
              className="proposal-modal__close"
              onClick={onClose}
              aria-label={t('Close')}
            >
              ×
            </button>
          </div>

          <p className="proposal-modal__description">
            {t('Have a suggestion to improve this topic? Share your idea with the community!')}
          </p>

          <textarea
            ref={inputRef}
            className="proposal-modal__input"
            value={proposalText}
            onChange={(e) => setProposalText(e.target.value)}
            placeholder={t('Type your proposal here...')}
            maxLength={maxLength}
            aria-label={t('Proposal text')}
            aria-describedby="char-count"
          />

          <div
            id="char-count"
            className={clsx('proposal-modal__char-count', {
              'proposal-modal__char-count--warning': isNearMax && !isOverMax,
              'proposal-modal__char-count--error': isOverMax,
            })}
          >
            {charCount} / {maxLength} {t('characters')}
          </div>

          <div className="proposal-modal__actions">
            <button
              type="button"
              className="proposal-modal__button proposal-modal__button--secondary"
              onClick={onClose}
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              className="proposal-modal__button proposal-modal__button--primary"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {t('Submit Proposal')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProposalModal;
