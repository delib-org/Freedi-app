import React from 'react';
import clsx from 'clsx';

export type RoleBadgeKind = 'creator' | 'host' | 'you' | 'blocked' | 'waiting';

export interface RoleBadgeProps {
	kind: RoleBadgeKind;
	/** The word itself (Creator, Host, You, Blocked): never colour alone. */
	label: string;
	className?: string;
}

/**
 * RoleBadge - element of the PersonRow molecule (`person-row__badge`).
 * Text badge after a person's name. Styling: _person-row.scss.
 */
const RoleBadge: React.FC<RoleBadgeProps> = ({ kind, label, className }) => (
	<span className={clsx('person-row__badge', `person-row__badge--${kind}`, className)}>
		{label}
	</span>
);

export default RoleBadge;
