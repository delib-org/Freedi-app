import { useMemo } from 'react';
import { isIOS, isInstalledPWA, isNotificationSupported } from '@/services/platformService';

export type FirstRunStep = 'terms' | 'notifications';

/**
 * Which first-run steps this browser needs. Terms always; notifications only
 * when the browser can still ask (permission undecided) and asking would work
 * (iOS needs the installed app first — Me → "Install app" covers that).
 */
export function computeFirstRunSteps(env: {
	notificationSupported: boolean;
	permission: NotificationPermission | undefined;
	iosNotInstalled: boolean;
}): FirstRunStep[] {
	const steps: FirstRunStep[] = ['terms'];
	if (env.notificationSupported && env.permission === 'default' && !env.iosNotInstalled) {
		steps.push('notifications');
	}

	return steps;
}

export function useFirstRunSteps(): FirstRunStep[] {
	return useMemo(
		() =>
			computeFirstRunSteps({
				notificationSupported: isNotificationSupported(),
				permission: isNotificationSupported() ? Notification.permission : undefined,
				iosNotInstalled: isIOS() && !isInstalledPWA(),
			}),
		[],
	);
}
