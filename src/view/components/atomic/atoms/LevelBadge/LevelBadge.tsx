import React from 'react';
import clsx from 'clsx';
import { EngagementLevel } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatLevelLabel, getDisplayLevel } from '@/helpers/engagementLabels';

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

const LevelBadge: React.FC<LevelBadgeProps> = ({
	level,
	size = 'medium',
	iconOnly = false,
	className,
}) => {
	const { t } = useTranslation();
	const cssName = LEVEL_CSS_NAMES[level] ?? 'observer';
	const label = formatLevelLabel(t, level);

	const badgeClasses = clsx(
		'level-badge',
		`level-badge--${cssName}`,
		size !== 'medium' && `level-badge--${size}`,
		iconOnly && 'level-badge--icon-only',
		className,
	);

	return (
		<span className={badgeClasses} title={label} aria-label={label}>
			<span className="level-badge__icon">{getDisplayLevel(level)}</span>
			<span className="level-badge__name">{label}</span>
		</span>
	);
};

export default LevelBadge;
