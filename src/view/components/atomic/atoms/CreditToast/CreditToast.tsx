import React, { useEffect, useState } from 'react';

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
	const [visible, setVisible] = useState(true);

	useEffect(() => {
		const timer = setTimeout(() => {
			setVisible(false);
			onComplete?.();
		}, 1500);

		return () => clearTimeout(timer);
	}, [onComplete]);

	if (!visible || amount <= 0) return null;

	return (
		<span
			className="credit-toast"
			role="status"
			aria-live="polite"
			aria-label={`You earned ${amount} credits`}
		>
			+{amount}
		</span>
	);
};

export default CreditToast;
