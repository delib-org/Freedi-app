import React from 'react';
import clsx from 'clsx';
import { Wallet } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * WalletDisplay Molecule - Atomic Design System
 *
 * Compact wallet display pill for header/navigation.
 * All styling is handled by SCSS in src/view/style/molecules/_wallet-display.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type WalletDisplayStatus = 'high' | 'medium' | 'low';
export type WalletDisplaySize = 'small' | 'medium' | 'large';

export interface WalletDisplayProps {
	/** Current balance in minutes */
	balance: number;

	/** Size variant */
	size?: WalletDisplaySize;

	/** Show compact (no label) or full */
	compact?: boolean;

	/** Show without border */
	noBorder?: boolean;

	/** Recent change amount (positive or negative) */
	recentChange?: number;

	/** Loading state */
	loading?: boolean;

	/** Disabled state */
	disabled?: boolean;

	/** Click handler (navigate to history) */
	onClick?: () => void;

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
function getBalanceStatus(balance: number): WalletDisplayStatus {
	if (balance > 10) return 'high';
	if (balance > 0) return 'medium';

	return 'low';
}

// ============================================================================
// COMPONENT
// ============================================================================

const WalletDisplay: React.FC<WalletDisplayProps> = ({
	balance,
	size = 'medium',
	compact = false,
	noBorder = false,
	recentChange,
	loading = false,
	disabled = false,
	onClick,
	className,
}) => {
	const { t } = useTranslation();
	const status = getBalanceStatus(balance);

	// Build BEM classes
	const classes = clsx(
		'wallet-display',
		`wallet-display--${status}`,
		size !== 'medium' && `wallet-display--${size}`,
		compact && 'wallet-display--compact',
		!compact && 'wallet-display--full',
		noBorder && 'wallet-display--no-border',
		loading && 'wallet-display--loading',
		disabled && 'wallet-display--disabled',
		recentChange && 'wallet-display--animating',
		className
	);

	// Format balance for display
	const displayBalance = Number.isFinite(balance) ? Math.round(balance * 10) / 10 : 0;

	// Format change for display
	const changePositive = recentChange && recentChange > 0;
	const changeNegative = recentChange && recentChange < 0;
	const displayChange = recentChange
		? `${recentChange > 0 ? '+' : ''}${Math.round(recentChange * 10) / 10}`
		: null;

	const handleClick = (): void => {
		if (onClick && !loading && !disabled) {
			onClick();
		}
	};

	const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (onClick && !loading && !disabled) {
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				onClick();
			}
		}
	};

	return (
		<div
			className={classes}
			onClick={handleClick}
			onKeyPress={handleKeyPress}
			role={onClick ? 'button' : 'status'}
			tabIndex={onClick ? 0 : undefined}
			aria-label={`${t('walletBalance')}: ${displayBalance} ${t('minutes')}`}
			aria-disabled={disabled}
		>
			<span className="wallet-display__icon" aria-hidden="true">
				<Wallet />
			</span>

			<span className="wallet-display__value">{displayBalance}</span>

			{!compact && <span className="wallet-display__label">{t('min')}</span>}

			{displayChange && (
				<span
					className={clsx(
						'wallet-display__change',
						changePositive && 'wallet-display__change--positive',
						changeNegative && 'wallet-display__change--negative'
					)}
				>
					{displayChange}
				</span>
			)}
		</div>
	);
};

export default WalletDisplay;
