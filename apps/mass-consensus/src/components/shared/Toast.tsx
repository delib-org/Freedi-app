'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { UI } from '@/constants/common';
import styles from './Toast.module.scss';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  removing?: boolean;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * Hook to access toast functionality
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

/**
 * Toast Provider Component
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    // Mark as removing for exit animation
    setToasts((prev) =>
      prev.map((toast) => (toast.id === id ? { ...toast, removing: true } : toast))
    );

    // Actually remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, UI.FORM_RESET_DELAY);
  }, []);

  const showToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random()}`;
      const duration = toast.duration || 5000;

      const newToast: Toast = {
        ...toast,
        id,
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto-remove after duration
      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * Toast Container Component
 */
function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles['toast-container']}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

/**
 * Individual Toast Item Component
 */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return 'ℹ';
    }
  };

  return (
    <div
      className={`${styles.toast} ${styles[`toast--${toast.type}`]} ${
        toast.removing ? styles['toast--removing'] : ''
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className={styles['toast__icon']}>{getIcon()}</div>
      <div className={styles['toast__content']}>
        {toast.title && <h4 className={styles['toast__title']}>{toast.title}</h4>}
        <p className={styles['toast__message']}>{toast.message}</p>
      </div>
      <button
        className={styles['toast__close']}
        onClick={() => onRemove(toast.id)}
        aria-label="Close notification"
        type="button"
      >
        ×
      </button>
    </div>
  );
}
