<!--
  Bell toggle for enabling web push (FCM). Only shown to signed-in users on
  browsers that can receive push. Calls `enablePush()` from the click handler
  (a user gesture) so the permission prompt isn't blocked. On iOS it nudges the
  user to install the PWA first, since iOS only allows push from the home-screen
  app.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import {
		enablePush,
		getPermission,
		getPushSupport,
		onForegroundMessage,
	} from '$lib/push';

	type Status = 'idle' | 'working' | 'granted' | 'denied' | 'needs-install' | 'unsupported' | 'error';

	let status = $state<Status>('idle');
	let message = $state('');

	onMount(() => {
		const support = getPushSupport();
		if (!support.supported) {
			status = support.reason === 'ios-needs-install' ? 'needs-install' : 'unsupported';

			return;
		}

		const permission = getPermission();
		if (permission === 'granted') {
			status = 'granted';
			// Surface notifications that arrive while the tab is focused.
			void onForegroundMessage((payload) => {
				const title = payload.notification?.title ?? $t('New activity');
				const body = payload.notification?.body ?? '';
				new Notification(title, { body, icon: '/icons/wizcol-chat-192.png' });
			});
		} else if (permission === 'denied') {
			status = 'denied';
		}
	});

	async function onClick() {
		if (status === 'working' || status === 'granted') return;
		status = 'working';
		message = '';

		const result = await enablePush();
		if (result.ok) {
			status = 'granted';
			void onForegroundMessage((payload) => {
				const title = payload.notification?.title ?? $t('New activity');
				const body = payload.notification?.body ?? '';
				new Notification(title, { body, icon: '/icons/wizcol-chat-192.png' });
			});
		} else if (result.reason === 'permission-denied') {
			status = 'denied';
		} else if (result.reason === 'ios-needs-install') {
			status = 'needs-install';
		} else if (result.reason === 'missing-vapid-key') {
			status = 'error';
			message = $t('Push is not configured for this environment.');
		} else {
			status = 'error';
			message = $t('Could not enable notifications. Please try again.');
		}
	}

	const label = $derived(
		status === 'granted'
			? $t('Notifications on')
			: status === 'denied'
				? $t('Notifications blocked')
				: status === 'needs-install'
					? $t('Install the app to get notifications')
					: $t('Enable notifications'),
	);

	const icon = $derived(status === 'granted' ? '🔔' : status === 'denied' ? '🔕' : '🔔');
</script>

{#if status !== 'unsupported'}
	<button
		class="push-toggle"
		class:push-toggle--on={status === 'granted'}
		onclick={onClick}
		disabled={status === 'working' || status === 'granted' || status === 'denied'}
		title={message || label}
		aria-label={label}
	>
		<span class="push-toggle__icon">{status === 'working' ? '…' : icon}</span>
	</button>
{/if}

<style lang="scss">
	.push-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 1.05rem;
		line-height: 1;
		color: var(--text-muted);
		padding: var(--space-xs, 0.25rem);
		border-radius: 8px;
		transition: color 0.15s ease, opacity 0.15s ease;

		&:hover:not(:disabled) {
			color: var(--accent);
		}

		&:disabled {
			cursor: default;
		}

		&--on {
			color: var(--accent);
			opacity: 1;
		}

		&__icon {
			pointer-events: none;
		}
	}
</style>
