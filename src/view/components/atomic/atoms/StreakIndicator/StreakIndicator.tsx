import React from 'react';
import clsx from 'clsx';
import { isStreakAtRisk } from '@freedi/engagement-core';

/**
 * StreakIndicator Atom - Atomic Design System
 *
 * Displays the user's current streak with a flame icon.
 * All styling in src/view/style/atoms/_level-badge.scss
 */

export interface StreakIndicatorProps {
	/** Current streak count */
	count: number;

	/** Last active date (YYYY-MM-DD) for at-risk detection */
	lastActiveDate?: string;

	/** Additional CSS classes */
	className?: string;
}

const StreakIndicator: React.FC<StreakIndicatorProps> = ({
	count,
	lastActiveDate,
	className,
}) => {
	if (count <= 0) return null;

	const atRisk = lastActiveDate ? isStreakAtRisk(lastActiveDate) : false;

	const classes = clsx(
		'streak-indicator',
		atRisk && 'streak-indicator--at-risk',
		className,
	);

	return (
		<span className={classes} aria-label={`${count} day streak${atRisk ? ' (at risk!)' : ''}`}>
			<span className="streak-indicator__flame" aria-hidden="true">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
					<path d="M12 23c-4.97 0-9-3.58-9-8 0-3.07 2.1-5.8 3.38-7.17.43-.46 1.18-.14 1.15.49-.06 1.27.37 2.58 1.47 3.68.18.18.49.04.46-.21-.2-1.7.45-4.12 2.02-5.87.43-.48 1.2-.2 1.2.43 0 1.94 1.2 3.66 2.5 4.72.4.32.58-.13.56-.39-.06-.75.07-1.71.5-2.68.24-.54.96-.57 1.23-.04C18.73 11.2 21 13.73 21 15c0 4.42-4.03 8-9 8Z" />
				</svg>
			</span>
			<span className="streak-indicator__count">{count}</span>
		</span>
	);
};

export default StreakIndicator;
