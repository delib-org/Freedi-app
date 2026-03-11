'use client';

import { useEffect, useState, useRef } from 'react';
import { useEngagementStore } from '@/store/engagementStore';
import type { CreditTransaction } from '@freedi/shared-types';
import styles from './CreditToast.module.scss';

const TOAST_DURATION_MS = 1500;
const EXIT_ANIMATION_MS = 300;

interface CreditToastItem {
	id: string;
	amount: number;
	exiting: boolean;
}

export default function CreditToast() {
	const recentCredits = useEngagementStore((state) => state.recentCredits);
	const [toasts, setToasts] = useState<CreditToastItem[]>([]);
	const lastSeenRef = useRef<string | null>(null);

	useEffect(() => {
		if (recentCredits.length === 0) return;

		const latest: CreditTransaction = recentCredits[0];
		const latestId = `${latest.userId}-${latest.createdAt}`;

		// Only show toast for genuinely new credits
		if (latestId === lastSeenRef.current) return;
		lastSeenRef.current = latestId;

		const toastId = `toast-${Date.now()}`;
		const newToast: CreditToastItem = {
			id: toastId,
			amount: latest.amount,
			exiting: false,
		};

		setToasts((prev) => [...prev, newToast]);

		// Begin exit animation
		const exitTimer = setTimeout(() => {
			setToasts((prev) =>
				prev.map((t) =>
					t.id === toastId ? { ...t, exiting: true } : t,
				),
			);
		}, TOAST_DURATION_MS);

		// Remove from DOM after exit animation completes
		const removeTimer = setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== toastId));
		}, TOAST_DURATION_MS + EXIT_ANIMATION_MS);

		return () => {
			clearTimeout(exitTimer);
			clearTimeout(removeTimer);
		};
	}, [recentCredits]);

	if (toasts.length === 0) return null;

	return (
		<div className={styles.container} aria-live="polite" aria-atomic="false">
			{toasts.map((toast) => {
				const classes = [
					styles.toast,
					toast.exiting ? styles.exiting : '',
				]
					.filter(Boolean)
					.join(' ');

				return (
					<div key={toast.id} className={classes}>
						+{toast.amount} credits
					</div>
				);
			})}
		</div>
	);
}
