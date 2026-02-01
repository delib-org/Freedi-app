/**
 * Toast Notification Store (Zustand)
 * Simple toast notifications for success/error messages
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration?: number;
}

interface ToastStore {
	toasts: Toast[];
	addToast: (message: string, type: ToastType, duration?: number) => void;
	removeToast: (id: string) => void;
	clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
	toasts: [],

	addToast: (message: string, type: ToastType = 'info', duration = 5000) => {
		const id = `toast_${Date.now()}_${Math.random()}`;
		const toast: Toast = { id, message, type, duration };

		set((state) => ({
			toasts: [...state.toasts, toast],
		}));

		// Auto-remove after duration
		if (duration > 0) {
			setTimeout(() => {
				set((state) => ({
					toasts: state.toasts.filter((t) => t.id !== id),
				}));
			}, duration);
		}
	},

	removeToast: (id: string) => {
		set((state) => ({
			toasts: state.toasts.filter((t) => t.id !== id),
		}));
	},

	clearAll: () => {
		set({ toasts: [] });
	},
}));
