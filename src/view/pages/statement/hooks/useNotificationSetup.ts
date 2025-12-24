import { useEffect, useRef } from 'react';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { notificationService } from '@/services/notificationService';
import { Statement } from '@freedi/shared-types';
import { APP_CONSTANTS, ERROR_MESSAGES } from '../constants';

interface UseNotificationSetupProps {
	statement: Statement | null;
	setError: (error: string | null) => void;
}

export const useNotificationSetup = ({ statement, setError }: UseNotificationSetupProps) => {
	const { creator } = useAuthentication();
	const initializationAttemptedRef = useRef(false);

	useEffect(() => {
		if (!statement || !creator) return;

		// Bail out early if notifications aren't supported (e.g., iOS)
		// This prevents repeated log messages on unsupported platforms
		if (!notificationService.isSupported()) return;

		// Only attempt initialization once per session
		if (initializationAttemptedRef.current) return;

		const timeoutId = setTimeout(async () => {
			try {
				const permission = notificationService.safeGetPermission();
				const notificationsEnabled = permission === 'granted' && creator;

				if (notificationsEnabled && !notificationService.getToken()) {
					initializationAttemptedRef.current = true;
					await notificationService.initialize(creator.uid);
				}
			} catch (error) {
				console.error('Error in notification setup:', error);
				const errorMessage = error instanceof Error
					? error.message
					: ERROR_MESSAGES.NOTIFICATION_SETUP;
				setError(errorMessage);
			}
		}, APP_CONSTANTS.NOTIFICATION_DELAY);

		return () => {
			clearTimeout(timeoutId);
		};
	}, [statement, creator, setError]);
};
