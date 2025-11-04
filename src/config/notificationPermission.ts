// Simple notification permission configuration
// Easy to understand and modify

export const NOTIFICATION_PERMISSION_CONFIG = {
	// Master switch - set to false to disable entire system
	enabled: true,

	// When to ask for permission
	triggers: {
		afterFirstPost: true, // Ask after user posts their first comment
		onSettingsPage: true, // Ask when user visits settings
	},

	// Timing
	delayAfterPostMs: 2000, // Wait 2 seconds after post (let user see their post first)
	dontAskAgainForDays: 7, // If dismissed, wait 7 days before asking again

	// Platform handling
	disableOnIOS: true, // iOS Safari doesn't support FCM, skip prompt

	// LocalStorage keys (for tracking)
	storageKeys: {
		lastAsked: 'freedi_notif_last_asked',
		userDismissed: 'freedi_notif_dismissed',
		neverAsk: 'freedi_notif_never_ask',
		userHasPosted: 'freedi_user_has_posted',
	},
} as const;

export type NotificationPermissionConfig = typeof NOTIFICATION_PERMISSION_CONFIG;
