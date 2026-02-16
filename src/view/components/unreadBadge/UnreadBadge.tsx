import { FC } from 'react';
import styles from './UnreadBadge.module.scss';

interface UnreadBadgeProps {
	count: number;
	maxDisplay?: number;
	size?: 'small' | 'medium' | 'large';
	position?: 'absolute' | 'relative';
	ariaLabel?: string;
}

/**
 * UnreadBadge - A reusable badge component for displaying unread counts
 *
 * @param count - The number of unread items to display
 * @param maxDisplay - Maximum number to display before showing "X+" (default: 9)
 * @param size - Size variant: 'small', 'medium', or 'large' (default: 'medium')
 * @param position - CSS position: 'absolute' or 'relative' (default: 'relative')
 * @param ariaLabel - Accessible label for screen readers
 *
 * @example
 * // Basic usage
 * <UnreadBadge count={5} />
 *
 * @example
 * // With custom max display
 * <UnreadBadge count={15} maxDisplay={10} /> // Shows "10+"
 *
 * @example
 * // Absolutely positioned (e.g., on top of an icon)
 * <div style={{ position: 'relative' }}>
 *   <NotificationIcon />
 *   <UnreadBadge count={3} position="absolute" />
 * </div>
 */
const UnreadBadge: FC<UnreadBadgeProps> = ({
	count,
	maxDisplay = 9,
	size = 'medium',
	position = 'relative',
	ariaLabel,
}) => {
	// Don't render if count is 0 or negative
	if (count <= 0) return null;

	const displayText = count > maxDisplay ? `${maxDisplay}+` : count.toString();
	const accessibleLabel =
		ariaLabel || `${count} unread ${count === 1 ? 'notification' : 'notifications'}`;

	return (
		<div
			className={`${styles.badge} ${styles[`badge--${size}`]} ${styles[`badge--${position}`]}`}
			role="status"
			aria-label={accessibleLabel}
			aria-live="polite"
		>
			{displayText}
		</div>
	);
};

export default UnreadBadge;
