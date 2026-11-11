import { FC, useEffect, useRef, useState } from 'react';
import { Online, Statement, StatementType } from '@freedi/shared-types';
import { useOnlineUsers } from '@/controllers/hooks/useOnlineUsers';
import { useQuestionProgressRead } from '@/controllers/hooks/useQuestionProgress';
import { isLargeForPresence } from '@/helpers/presenceVisibility';
import { UserProfilePopover } from '@/view/components/atomic/molecules/UserProfilePopover';
import styles from './OnlineUsersStyle.module.scss';

/** Presence reads only on its timer; nothing the viewer does triggers another. */
const PRESENCE_READ_KEY = 'presence';

interface OnlineUsersProps {
	statement: Statement | undefined;
}

/**
 * Who is here now, for gatherings small enough to afford it. In a large
 * question nothing mounts, so there is no presence write, no listener and no
 * widget. Waits for the first size read before mounting. That read can be
 * under the line while a crowd arrives together, so the size is checked again
 * each minute until the question counts as large, and then never again: a
 * crowd can hold presence on for about a minute, not longer.
 */
const OnlineUsers: FC<OnlineUsersProps> = ({ statement }) => {
	const statementId = statement?.statementId;
	const { progress, isLoaded } = useQuestionProgressRead(
		statement?.statementType === StatementType.question ? statementId : undefined,
		PRESENCE_READ_KEY,
		{ pollWhile: (latest) => !isLargeForPresence(statement, latest) },
	);

	if (!statementId || !isLoaded || isLargeForPresence(statement, progress)) return null;

	return <OnlineUsersList statementId={statementId} />;
};

const OnlineUsersList: FC<{ statementId: string }> = ({ statementId }) => {
	const { onlineUsers, isLoading } = useOnlineUsers(statementId);
	const [hoveredUserId, setHoveredUserId] = useState<string | null>(null);
	const [clickedUserId, setClickedUserId] = useState<string | null>(null);

	const handleClickOutside = (): void => {
		setClickedUserId(null);
	};

	// Close clicked popover when clicking outside
	// IMPORTANT: This hook must be called before any conditional returns
	useEffect(() => {
		if (clickedUserId) {
			const handleKeyDown = (e: KeyboardEvent): void => {
				if (e.key === 'Escape') setClickedUserId(null);
			};

			document.addEventListener('click', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);

			return () => {
				document.removeEventListener('click', handleClickOutside);
				document.removeEventListener('keydown', handleKeyDown);
			};
		}

		return undefined;
	}, [clickedUserId]);

	// Early return AFTER all hooks
	if (isLoading || onlineUsers.length === 0) {
		return null;
	}

	const validUsers = onlineUsers.filter((online) => online.user?.uid);
	const amountOfShownUsers = 5;
	const shownUsers = validUsers.slice(0, amountOfShownUsers);
	const hiddenCount = validUsers.length - shownUsers.length;

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
					<OnlineUserItem
						key={online.user.uid}
						online={online}
						isPopoverVisible={isPopoverVisible}
						onEnter={() => handleMouseEnter(online.user.uid)}
						onLeave={handleMouseLeave}
						onToggle={() => handleClick(online.user.uid)}
					/>
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

interface OnlineUserItemProps {
	online: Online;
	isPopoverVisible: boolean;
	onEnter: () => void;
	onLeave: () => void;
	onToggle: () => void;
}

/** One avatar. Its profile card renders in document.body, anchored to this element. */
const OnlineUserItem: FC<OnlineUserItemProps> = ({
	online,
	isPopoverVisible,
	onEnter,
	onLeave,
	onToggle,
}) => {
	const itemRef = useRef<HTMLDivElement>(null);
	const ringClass = online.tabInFocus ? styles.activeRing : '';

	return (
		<div
			ref={itemRef}
			className={styles.userItem}
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			onClick={(e) => {
				e.stopPropagation();
				onToggle();
			}}
		>
			{online.user.photoURL ? (
				<img
					src={online.user.photoURL}
					alt={online.user.displayName}
					className={`${styles.avatar} ${styles.avatarImage} ${ringClass}`}
				/>
			) : (
				<div className={`${styles.avatar} ${styles.avatarDefault} ${ringClass}`}>
					<span className={styles.initial}>{online.user.displayName?.charAt(0).toUpperCase()}</span>
				</div>
			)}

			<UserProfilePopover
				user={online.user}
				isActive={online.tabInFocus}
				visible={isPopoverVisible}
				anchorRef={itemRef}
			/>
		</div>
	);
};

export default OnlineUsers;
