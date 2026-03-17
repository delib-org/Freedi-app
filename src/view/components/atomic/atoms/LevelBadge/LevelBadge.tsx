import React from 'react';
import clsx from 'clsx';
import { EngagementLevel } from '@freedi/shared-types';
import { getLevelName } from '@freedi/engagement-core';

/**
 * LevelBadge Atom - Atomic Design System
 *
 * Displays the user's engagement level as a color-coded pill badge.
 * All styling in src/view/style/atoms/_level-badge.scss
 */

export interface LevelBadgeProps {
	/** Engagement level to display */
	level: EngagementLevel;

	/** Size variant */
	size?: 'small' | 'medium' | 'large';

	/** Show only the icon (no text) */
	iconOnly?: boolean;

	/** Additional CSS classes */
	className?: string;
}

const LEVEL_CSS_NAMES: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: 'observer',
	[EngagementLevel.PARTICIPANT]: 'participant',
	[EngagementLevel.CONTRIBUTOR]: 'contributor',
	[EngagementLevel.ADVOCATE]: 'advocate',
	[EngagementLevel.LEADER]: 'leader',
};

const LEVEL_INITIALS: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: 'O',
	[EngagementLevel.PARTICIPANT]: 'P',
	[EngagementLevel.CONTRIBUTOR]: 'C',
	[EngagementLevel.ADVOCATE]: 'A',
	[EngagementLevel.LEADER]: 'L',
};

const LevelBadge: React.FC<LevelBadgeProps> = ({
	level,
	size = 'medium',
	iconOnly = false,
	className,
}) => {
	const cssName = LEVEL_CSS_NAMES[level] ?? 'observer';
	const initial = LEVEL_INITIALS[level] ?? 'O';
	const name = getLevelName(level);

	const badgeClasses = clsx(
		'level-badge',
		`level-badge--${cssName}`,
		size !== 'medium' && `level-badge--${size}`,
		iconOnly && 'level-badge--icon-only',
		className,
	);

	return (
		<span className={badgeClasses} title={name} aria-label={`Level: ${name}`}>
			<span className="level-badge__icon">{initial}</span>
			<span className="level-badge__name">{name}</span>
		</span>
	);
};

export default LevelBadge;
