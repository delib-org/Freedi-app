'use client';

import React, { useEffect } from 'react';
import { useToastStore, Toast } from '@/store/toastStore';
import styles from './versionControl.module.scss';

/**
 * Toast Notification Component
 * Displays toast notifications from the toast store
 * Auto-dismisses after duration
 */
export function ToastNotification() {
	const { toasts, removeToast } = useToastStore();

	if (toasts.length === 0) return null;

	return (
		<div className={styles['toast-container']}>
			{toasts.map((toast) => (
				<ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
			))}
		</div>
	);
}

interface ToastItemProps {
	toast: Toast;
	onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
	useEffect(() => {
		// Auto-dismiss is handled by the store, but we can add animation here
		if (toast.duration && toast.duration > 0) {
			const timer = setTimeout(() => {
				// Add fade-out class before removal
				const element = document.getElementById(`toast-${toast.id}`);
				if (element) {
					element.classList.add(styles['toast--fade-out']);
				}
			}, toast.duration - 300); // Start fade 300ms before removal

			return () => clearTimeout(timer);
		}
	}, [toast.duration, toast.id]);

	const getTypeClass = () => {
		switch (toast.type) {
			case 'success':
				return styles['toast--success'];
			case 'error':
				return styles['toast--error'];
			case 'info':
				return styles['toast--info'];
			default:
				return '';
		}
	};

	const getIcon = () => {
		switch (toast.type) {
			case 'success':
				return '✓';
			case 'error':
				return '✕';
			case 'info':
				return 'ℹ';
			default:
				return '';
		}
	};

	return (
		<div
			id={`toast-${toast.id}`}
			className={`${styles['toast']} ${getTypeClass()}`}
			role="alert"
			aria-live="polite"
		>
			<div className={styles['toast__icon']}>{getIcon()}</div>
			<div className={styles['toast__message']}>{toast.message}</div>
			<button
				onClick={() => onDismiss(toast.id)}
				className={styles['toast__close']}
				aria-label="Dismiss notification"
			>
				×
			</button>
		</div>
	);
}
