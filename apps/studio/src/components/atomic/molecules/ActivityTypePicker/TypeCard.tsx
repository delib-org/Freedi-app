import React from 'react';
import clsx from 'clsx';
import type { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Tag, getActivityPresentation } from '@/components/atomic/atoms/Tag';

/**
 * TypeCard — one selectable activity type (button role="radio").
 * Styles: styles/molecules/_type-card.scss
 */

export interface ActivityTypeOption {
	type: ActivityType;
	/** Already-translated one-liner. */
	description: string;
	/** Already-translated "best for" bullets. */
	whenToUse: string[];
	recommended?: boolean;
	/** Already-translated reason; when set the card is not selectable. */
	disabledReason?: string;
}

export interface TypeCardProps {
	option: ActivityTypeOption;
	selected: boolean;
	compact?: boolean;
	tabIndex: number;
	onSelect: (type: ActivityType) => void;
	onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
	buttonRef: (el: HTMLButtonElement | null) => void;
}

const TypeCard: React.FC<TypeCardProps> = ({
	option,
	selected,
	compact = false,
	tabIndex,
	onSelect,
	onKeyDown,
	buttonRef,
}) => {
	const { t } = useTranslation();
	const { label, icon, modifier, engine } = getActivityPresentation(option.type);
	const disabled = Boolean(option.disabledReason);

	const classes = clsx(
		'type-card',
		`type-card--${modifier}`,
		selected && 'type-card--selected',
		disabled && 'type-card--disabled',
		compact && 'type-card--compact',
	);

	return (
		<button
			ref={buttonRef}
			type="button"
			role="radio"
			aria-checked={selected}
			aria-disabled={disabled || undefined}
			tabIndex={tabIndex}
			className={classes}
			onClick={() => {
				if (!disabled) onSelect(option.type);
			}}
			onKeyDown={onKeyDown}
		>
			<span className="type-card__icon" aria-hidden="true">
				{icon}
			</span>
			<span className="type-card__title">{t(label)}</span>
			<span className="type-card__engine">
				{t('Powered by')} {engine}
			</span>
			<span className="type-card__description">{option.description}</span>
			{option.whenToUse.length > 0 && (
				<ul className="type-card__when">
					<li className="type-card__when-title">{t('Best for')}</li>
					{option.whenToUse.map((line) => (
						<li key={line} className="type-card__when-item">
							{line}
						</li>
					))}
				</ul>
			)}
			{(option.disabledReason || option.recommended) && (
				<span className="type-card__badge">
					<Tag outline>{option.disabledReason ?? t('Recommended')}</Tag>
				</span>
			)}
			{selected && (
				<span className="type-card__check" aria-hidden="true">
					✓
				</span>
			)}
		</button>
	);
};

export default TypeCard;
