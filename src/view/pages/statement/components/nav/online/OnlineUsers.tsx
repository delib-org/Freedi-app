import React from 'react';
import { useOnlineUsers } from '@/controllers/hooks/useOnlineUsers';
import styles from './OnlineUsersStyle.module.scss';

const OnlineUsers = ({ statementId }) => {
	const { onlineUsers, isLoading } = useOnlineUsers(statementId);

	if (isLoading || onlineUsers.length === 0) {
		return null;
	}

	return (
		<div className={styles.container}>
			{onlineUsers.map((online) => (
				<div
					key={online.user.uid}
					className={styles.userItem}
					title={online.user.displayName}
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
								{online.user.displayName
									?.charAt(0)
									.toUpperCase()}
							</span>
						</div>
					)}
				</div>
			))}
		</div>
	);
};

export default OnlineUsers;
