import React, { RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { UI } from '@/constants/common';

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

	/**
	 * Element the popover belongs to. When given, the popover renders in
	 * document.body with fixed coordinates taken from this element, so no
	 * ancestor stacking context, transform or overflow can cover or clip it.
	 */
	anchorRef?: RefObject<HTMLElement | null>;
}

/** Writes the fixed coordinates onto the popover as CSS custom properties. */
function placeBelowAnchor(popover: HTMLElement, anchor: HTMLElement): void {
	const anchorRect = anchor.getBoundingClientRect();
	const { width, height } = popover.getBoundingClientRect();
	const viewportWidth = document.documentElement.clientWidth;
	const viewportHeight = window.innerHeight;
	const margin = UI.POPOVER_VIEWPORT_MARGIN;
	const gap = UI.POPOVER_ANCHOR_GAP;
	const anchorCenter = anchorRect.left + anchorRect.width / 2;
	const left = Math.max(margin, Math.min(anchorCenter - width / 2, viewportWidth - width - margin));
	const fitsBelow = anchorRect.bottom + gap + height + margin <= viewportHeight;
	const showAbove = !fitsBelow && anchorRect.top - gap - height - margin >= 0;
	const top = showAbove ? anchorRect.top - gap - height : anchorRect.bottom + gap;
	const arrowLeft = Math.max(
		UI.POPOVER_ARROW_INSET,
		Math.min(anchorCenter - left, width - UI.POPOVER_ARROW_INSET),
	);

	popover.style.setProperty('--popover-top', `${Math.round(top)}px`);
	popover.style.setProperty('--popover-left', `${Math.round(left)}px`);
	popover.style.setProperty('--popover-arrow-left', `${Math.round(arrowLeft)}px`);
	popover.classList.toggle('user-profile-popover--above', showAbove);
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
	anchorRef,
}) => {
	const popoverRef = useRef<HTMLDivElement>(null);
	const isPortal = Boolean(anchorRef);

	const reposition = useCallback((): void => {
		const popover = popoverRef.current;
		const anchor = anchorRef?.current;

		if (popover && anchor) placeBelowAnchor(popover, anchor);
	}, [anchorRef]);

	// Follow the avatar while open: any scroll (capture catches nested
	// scrollers) or resize moves it, so recompute instead of leaving the card
	// floating where the avatar used to be.
	useLayoutEffect(() => {
		if (!isPortal || !visible) return undefined;

		reposition();
		window.addEventListener('scroll', reposition, true);
		window.addEventListener('resize', reposition);

		return () => {
			window.removeEventListener('scroll', reposition, true);
			window.removeEventListener('resize', reposition);
		};
	}, [isPortal, visible, reposition]);

	// Build BEM classes
	const popoverClasses = clsx(
		'user-profile-popover', // Block
		visible && 'user-profile-popover--visible', // Modifier: visible
		isPortal && 'user-profile-popover--portal', // Modifier: fixed, rendered in body
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

	const popover = (
		<div
			id={id}
			ref={popoverRef}
			className={popoverClasses}
			role="tooltip"
			onClick={isPortal ? (e) => e.stopPropagation() : undefined}
		>
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

	return isPortal ? createPortal(popover, document.body) : popover;
};

export default UserProfilePopover;
