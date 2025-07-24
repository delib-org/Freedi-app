import { useEffect } from 'react';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { notificationService } from '@/services/notificationService';
import { Statement } from 'delib-npm';
import { APP_CONSTANTS, ERROR_MESSAGES } from '../constants';

interface UseNotificationSetupProps {
	statement: Statement | null;
	setError: (error: string | null) => void;
}

export const useNotificationSetup = ({ statement, setError }: UseNotificationSetupProps) => {
	const { creator } = useAuthentication();

	useEffect(() => {
		if (!statement || !creator) return;

		const timeoutId = setTimeout(async () => {
			try {
				if (!notificationService.isSupported()) return;

				const permission = notificationService.safeGetPermission();
				const notificationsEnabled = permission === 'granted' && creator;

				if (notificationsEnabled && !notificationService.getToken()) {
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
