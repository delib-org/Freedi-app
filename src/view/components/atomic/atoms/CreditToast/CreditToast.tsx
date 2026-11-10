import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatCreditsEarned } from '@/helpers/engagementLabels';

/** Matches the creditFloat animation in _level-badge.scss */
const TOAST_DURATION_MS = 1500;

/**
 * CreditToast Atom - Atomic Design System
 *
 * Floating "+X credits" animation near the action point.
 * All styling in src/view/style/atoms/_level-badge.scss
 */

export interface CreditToastProps {
	/** Amount of credits earned */
	amount: number;

	/** Called when animation completes */
	onComplete?: () => void;
}

const CreditToast: React.FC<CreditToastProps> = ({ amount, onComplete }) => {
	const { t } = useTranslation();
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const timer = setTimeout(() => {
			setVisible(false);
			onComplete?.();
		}, TOAST_DURATION_MS);

		return () => clearTimeout(timer);
	}, [onComplete]);

	if (!visible || amount <= 0) return null;

	return (
		<span className="credit-toast" role="status" aria-live="polite">
			{formatCreditsEarned(t, amount)}
		</span>
	);
};

export default CreditToast;
