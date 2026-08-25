import React, { useRef } from 'react';
import clsx from 'clsx';
import type { ActivityType } from '@freedi/shared-types';
import TypeCard, { type ActivityTypeOption } from './TypeCard';

/**
 * ActivityTypePicker molecule — radiogroup grid of TypeCards. Arrow keys
 * move focus AND selection (standard radio behaviour), skipping disabled
 * options; Enter/Space select the focused card.
 * Styles: styles/molecules/_type-picker.scss
 */

export interface ActivityTypePickerProps {
	options: ActivityTypeOption[];
	value?: ActivityType;
	onChange: (type: ActivityType) => void;
	/** Accessible name of the group (already translated). */
	label: string;
	compact?: boolean;
	className?: string;
}

const ActivityTypePicker: React.FC<ActivityTypePickerProps> = ({
	options,
	value,
	onChange,
	label,
	compact = false,
	className,
}) => {
	const refs = useRef<(HTMLButtonElement | null)[]>([]);

	const enabledIndexes = options
		.map((option, index) => (option.disabledReason ? -1 : index))
		.filter((index) => index >= 0);
	const selectedIndex = options.findIndex((option) => option.type === value);
	const tabStop = selectedIndex >= 0 ? selectedIndex : (enabledIndexes[0] ?? 0);

	const moveTo = (index: number) => {
		const option = options[index];
		if (!option) return;
		refs.current[index]?.focus();
		if (!option.disabledReason) onChange(option.type);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
		if (enabledIndexes.length === 0) return;
		const position = enabledIndexes.indexOf(index);
		const current = position >= 0 ? position : 0;
		let next: number | null = null;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = enabledIndexes[(current + 1) % enabledIndexes.length];
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = enabledIndexes[(current - 1 + enabledIndexes.length) % enabledIndexes.length];
				break;
			case 'Home':
				next = enabledIndexes[0];
				break;
			case 'End':
				next = enabledIndexes[enabledIndexes.length - 1];
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (!options[index].disabledReason) onChange(options[index].type);

				return;
			default:
				return;
		}
		event.preventDefault();
		moveTo(next);
	};

	return (
		<div
			role="radiogroup"
			aria-label={label}
			className={clsx('type-picker', compact && 'type-picker--compact', className)}
		>
			{options.map((option, index) => (
				<TypeCard
					key={option.type}
					option={option}
					selected={option.type === value}
					compact={compact}
					tabIndex={index === tabStop ? 0 : -1}
					onSelect={onChange}
					onKeyDown={(event) => handleKeyDown(event, index)}
					buttonRef={(el) => {
						refs.current[index] = el;
					}}
				/>
			))}
		</div>
	);
};

export default ActivityTypePicker;
