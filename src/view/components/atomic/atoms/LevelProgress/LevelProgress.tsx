import React from 'react';
import clsx from 'clsx';

/**
 * LevelProgress Atom - Atomic Design System
 *
 * Progress bar showing progress toward the next engagement level.
 * All styling in src/view/style/atoms/_level-badge.scss
 */

export interface LevelProgressProps {
	/** Progress percentage (0-100) */
	progress: number;

	/** Current credits */
	currentCredits: number;

	/** Credits needed for next level */
	nextThreshold: number;

	/** Thick variant */
	thick?: boolean;

	/** Show label text */
	showLabel?: boolean;

	/** Additional CSS classes */
	className?: string;
}

const LevelProgress: React.FC<LevelProgressProps> = ({
	progress,
	currentCredits,
	nextThreshold,
	thick = false,
	showLabel = true,
	className,
}) => {
	const clampedProgress = Math.max(0, Math.min(100, progress));

	const classes = clsx(
		'level-progress',
		thick && 'level-progress--thick',
		className,
	);

	return (
		<div className={classes} role="progressbar" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100} aria-label={`Level progress: ${clampedProgress}% complete, ${currentCredits} of ${nextThreshold} credits`}>
			<div className="level-progress__bar">
				<div
					className="level-progress__fill"
					style={{ width: `${clampedProgress}%` }}
				/>
			</div>
			{showLabel && nextThreshold !== Infinity && (
				<div className="level-progress__label">
					<span>{currentCredits} credits</span>
					<span>{nextThreshold} needed</span>
				</div>
			)}
		</div>
	);
};

export default LevelProgress;
