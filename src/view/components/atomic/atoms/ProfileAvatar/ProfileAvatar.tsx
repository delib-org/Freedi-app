import React from 'react';
import clsx from 'clsx';
import { EngagementLevel } from '@freedi/shared-types';

/**
 * ProfileAvatar Atom - Atomic Design System
 *
 * Circular profile photo with a colored border ring indicating engagement level.
 * Falls back to initials when no photo is available.
 * All styling in src/view/style/atoms/_profile-avatar.scss
 */

export interface ProfileAvatarProps {
	/** User's profile photo URL */
	photoURL?: string | null;

	/** User's display name (used for initials fallback) */
	displayName?: string;

	/** Engagement level (determines ring color) */
	level?: EngagementLevel;

	/** Size variant */
	size?: 'small' | 'medium' | 'large';

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

function getInitial(displayName?: string): string {
	if (!displayName) return '?';
	const trimmed = displayName.trim();
	if (!trimmed) return '?';

	return trimmed.charAt(0).toUpperCase();
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
	photoURL,
	displayName,
	level = EngagementLevel.OBSERVER,
	size = 'small',
	className,
}) => {
	const levelCss = LEVEL_CSS_NAMES[level] ?? 'observer';

	const classes = clsx(
		'profile-avatar',
		`profile-avatar--${levelCss}`,
		size !== 'small' && `profile-avatar--${size}`,
		className,
	);

	return (
		<span className={classes}>
			{photoURL ? (
				<img
					className="profile-avatar__image"
					src={photoURL}
					alt={displayName || 'Profile'}
					referrerPolicy="no-referrer"
				/>
			) : (
				<span className="profile-avatar__initials">
					{getInitial(displayName)}
				</span>
			)}
		</span>
	);
};

export default ProfileAvatar;
