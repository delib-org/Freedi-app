import { useState, useEffect, useRef } from 'react';
import {
	removeUserFromOnlineToDB,
	setUserOnlineToDB,
	updateUserTabFocusToDB,
} from '../db/online/setOnline';
import { ListenToOnlineUsers } from '../db/online/getOnline';
import { useAuthentication } from './useAuthentication';

export const useOnlineUsers = (statementId) => {
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const { creator: currentUser, isLoading: userLoading } = useAuthentication();
	const isInitializedRef = useRef(false);
	const previousStatementRef = useRef(null);

	// Define cleanup function first
	const cleanup = (targetStatementId, targetUser) => {
		if (targetStatementId && targetUser?.uid) {
			removeUserFromOnlineToDB(targetStatementId, targetUser.uid).catch((err) =>
				console.error('Error in cleanup:', err),
			);
		}
	};
	useEffect(() => {
		const previousStatementId = previousStatementRef.current;

		// If we have a previous statement and it's different from current, clean it up
		if (previousStatementId && previousStatementId !== statementId && currentUser && !userLoading) {
			cleanup(previousStatementId, currentUser);
		}

		// Update the ref with current statementId
		previousStatementRef.current = statementId;

		// Reset initialization flag when statementId changes
		isInitializedRef.current = false;
	}, [statementId, currentUser]);
	// Initialize user as online when hook mounts
	useEffect(() => {
		if (!statementId || !currentUser || userLoading || isInitializedRef.current) return;

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

		const unsubscribe = ListenToOnlineUsers(statementId, setOnlineUsers, setIsLoading);

		return () => unsubscribe();
	}, [statementId, isInitializedRef.current]);

	// Handle tab focus/blur events
	useEffect(() => {
		if (typeof window === 'undefined' || !statementId || !currentUser || !isInitializedRef.current)
			return;

		const handleFocus = async () => {
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, true);
			} catch (err) {
				console.error('Error updating tab focus:', err);
			}
		};

		const handleBlur = async () => {
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, false);
			} catch (err) {
				console.error('Error updating tab blur:', err);
			}
		};

		const handleVisibilityChange = async () => {
			const isVisible = document.visibilityState === 'visible';
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, isVisible);
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
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, [statementId, currentUser, isInitializedRef.current]);

	// Cleanup on window close
	useEffect(() => {
		if (!statementId || !currentUser) return;

		const handleBeforeUnload = () => {
			cleanup(statementId, currentUser);
		};

		window.addEventListener('beforeunload', handleBeforeUnload);
		window.addEventListener('unload', handleBeforeUnload);

		// Cleanup on component unmount
		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			window.removeEventListener('unload', handleBeforeUnload);
			cleanup(statementId, currentUser);
		};
	}, [statementId, currentUser]);

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
