import { NOTIFICATION_PERMISSION_CONFIG } from '@/config/notificationPermission';
import { notificationService } from './notificationService';

/**
 * Simple notification permission manager
 * Checks if we should prompt for permission and dispatches event to show UI
 */
class NotificationPermissionManager {
	private config = NOTIFICATION_PERMISSION_CONFIG;

	/**
	 * Main method: Check if we should prompt and show if yes
	 * @param trigger - What triggered this check (e.g., 'first_post')
	 */
	async checkAndPrompt(trigger: 'first_post' | 'settings_page'): Promise<void> {
		// Guard: Is feature enabled?
		if (!this.config.enabled) {
			console.info('[PermissionManager] Feature disabled in config');
			return;
		}

		// Guard: Is this trigger enabled?
		if (!this.isTriggerEnabled(trigger)) {
			console.info(`[PermissionManager] Trigger "${trigger}" is disabled in config`);
			return;
		}

		// Guard: Is iOS?
		if (this.config.disableOnIOS && this.isIOS()) {
			console.info('[PermissionManager] iOS detected, skipping FCM prompt (not supported)');
			return;
		}

		// Guard: Already have permission?
		const currentPermission = notificationService.safeGetPermission();
		if (currentPermission === 'granted') {
			console.info('[PermissionManager] Already have notification permission');
			return;
		}

		// Guard: User explicitly denied?
		if (currentPermission === 'denied') {
			console.info('[PermissionManager] User previously denied permission');
			return;
		}

		// Guard: User said "never ask"?
		if (this.userSaidNeverAsk()) {
			console.info('[PermissionManager] User said never ask again');
			return;
		}

		// Guard: Asked recently?
		if (this.askedRecently()) {
			console.info('[PermissionManager] Asked recently, waiting before asking again');
			return;
		}

		// All checks passed - show prompt!
		console.info(`[PermissionManager] All checks passed. Showing prompt for trigger: ${trigger}`);
		this.showPrompt(trigger);
	}

	/**
	 * Show the permission prompt by dispatching custom event
	 * UI components listen for this event
	 */
	private showPrompt(trigger: string): void {
		const event = new CustomEvent('show-notification-permission-prompt', {
			detail: { trigger },
		});
		window.dispatchEvent(event);

		// Record that we asked
		this.recordAsked();
	}

	/**
	 * Check if trigger is enabled in config
	 */
	private isTriggerEnabled(trigger: string): boolean {
		if (trigger === 'first_post') {
			return this.config.triggers.afterFirstPost;
		}
		if (trigger === 'settings_page') {
			return this.config.triggers.onSettingsPage;
		}
		return false;
	}

	/**
	 * Simple iOS detection
	 */
	private isIOS(): boolean {
		const ua = navigator.userAgent.toLowerCase();
		return (
			/iphone|ipad|ipod/.test(ua) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		);
	}

	/**
	 * Check if user said "never ask again"
	 */
	private userSaidNeverAsk(): boolean {
		return localStorage.getItem(this.config.storageKeys.neverAsk) === 'true';
	}

	/**
	 * Check if we asked recently (within dontAskAgainForDays)
	 */
	private askedRecently(): boolean {
		const lastAsked = localStorage.getItem(this.config.storageKeys.lastAsked);
		if (!lastAsked) return false;

		const daysSince = (Date.now() - parseInt(lastAsked)) / (1000 * 60 * 60 * 24);
		return daysSince < this.config.dontAskAgainForDays;
	}

	/**
	 * Record that we asked (for rate limiting)
	 */
	private recordAsked(): void {
		localStorage.setItem(this.config.storageKeys.lastAsked, Date.now().toString());
	}

	/**
	 * User dismissed the prompt (clicked "Not Now")
	 */
	recordDismissed(): void {
		localStorage.setItem(this.config.storageKeys.userDismissed, Date.now().toString());
		this.recordAsked(); // Also record as "asked" for rate limiting
		console.info('[PermissionManager] User dismissed prompt');
	}

	/**
	 * User said "never ask again" (future feature)
	 */
	recordNeverAsk(): void {
		localStorage.setItem(this.config.storageKeys.neverAsk, 'true');
		console.info('[PermissionManager] User said never ask again');
	}

	/**
	 * Check if user has posted before
	 */
	hasUserPostedBefore(): boolean {
		return localStorage.getItem(this.config.storageKeys.userHasPosted) === 'true';
	}

	/**
	 * Mark that user has posted
	 */
	markUserHasPosted(): void {
		localStorage.setItem(this.config.storageKeys.userHasPosted, 'true');
	}

	/**
	 * Clear all stored data (for testing or user reset)
	 */
	reset(): void {
		localStorage.removeItem(this.config.storageKeys.lastAsked);
		localStorage.removeItem(this.config.storageKeys.userDismissed);
		localStorage.removeItem(this.config.storageKeys.neverAsk);
		localStorage.removeItem(this.config.storageKeys.userHasPosted);
		console.info('[PermissionManager] Reset all stored data');
	}

	/**
	 * Get diagnostic info for debugging
	 */
	getDiagnostics(): Record<string, unknown> {
		return {
			enabled: this.config.enabled,
			isIOS: this.isIOS(),
			currentPermission: notificationService.safeGetPermission(),
			hasPostedBefore: this.hasUserPostedBefore(),
			userSaidNeverAsk: this.userSaidNeverAsk(),
			askedRecently: this.askedRecently(),
			lastAsked: localStorage.getItem(this.config.storageKeys.lastAsked),
			config: this.config,
		};
	}
}

// Export singleton instance
export const notificationPermissionManager = new NotificationPermissionManager();

// Make it available globally for debugging
if (typeof window !== 'undefined') {
	(window as unknown as { notificationPermissionManager: NotificationPermissionManager }).notificationPermissionManager = notificationPermissionManager;
}
