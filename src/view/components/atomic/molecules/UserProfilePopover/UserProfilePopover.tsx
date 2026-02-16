import React from 'react';
import clsx from 'clsx';

/**
 * UserProfilePopover Molecule - Atomic Design System
 *
 * A popover component that displays user profile information (avatar and name).
 * Typically used on hover or click to show a larger view of user details.
 * All styling is handled by SCSS in src/view/style/molecules/_user-profile-popover.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type PopoverPosition = 'bottom' | 'top' | 'left' | 'right';

export interface UserInfo {
	displayName: string;
	photoURL?: string;
	uid: string;
}

export interface UserProfilePopoverProps {
	/** User information to display */
	user: UserInfo;

	/** Whether the user is currently active (tab in focus) */
	isActive?: boolean;

	/** Whether the popover is visible */
	visible: boolean;

	/** Position of the popover relative to trigger */
	position?: PopoverPosition;

	/** Additional CSS classes */
	className?: string;

	/** HTML id attribute */
	id?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const UserProfilePopover: React.FC<UserProfilePopoverProps> = ({
	user,
	isActive = false,
	visible,
	position = 'bottom',
	className,
	id,
}) => {
	// Build BEM classes
	const popoverClasses = clsx(
		'user-profile-popover', // Block
		visible && 'user-profile-popover--visible', // Modifier: visible
		position !== 'bottom' && `user-profile-popover--position-${position}`, // Modifier: position
		className, // Additional classes
	);

	const avatarClasses = clsx(
		user.photoURL ? 'user-profile-popover__avatar' : 'user-profile-popover__avatar-default',
		isActive &&
			(user.photoURL
				? 'user-profile-popover__avatar--active'
				: 'user-profile-popover__avatar-default--active'),
	);

	const statusIndicatorClasses = clsx(
		'user-profile-popover__status-indicator',
		isActive && 'user-profile-popover__status-indicator--active',
	);

	const getInitial = (): string => {
		return user.displayName?.charAt(0).toUpperCase() || '?';
	};

	return (
		<div id={id} className={popoverClasses} role="tooltip">
			<div className="user-profile-popover__arrow" />

			<div className="user-profile-popover__avatar-container">
				{user.photoURL ? (
					<img src={user.photoURL} alt={user.displayName} className={avatarClasses} />
				) : (
					<div className={avatarClasses}>
						<span className="user-profile-popover__initial">{getInitial()}</span>
					</div>
				)}
			</div>

			<p className="user-profile-popover__name">{user.displayName}</p>

			<div className="user-profile-popover__status">
				<span className={statusIndicatorClasses} />
				<span>{isActive ? 'Active' : 'Online'}</span>
			</div>
		</div>
	);
};

export default UserProfilePopover;
