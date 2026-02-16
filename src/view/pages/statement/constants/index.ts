// Application constants
export const APP_CONSTANTS = {
	NOTIFICATION_DELAY: 1000,
	DOCUMENT_TITLE_PREFIX: 'WizCol',
	TITLE_MAX_LENGTH: 15,
	SCREEN_TYPES: {
		MAIN: 'main',
		MIND_MAP: 'mind-map',
		SETTINGS: 'settings',
	},
} as const;

// Error messages
export const ERROR_MESSAGES = {
	NOTIFICATION_SETUP: 'Failed to set up notifications',
	LISTENER_SETUP: 'Failed to set up listeners',
	UNSUBSCRIBE: 'Failed to clean up listeners',
	GENERIC: 'An unexpected error occurred',
} as const;

// Component states
export const COMPONENT_STATES = {
	LOADING: 'loading',
	ERROR: 'error',
	NOT_FOUND: 'not_found',
	UNAUTHORIZED: 'unauthorized',
	WAITING_APPROVAL: 'waiting_approval',
	AUTHORIZED: 'authorized',
} as const;

export type ComponentState = (typeof COMPONENT_STATES)[keyof typeof COMPONENT_STATES];
