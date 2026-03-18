import React, { useEffect, useRef, useCallback, useState } from 'react';
import { NotificationFrequency } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * FrequencySelector Molecule - Atomic Design System
 *
 * A popover that lets users select notification frequency.
 * Supports keyboard navigation: Arrow Up/Down, Enter/Space, Escape.
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
	const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const { t } = useTranslation();

	const currentIndex = FREQUENCY_OPTIONS.findIndex((o) => o.frequency === currentFrequency);
	const [focusedIndex, setFocusedIndex] = useState(currentIndex >= 0 ? currentIndex : 0);

	// Focus the active option on mount
	useEffect(() => {
		optionRefs.current[focusedIndex]?.focus();
	}, []);

	// Close on click outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		// Delay adding listener to avoid immediate close from the same click
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 0);

		return () => {
			clearTimeout(timer);
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [onClose]);

	const handleSelect = useCallback(
		(frequency: NotificationFrequency) => {
			onSelect(frequency);
		},
		[onSelect],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowDown': {
					e.preventDefault();
					const next = (focusedIndex + 1) % FREQUENCY_OPTIONS.length;
					setFocusedIndex(next);
					optionRefs.current[next]?.focus();
					break;
				}
				case 'ArrowUp': {
					e.preventDefault();
					const prev = (focusedIndex - 1 + FREQUENCY_OPTIONS.length) % FREQUENCY_OPTIONS.length;
					setFocusedIndex(prev);
					optionRefs.current[prev]?.focus();
					break;
				}
				case 'Home': {
					e.preventDefault();
					setFocusedIndex(0);
					optionRefs.current[0]?.focus();
					break;
				}
				case 'End': {
					e.preventDefault();
					const last = FREQUENCY_OPTIONS.length - 1;
					setFocusedIndex(last);
					optionRefs.current[last]?.focus();
					break;
				}
				case 'Escape': {
					e.preventDefault();
					onClose();
					break;
				}
				case 'Tab': {
					// Trap focus inside popover
					e.preventDefault();
					break;
				}
			}
		},
		[focusedIndex, onClose],
	);

	return (
		<div
			ref={popoverRef}
			className={`frequency-popover ${className || ''}`}
			role="listbox"
			aria-label={t('Notification frequency') || 'Notification frequency'}
			aria-orientation="vertical"
			aria-activedescendant={`freq-option-${focusedIndex}`}
			onKeyDown={handleKeyDown}
		>
			<div className="frequency-selector">
				<span className="frequency-selector__title" id="freq-selector-title">
					{t('Notifications') || 'Notifications'}
				</span>

				{FREQUENCY_OPTIONS.map((option, index) => {
					const isActive = currentFrequency === option.frequency;
					const descId = `freq-desc-${index}`;

					return (
						<button
							key={option.frequency}
							id={`freq-option-${index}`}
							ref={(el) => {
								optionRefs.current[index] = el;
							}}
							type="button"
							className={`frequency-selector__option ${isActive ? 'frequency-selector__option--active' : ''}`}
							onClick={() => handleSelect(option.frequency)}
							role="option"
							aria-selected={isActive}
							aria-describedby={descId}
							tabIndex={index === focusedIndex ? 0 : -1}
						>
							<div className="frequency-selector__option-content">
								<span className="frequency-selector__label">
									{t(option.labelKey) || option.fallbackLabel}
								</span>
								<span className="frequency-selector__description" id={descId}>
									{t(option.descriptionKey) || option.fallbackDescription}
								</span>
							</div>

							<span className="frequency-selector__check" aria-hidden="true">
								{isActive && (
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
									>
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
