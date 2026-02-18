import React, { useState } from 'react';
import { useOnlineUsers } from '@/controllers/hooks/useOnlineUsers';
import { UserProfilePopover } from '@/view/components/atomic/molecules/UserProfilePopover';
import styles from './OnlineUsersStyle.module.scss';

interface OnlineUsersProps {
	statementId: string;
}

const OnlineUsers: React.FC<OnlineUsersProps> = ({ statementId }) => {
	const { onlineUsers, isLoading } = useOnlineUsers(statementId);
	const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
	const [clickedUserId, setClickedUserId] = useState<string | null>(null);

	const handleClickOutside = (): void => {
		setClickedUserId(null);
	};

	// Close clicked popover when clicking outside
	// IMPORTANT: This hook must be called before any conditional returns
	React.useEffect(() => {
		if (clickedUserId) {
			document.addEventListener('click', handleClickOutside);

			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}

		return undefined;
	}, [clickedUserId]);

	// Early return AFTER all hooks
	if (isLoading || onlineUsers.length === 0) {
		return null;
	}

	const amountOfShownUsers = 5;
	const shownUsers = onlineUsers.slice(0, amountOfShownUsers);
	const hiddenCount = onlineUsers.length - shownUsers.length;

	const handleMouseEnter = (userId: string): void => {
		setHoveredUserId(userId);
	};

	const handleMouseLeave = (): void => {
		setHoveredUserId(null);
	};

	const handleClick = (userId: string): void => {
		// Toggle: if already clicked, close it; otherwise open it
		setClickedUserId((prev) => (prev === userId ? null : userId));
	};

	return (
		<div className={styles.container}>
			{shownUsers.map((online) => {
				const isPopoverVisible =
					hoveredUserId === online.user.uid || clickedUserId === online.user.uid;

				return (
					<div
						key={online.user.uid}
						className={styles.userItem}
						onMouseEnter={() => handleMouseEnter(online.user.uid)}
						onMouseLeave={handleMouseLeave}
						onClick={(e) => {
							e.stopPropagation();
							handleClick(online.user.uid);
						}}
					>
						{online.user.photoURL ? (
							<img
								src={online.user.photoURL}
								alt={online.user.displayName}
								className={`${styles.avatar} ${styles.avatarImage} ${
									online.tabInFocus ? styles.activeRing : ''
								}`}
							/>
						) : (
							<div
								className={`${styles.avatar} ${styles.avatarDefault} ${
									online.tabInFocus ? styles.activeRing : ''
								}`}
							>
								<span className={styles.initial}>
									{online.user.displayName?.charAt(0).toUpperCase()}
								</span>
							</div>
						)}

						<UserProfilePopover
							user={online.user}
							isActive={online.tabInFocus}
							visible={isPopoverVisible}
						/>
					</div>
				);
			})}
			{hiddenCount > 0 && (
				<div className={styles.userItem} title={`${hiddenCount} more`}>
					<div className={styles.moreUsers}>+{hiddenCount}</div>
				</div>
			)}
		</div>
	);
};

export default OnlineUsers;
