import { useState, useEffect, useRef } from 'react';
import { Online, Creator } from '@freedi/shared-types';
import {
	removeUserFromOnlineToDB,
	setUserOnlineToDB,
	updateUserTabFocusToDB,
} from '../db/online/setOnline';
import { ListenToOnlineUsers } from '../db/online/getOnline';
import { useAuthentication } from './useAuthentication';
import { logError } from '@/utils/errorHandling';

export const useOnlineUsers = (statementId: string | undefined) => {
	const [onlineUsers, setOnlineUsers] = useState<Online[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	// Use state (not ref) so effects re-run reactively when initialization completes
	const [isInitialized, setIsInitialized] = useState(false);

	const { creator: currentUser, isLoading: userLoading } = useAuthentication();
	const previousStatementRef = useRef<string | undefined>(undefined);

	// Define cleanup function first
	const cleanup = (targetStatementId: string | undefined, targetUser: Creator | undefined) => {
		if (targetStatementId && targetUser?.uid) {
			removeUserFromOnlineToDB(targetStatementId, targetUser.uid).catch((err) =>
				logError(err, { operation: 'hooks.useOnlineUsers.cleanup', metadata: { message: 'Error in cleanup:' } }),
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

		// Reset initialization when statementId changes
		setIsInitialized(false);
	}, [statementId, currentUser, userLoading]);

	// Initialize user as online when hook mounts
	useEffect(() => {
		if (!statementId || !currentUser || userLoading || isInitialized) return;

		let isMounted = true;

		const initializeOnlineUser = async () => {
			try {
				setIsLoading(true);
				await setUserOnlineToDB(statementId, currentUser);
				if (isMounted) setIsInitialized(true);
			} catch (err) {
				logError(err, { operation: 'hooks.useOnlineUsers.initializeOnlineUser', metadata: { message: 'Error setting user online:' } });
				if (isMounted) setError(err instanceof Error ? err : new Error(String(err)));
			} finally {
				if (isMounted) setIsLoading(false);
			}
		};

		initializeOnlineUser();

		return () => {
			isMounted = false;
		};
	}, [statementId, currentUser, userLoading, isInitialized]);

	// Subscribe to online users changes
	useEffect(() => {
		if (!statementId || !isInitialized) return;

		const unsubscribe = ListenToOnlineUsers(statementId, setOnlineUsers, setIsLoading);

		return () => unsubscribe();
	}, [statementId, isInitialized]);

	// Handle tab focus/blur events
	useEffect(() => {
		if (typeof window === 'undefined' || !statementId || !currentUser || !isInitialized)
			return;

		const handleFocus = async () => {
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, true);
			} catch (err) {
				logError(err, { operation: 'hooks.useOnlineUsers.handleFocus', metadata: { message: 'Error updating tab focus:' } });
			}
		};

		const handleBlur = async () => {
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, false);
			} catch (err) {
				logError(err, { operation: 'hooks.useOnlineUsers.handleBlur', metadata: { message: 'Error updating tab blur:' } });
			}
		};

		const handleVisibilityChange = async () => {
			const isVisible = document.visibilityState === 'visible';
			try {
				await updateUserTabFocusToDB(statementId, currentUser.uid, isVisible);
			} catch (err) {
				logError(err, { operation: 'hooks.useOnlineUsers.handleVisibilityChange', metadata: { message: 'Error updating visibility:' } });
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
	}, [statementId, currentUser, isInitialized]);

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

	const isUserOnline = (userId: string) => {
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
