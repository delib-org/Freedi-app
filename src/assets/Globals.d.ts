import { FC, SVGProps } from 'react';

declare module '*.module.css';
declare module '*.module.scss';

declare module '*.svg?react' {
	export const ReactComponent: FC<SVGProps<SVGSVGElement>>;
	export default ReactComponent;
}

declare global {
	/**
	 * Extend NotificationOptions to include the `vibrate` and `actions` properties.
	 * The Vibration API for notifications is supported in most browsers
	 * but is not included in TypeScript's built-in DOM lib types.
	 * See: https://developer.mozilla.org/en-US/docs/Web/API/Notification/vibrate
	 */
	interface NotificationOptions {
		vibrate?: number | number[];
		actions?: Array<{ action: string; title: string; icon?: string }>;
	}

	/**
	 * Experimental Badge API type declarations.
	 * These APIs are supported in Chromium-based browsers for PWA badge counts.
	 * See: https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
	 */
	interface Navigator {
		/** Sets the app badge count (Badging API) */
		setAppBadge(count?: number): Promise<void>;
		/** Clears the app badge (Badging API) */
		clearAppBadge(): Promise<void>;
		/** Sets the app badge count (legacy experimental API) */
		setExperimentalAppBadge(count?: number): Promise<void>;
		/** Clears the app badge (legacy experimental API) */
		clearExperimentalAppBadge(): Promise<void>;
	}

	interface ExperimentalBadge {
		set(count?: number): Promise<void>;
		clear(): Promise<void>;
	}

	interface Window {
		ExperimentalBadge?: ExperimentalBadge;
	}
}
