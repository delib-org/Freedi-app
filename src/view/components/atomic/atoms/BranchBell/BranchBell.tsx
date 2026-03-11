import React, { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import BellIcon from '@/assets/icons/bellIcon.svg?react';
import BellSlashIcon from '@/assets/icons/bellSlashIcon.svg?react';
import { NotificationFrequency } from '@freedi/shared-types';
import FrequencySelector from '../../molecules/FrequencySelector/FrequencySelector';

/**
 * BranchBell Atom - Atomic Design System
 *
 * A bell icon button with 5 states: unsubscribed, instant, daily, weekly, muted.
 * Clicking opens a FrequencySelector popover.
 * All styling in src/view/style/atoms/_branch-bell.scss
 */

export type BranchBellState = 'unsubscribed' | 'instant' | 'daily' | 'weekly' | 'muted';

export interface BranchBellProps {
	/** Current notification frequency state */
	state: BranchBellState;

	/** Size variant */
	size?: 'small' | 'medium' | 'large';

	/** Disabled state */
	disabled?: boolean;

	/** Called when frequency changes */
	onFrequencyChange: (frequency: NotificationFrequency) => void;

	/** Additional CSS classes */
	className?: string;

	/** ARIA label */
	ariaLabel?: string;
}

function frequencyToState(freq: NotificationFrequency): BranchBellState {
	switch (freq) {
		case NotificationFrequency.INSTANT:
			return 'instant';
		case NotificationFrequency.DAILY:
			return 'daily';
		case NotificationFrequency.WEEKLY:
			return 'weekly';
		case NotificationFrequency.NONE:
			return 'muted';
		default:
			return 'unsubscribed';
	}
}

function stateToFrequency(state: BranchBellState): NotificationFrequency {
	switch (state) {
		case 'instant':
			return NotificationFrequency.INSTANT;
		case 'daily':
			return NotificationFrequency.DAILY;
		case 'weekly':
			return NotificationFrequency.WEEKLY;
		case 'muted':
			return NotificationFrequency.NONE;
		default:
			return NotificationFrequency.NONE;
	}
}

const BranchBell: React.FC<BranchBellProps> = ({
	state,
	size = 'medium',
	disabled = false,
	onFrequencyChange,
	className,
	ariaLabel,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const bellClasses = clsx(
		'branch-bell',
		`branch-bell--${state}`,
		size !== 'medium' && `branch-bell--${size}`,
		disabled && 'branch-bell--disabled',
		className,
	);

	const showDot = state === 'instant' || state === 'daily' || state === 'weekly';
	const isMuted = state === 'muted';

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (!disabled) {
				setIsOpen((prev) => !prev);
			}
		},
		[disabled],
	);

	const handleSelect = useCallback(
		(frequency: NotificationFrequency) => {
			onFrequencyChange(frequency);
			setIsOpen(false);
		},
		[onFrequencyChange],
	);

	const handleClose = useCallback(() => {
		setIsOpen(false);
	}, []);

	return (
		<div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
			<button
				type="button"
				className={bellClasses}
				onClick={handleClick}
				disabled={disabled}
				aria-label={ariaLabel || `Notification settings: ${state}`}
				aria-expanded={isOpen}
				aria-haspopup="true"
			>
				<span className="branch-bell__icon">
					{isMuted ? <BellSlashIcon /> : <BellIcon />}
				</span>
				{showDot && <span className="branch-bell__dot" />}
			</button>

			{isOpen && (
				<FrequencySelector
					currentFrequency={stateToFrequency(state)}
					onSelect={handleSelect}
					onClose={handleClose}
				/>
			)}
		</div>
	);
};

export default BranchBell;
export { frequencyToState, stateToFrequency };
