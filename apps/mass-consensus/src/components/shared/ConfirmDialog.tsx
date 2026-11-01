'use client';

import Modal from './Modal';
import styles from './ConfirmDialog.module.scss';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation dialog (replaces window.confirm for destructive actions)
 */
export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <p className={styles['confirm-dialog__message']}>{message}</p>
      <div className={styles['confirm-dialog__actions']}>
        <button
          type="button"
          className={`${styles['confirm-dialog__button']} ${styles['confirm-dialog__button--cancel']}`}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`${styles['confirm-dialog__button']} ${styles['confirm-dialog__button--danger']}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
