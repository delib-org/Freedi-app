'use client';

import Modal from '@/components/shared/Modal';
import styles from './SolutionPromptModal.module.css';

interface SolutionPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScrollToAdd: () => void;
}

export default function SolutionPromptModal({
  isOpen,
  onClose,
  onScrollToAdd,
}: SolutionPromptModalProps) {
  const handleAddSolution = () => {
    onClose();
    onScrollToAdd();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Your Solution First">
      <div className={styles.content}>
        <div className={styles.icon}>💡</div>
        <p className={styles.message}>
          Please submit your own solution before evaluating others.
        </p>
        <p className={styles.description}>
          This helps ensure everyone contributes their ideas to the discussion.
        </p>
        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={onClose}>
            Skip for now
          </button>
          <button className={styles.primaryButton} onClick={handleAddSolution}>
            Add My Solution
          </button>
        </div>
      </div>
    </Modal>
  );
}
