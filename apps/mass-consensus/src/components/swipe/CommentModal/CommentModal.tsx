'use client';

/**
 * CommentModal Component
 * Bottom sheet modal for submitting comments on suggestion cards.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@freedi/shared-i18n/next';
import clsx from 'clsx';
import { COMMENT } from '@/constants/common';

export interface CommentModalProps {
	isOpen: boolean;
	onClose: () => void;
	suggestionText: string;
	// Kept for backward compatibility with callers; no longer used.
	questionText?: string;
	onSubmit: (originalText: string, rewrittenText: string) => Promise<void>;
}

const CommentModal: React.FC<CommentModalProps> = ({
	isOpen,
	onClose,
	suggestionText,
	onSubmit,
}) => {
	const { t } = useTranslation();
	const [commentText, setCommentText] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const modalRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const charCount = commentText.length;
	const isValid = charCount >= COMMENT.MIN_LENGTH && charCount <= COMMENT.MAX_LENGTH;
	const isNearMax = charCount > COMMENT.MAX_LENGTH * 0.9;
	const isOverMax = charCount > COMMENT.MAX_LENGTH;

	const handleClose = useCallback(() => {
		setCommentText('');
		setIsSubmitting(false);
		onClose();
	}, [onClose]);

	// Focus input when modal opens
	useEffect(() => {
		if (isOpen && inputRef.current) {
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
				handleClose();
			}
		};

		document.addEventListener('keydown', handleEscape);

		return () => document.removeEventListener('keydown', handleEscape);
	}, [isOpen, isSubmitting, handleClose]);

	// Focus trap
	useEffect(() => {
		if (!isOpen) return;
		const modal = modalRef.current;
		if (!modal) return;

		const focusableElements = modal.querySelectorAll(
			'button, textarea, [tabindex]:not([tabindex="-1"])',
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

	const handleSubmit = async () => {
		if (!isValid) return;

		setIsSubmitting(true);
		try {
			const trimmed = commentText.trim();
			// AI rewrite disabled — submit original text as-is for both fields.
			await onSubmit(trimmed, trimmed);
			handleClose();
		} catch {
			// Error handled by parent
			setIsSubmitting(false);
		}
	};

	const handleBackdropClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget && !isSubmitting) {
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
						disabled={isSubmitting}
						aria-label={t('Close')}
					>
						&times;
					</button>
				</div>

				{/* Quoted suggestion */}
				<div className="comment-modal__quote" dir="auto">
					{suggestionText}
				</div>

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
					disabled={isSubmitting}
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
						disabled={isSubmitting}
					>
						{t('Cancel')}
					</button>
					<button
						type="button"
						className="comment-modal__button comment-modal__button--primary"
						onClick={handleSubmit}
						disabled={!isValid || isSubmitting}
					>
						{isSubmitting ? t('Submitting...') : t('Submit')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default CommentModal;
