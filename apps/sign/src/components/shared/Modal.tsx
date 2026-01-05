'use client';

import { useEffect, useCallback } from 'react';
import styles from './Modal.module.scss';

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'small' | 'medium' | 'large';
  canMinimize?: boolean;
  onMinimize?: () => void;
  direction?: 'ltr' | 'rtl';
}

export default function Modal({
  title,
  onClose,
  children,
  size = 'medium',
  canMinimize = false,
  onMinimize,
  direction,
}: ModalProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // Close when clicking backdrop
  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div className={`${styles.modal} ${styles[size]}`} dir={direction} data-text-dir={direction}>
        {title && (
          <header className={styles.header}>
            <h2 id="modal-title" className={styles.title}>
              {title}
            </h2>
            <div className={styles.headerButtons}>
              {canMinimize && onMinimize && (
                <button
                  type="button"
                  className={styles.minimizeButton}
                  onClick={onMinimize}
                  aria-label="Minimize modal"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close modal"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </header>
        )}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
