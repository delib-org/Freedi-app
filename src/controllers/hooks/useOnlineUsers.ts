import { useState, useEffect, useRef } from 'react';
import {
	removeUserFromOnlineToDB,
	setUserOnlineToDB,
	updateUserTabFocusToDB,
} from '../db/online/setOnline';
import { store } from '@/redux/store';
import { ListenToOnlineUsers } from '../db/online/getOnline';

export const useOnlineUsers = (statementId) => {
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const currentUser = store.getState()?.creator?.creator;

	const isInitializedRef = useRef(false);
	const cleanupRef = useRef({ statementId: null, currentUser: null });

	// Define cleanup function first
	const cleanup = () => {
		const {
			statementId: cleanupStatementId,
			currentUser: cleanupCurrentUser,
		} = cleanupRef.current;
		if (cleanupStatementId && cleanupCurrentUser) {
			removeUserFromOnlineToDB(
				cleanupStatementId,
				cleanupCurrentUser.uid
			).catch((err) =>
				console.error('Error removing user from online:', err)
			);
		}
	};

	// Update cleanup ref when values change
	useEffect(() => {
		cleanupRef.current = { statementId, currentUser };
	}, [statementId, currentUser]);

	// Initialize user as online when hook mounts
	useEffect(() => {
		if (!statementId || !currentUser || isInitializedRef.current) return;

		const initializeOnlineUser = async () => {
			try {
				setIsLoading(true);
				await setUserOnlineToDB(statementId, currentUser);
				isInitializedRef.current = true;
			} catch (err) {
				console.error('Error setting user online:', err);
				setError(err);
			} finally {
				setIsLoading(false);
			}
		};

		initializeOnlineUser();
	}, [statementId, currentUser]);

	// Subscribe to online users changes
	useEffect(() => {
		if (!statementId || !isInitializedRef.current) return;

		const unsubscribe = ListenToOnlineUsers(
			statementId,
			setOnlineUsers,
			setIsLoading
		);

		return () => unsubscribe();
	}, [statementId, isInitializedRef.current]);

	// Handle tab focus/blur events
	useEffect(() => {
		if (
			typeof window === 'undefined' ||
			!statementId ||
			!currentUser ||
			!isInitializedRef.current
		)
			return;

		const handleFocus = async () => {
			try {
				await updateUserTabFocusToDB(
					statementId,
					currentUser.uid,
					true
				);
			} catch (err) {
				console.error('Error updating tab focus:', err);
			}
		};

		const handleBlur = async () => {
			try {
				await updateUserTabFocusToDB(
					statementId,
					currentUser.uid,
					false
				);
			} catch (err) {
				console.error('Error updating tab blur:', err);
			}
		};

		const handleVisibilityChange = async () => {
			const isVisible = document.visibilityState === 'visible';
			try {
				await updateUserTabFocusToDB(
					statementId,
					currentUser.uid,
					isVisible
				);
			} catch (err) {
				console.error('Error updating visibility:', err);
			}
		};

		window.addEventListener('focus', handleFocus);
		window.addEventListener('blur', handleBlur);
		document.addEventListener('visibilitychange', handleVisibilityChange);

		return () => {
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
			document.removeEventListener(
				'visibilitychange',
				handleVisibilityChange
			);
		};
	}, [statementId, currentUser, isInitializedRef.current]);

	// Cleanup on window close
	useEffect(() => {
		if (!statementId || !currentUser) return;

		window.addEventListener('beforeunload', cleanup);
		window.addEventListener('unload', cleanup);

		return () => {
			window.removeEventListener('beforeunload', cleanup);
			window.removeEventListener('unload', cleanup);
		};
	}, [statementId, currentUser]);

	// Cleanup ONLY on component unmount (empty dependency array)
	useEffect(() => {
		return () => {
			cleanup();
		};
	}, []);

	// Helper functions for component use
	const getActiveUsers = () => {
		return onlineUsers.filter((user) => user.tabInFocus);
	};

	const getTotalOnlineCount = () => {
		return onlineUsers.length;
	};

	const getActiveUserCount = () => {
		return getActiveUsers().length;
	};

	const isUserOnline = (userId) => {
		return onlineUsers.some((user) => user.user.uid === userId);
	};

	return {
		onlineUsers,
		activeUsers: getActiveUsers(),
		totalOnlineCount: getTotalOnlineCount(),
		activeUserCount: getActiveUserCount(),
		isLoading,
		error,
		isUserOnline,
	};
};
