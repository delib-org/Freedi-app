import { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Collections, OnlineSchema } from 'delib-npm';
import { parse } from 'valibot';
import {
	getCurrentUser,
	removeUserFromOnlineToDB,
	setUserOnlineToDB,
	updateUserHeartbeatToDB,
	updateUserTabFocusToDB,
} from '../db/online/setOnline';
import { FireStore } from '../db/config';

export const useOnlineUsers = (statementId) => {
	const [onlineUsers, setOnlineUsers] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(null);

	const currentUser = getCurrentUser();
	const unsubscribeRef = useRef(null);
	const heartbeatIntervalRef = useRef(null);
	const isInitializedRef = useRef(false);

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
		if (!statementId) return;

		const q = query(
			collection(FireStore, Collections.online),
			where('statementId', '==', statementId)
		);

		const unsubscribe = onSnapshot(q, (snapshot) => {
			const users = [];

			snapshot.forEach((doc) => {
				try {
					const data = doc.data();
					// Handle different timestamp formats
					if (data.lastUpdated === null) {
						data.lastUpdated = Date.now();
					} else if (
						data.lastUpdated &&
						typeof data.lastUpdated.toMillis === 'function'
					) {
						// Convert Firestore Timestamp to milliseconds
						data.lastUpdated = data.lastUpdated.toMillis();
					}
					const validatedData = parse(OnlineSchema, data);
					users.push(validatedData);
				} catch (error) {
					console.error('Error validating online user data:', error);
				}
			});

			setOnlineUsers(users);
			setIsLoading(false);
		});

		unsubscribeRef.current = unsubscribe;

		return () => {
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
			}
		};
	}, [statementId]);

	// Handle tab focus/blur events
	useEffect(() => {
		if (!statementId || !currentUser || !isInitializedRef.current) return;

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

		window.addEventListener('focus', handleFocus);
		window.addEventListener('blur', handleBlur);

		return () => {
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('blur', handleBlur);
		};
	}, [statementId, currentUser, isInitializedRef.current]);

	// Heartbeat to keep user alive
	useEffect(() => {
		if (!statementId || !currentUser || !isInitializedRef.current) return;

		const heartbeat = async () => {
			try {
				await updateUserHeartbeatToDB(statementId, currentUser.uid);
			} catch (err) {
				console.error('Error updating heartbeat:', err);
			}
		};

		// Initial heartbeat after 30 seconds, then every 30 seconds
		const timeoutId = setTimeout(() => {
			heartbeat();

			heartbeatIntervalRef.current = setInterval(heartbeat, 30000); // 30 seconds
		}, 30000);

		return () => {
			clearTimeout(timeoutId);
			if (heartbeatIntervalRef.current) {
				clearInterval(heartbeatIntervalRef.current);
			}
		};
	}, [statementId, currentUser, isInitializedRef.current]);

	// Cleanup when component unmounts or user changes
	useEffect(() => {
		return () => {
			if (statementId && currentUser) {
				removeUserFromOnlineToDB(statementId, currentUser.uid).catch(
					(err) =>
						console.error('Error removing user from online:', err)
				);
			}
		};
	}, [statementId, currentUser]);

	// Cleanup on page unload
	useEffect(() => {
		if (!statementId || !currentUser) return;

		const handleBeforeUnload = () => {
			// Use sendBeacon for better reliability on page unload
			if (navigator.sendBeacon && window.fetch) {
				// Note: This would require an API endpoint for immediate cleanup
				// For now, rely on heartbeat timeout for cleanup
			}
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
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
