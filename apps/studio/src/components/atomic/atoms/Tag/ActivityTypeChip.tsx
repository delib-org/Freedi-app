import React from 'react';
import type { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import Tag, { type TagSize } from './Tag';
import { getActivityPresentation } from './activityPresentation';

export interface ActivityTypeChipProps {
	type: ActivityType;
	size?: TagSize;
	/** Hide the emoji glyph (label only). */
	hideIcon?: boolean;
	className?: string;
}

const ActivityTypeChip: React.FC<ActivityTypeChipProps> = ({
	type,
	size,
	hideIcon = false,
	className,
}) => {
	const { t } = useTranslation();
	const { label, icon, modifier } = getActivityPresentation(type);

	return (
		<Tag type={modifier} size={size} glyph={hideIcon ? undefined : icon} className={className}>
			{t(label)}
		</Tag>
	);
};

export default ActivityTypeChip;
