import React from 'react';
import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * WalletBalance Atom - Atomic Design System
 *
 * Displays wallet balance with color-coded status.
 * All styling is handled by SCSS in src/view/style/atoms/_wallet-balance.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type WalletBalanceStatus = 'high' | 'medium' | 'low';
export type WalletBalanceSize = 'small' | 'medium' | 'large';

export interface WalletBalanceProps {
	/** Current balance in minutes */
	balance: number;

	/** Size variant */
	size?: WalletBalanceSize;

	/** Show compact (icon + number only) or full (with "minutes" label) */
	compact?: boolean;

	/** Show as pill with background */
	pill?: boolean;

	/** Show animation on value change */
	animated?: boolean;

	/** Whether the value is currently changing (for animation) */
	changing?: boolean;

	/** Hide the icon */
	hideIcon?: boolean;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get status color based on balance
 * High: > 10 minutes (green)
 * Medium: 1-10 minutes (orange)
 * Low: 0 minutes (red)
 */
function getBalanceStatus(balance: number): WalletBalanceStatus {
	if (balance > 10) return 'high';
	if (balance > 0) return 'medium';

	return 'low';
}

// ============================================================================
// COMPONENT
// ============================================================================

const WalletBalance: React.FC<WalletBalanceProps> = ({
	balance,
	size = 'medium',
	compact = false,
	pill = false,
	animated = false,
	changing = false,
	hideIcon = false,
	className,
}) => {
	const { t } = useTranslation();
	const status = getBalanceStatus(balance);

	// Build BEM classes
	const classes = clsx(
		'wallet-balance',
		`wallet-balance--${status}`,
		size !== 'medium' && `wallet-balance--${size}`,
		compact && 'wallet-balance--compact',
		!compact && 'wallet-balance--full',
		pill && 'wallet-balance--pill',
		animated && 'wallet-balance--animated',
		changing && 'wallet-balance--changing',
		className
	);

	// Format balance for display
	const displayBalance = Number.isFinite(balance) ? Math.round(balance * 10) / 10 : 0;

	return (
		<span className={classes} role="status" aria-live="polite">
			<span className="wallet-balance__sr-label">
				{t('walletBalance')}: {displayBalance} {t('minutes')}
			</span>

			{!hideIcon && (
				<span className="wallet-balance__icon" aria-hidden="true">
					<Clock />
				</span>
			)}

			<span className="wallet-balance__value">{displayBalance}</span>

			{!compact && (
				<span className="wallet-balance__unit">{t('min')}</span>
			)}
		</span>
	);
};

export default WalletBalance;
