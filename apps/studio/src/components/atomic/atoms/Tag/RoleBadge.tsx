import React from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import Tag, { type TagRole, type TagSize } from './Tag';

export const ROLE_LABELS: Record<TagRole, string> = {
	owner: 'Owner',
	admin: 'Admin',
	viewer: 'Viewer',
};

export interface RoleBadgeProps {
	role: TagRole;
	size?: TagSize;
	className?: string;
}

const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size, className }) => {
	const { t } = useTranslation();

	return (
		<Tag role={role} size={size} className={className}>
			{t(ROLE_LABELS[role])}
		</Tag>
	);
};

export default RoleBadge;
