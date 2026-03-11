import React, { useEffect, useRef, useCallback } from 'react';
import { NotificationFrequency } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * FrequencySelector Molecule - Atomic Design System
 *
 * A popover that lets users select notification frequency.
 * All styling in src/view/style/molecules/_frequency-selector.scss
 */

export interface FrequencySelectorProps {
	/** Currently selected frequency */
	currentFrequency: NotificationFrequency;

	/** Called when a frequency is selected */
	onSelect: (frequency: NotificationFrequency) => void;

	/** Called when the popover should close */
	onClose: () => void;

	/** Additional CSS classes */
	className?: string;
}

interface FrequencyOption {
	frequency: NotificationFrequency;
	labelKey: string;
	descriptionKey: string;
	fallbackLabel: string;
	fallbackDescription: string;
}

const FREQUENCY_OPTIONS: FrequencyOption[] = [
	{
		frequency: NotificationFrequency.INSTANT,
		labelKey: 'Instant',
		descriptionKey: 'Get notified immediately',
		fallbackLabel: 'Instant',
		fallbackDescription: 'Get notified immediately',
	},
	{
		frequency: NotificationFrequency.DAILY,
		labelKey: 'Daily digest',
		descriptionKey: 'Once a day summary',
		fallbackLabel: 'Daily digest',
		fallbackDescription: 'Once a day summary',
	},
	{
		frequency: NotificationFrequency.WEEKLY,
		labelKey: 'Weekly digest',
		descriptionKey: 'Once a week summary',
		fallbackLabel: 'Weekly digest',
		fallbackDescription: 'Once a week summary',
	},
	{
		frequency: NotificationFrequency.NONE,
		labelKey: 'Mute',
		descriptionKey: 'No notifications',
		fallbackLabel: 'Mute',
		fallbackDescription: 'No notifications',
	},
];

const FrequencySelector: React.FC<FrequencySelectorProps> = ({
	currentFrequency,
	onSelect,
	onClose,
	className,
}) => {
	const popoverRef = useRef<HTMLDivElement>(null);
	const { t } = useTranslation();

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		// Delay adding listener to avoid immediate close from the same click
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('keydown', handleEscape);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [onClose]);

	const handleSelect = useCallback(
		(frequency: NotificationFrequency) => {
			onSelect(frequency);
		},
		[onSelect],
	);

	return (
		<div
			ref={popoverRef}
			className={`frequency-popover ${className || ''}`}
			role="listbox"
			aria-label={t('Notification frequency') || 'Notification frequency'}
		>
			<div className="frequency-selector">
				<span className="frequency-selector__title">
					{t('Notifications') || 'Notifications'}
				</span>

				{FREQUENCY_OPTIONS.map((option) => {
					const isActive = currentFrequency === option.frequency;

					return (
						<button
							key={option.frequency}
							type="button"
							className={`frequency-selector__option ${isActive ? 'frequency-selector__option--active' : ''}`}
							onClick={() => handleSelect(option.frequency)}
							role="option"
							aria-selected={isActive}
						>
							<div className="frequency-selector__option-content">
								<span className="frequency-selector__label">
									{t(option.labelKey) || option.fallbackLabel}
								</span>
								<span className="frequency-selector__description">
									{t(option.descriptionKey) || option.fallbackDescription}
								</span>
							</div>

							<span className="frequency-selector__check" aria-hidden="true">
								{isActive && (
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								)}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
};

export default FrequencySelector;
