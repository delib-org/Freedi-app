<!--
  Notification center panel. Lists the user's in-app notifications, lets them
  mark all read, and surfaces push opt-in as a banner *inside* the center (one
  unified bell — there is no separate push toggle in the topbar). A footer links
  to full notification settings.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { notifications, unreadCount } from '$lib/stores/notifications';
	import { markAllNotificationsRead, markNotificationsRead } from '$lib/notifications';
	import { enablePush, getPermission, getPushSupport, onForegroundMessage } from '$lib/push';
	import { pushToast } from '$lib/stores/notifications';
	import type { NotificationType } from '@freedi/shared-types';
	import NotificationCard from './NotificationCard.svelte';
	import PermissionPrimer from './PermissionPrimer.svelte';
	import InstallPwaSheet from './InstallPwaSheet.svelte';

	let { onClose }: { onClose: () => void } = $props();

	type PushState = 'idle' | 'working' | 'granted' | 'denied' | 'needs-install' | 'unsupported' | 'error';
	let pushState = $state<PushState>('idle');
	let showPrimer = $state(false);
	let showInstall = $state(false);

	// Decide whether to show the push opt-in banner.
	$effect(() => {
		const support = getPushSupport();
		if (!support.supported) {
			pushState = support.reason === 'ios-needs-install' ? 'needs-install' : 'unsupported';

			return;
		}
		pushState = getPermission() === 'granted' ? 'granted' : getPermission() === 'denied' ? 'denied' : 'idle';
	});

	// Soft pre-prompt before the irreversible native dialog; iOS gets install help.
	function requestEnable() {
		if (pushState === 'working' || pushState === 'granted') return;
		const support = getPushSupport();
		if (!support.supported && support.reason === 'ios-needs-install') {
			showInstall = true;

			return;
		}
		showPrimer = true;
	}

	async function enable() {
		showPrimer = false;
		if (pushState === 'working' || pushState === 'granted') return;
		pushState = 'working';
		const result = await enablePush();
		if (result.ok) {
			pushState = 'granted';
			void onForegroundMessage((payload) => {
				pushToast({
					title: payload.notification?.title ?? $t('New activity'),
					body: payload.notification?.body ?? '',
					targetPath: payload.data?.url,
				});
			});
		} else if (result.reason === 'permission-denied') {
			pushState = 'denied';
		} else if (result.reason === 'ios-needs-install') {
			pushState = 'needs-install';
		} else {
			pushState = 'error';
		}
	}

	async function onNavigate(n: NotificationType) {
		if (!n.read) void markNotificationsRead([n.notificationId]);
		onClose();
		await goto(n.targetPath ?? `/q/${n.parentId}`);
	}

	function onMarkAll() {
		void markAllNotificationsRead();
	}
</script>

<div class="ncenter" role="dialog" aria-label={$t('Notifications')}>
	<header class="ncenter__head">
		<h2 class="ncenter__title">{$t('Notifications')}</h2>
		{#if $unreadCount > 0}
			<button class="ncenter__action" onclick={onMarkAll}>{$t('Mark all read')}</button>
		{/if}
	</header>

	{#if pushState === 'idle'}
		<div class="ncenter__banner">
			<span class="ncenter__banner-text"
				>{$t('Get notified when people respond to discussions you follow.')}</span
			>
			<button class="ncenter__banner-btn" onclick={requestEnable}>{$t('Turn on push')}</button>
		</div>
	{:else if pushState === 'working'}
		<div class="ncenter__banner">
			<span class="ncenter__banner-text">{$t('Enabling…')}</span>
		</div>
	{:else if pushState === 'needs-install'}
		<div class="ncenter__banner">
			<span class="ncenter__banner-text"
				>{$t('Install the app to your home screen to get push notifications.')}</span
			>
			<button class="ncenter__banner-btn" onclick={() => (showInstall = true)}>{$t('How?')}</button>
		</div>
	{:else if pushState === 'denied'}
		<div class="ncenter__banner ncenter__banner--muted">
			<span class="ncenter__banner-text"
				>{$t('Push is blocked in your browser settings. You can still see notifications here.')}</span
			>
		</div>
	{/if}

	<div class="ncenter__list">
		{#if $notifications.length === 0}
			<div class="ncenter__empty">
				<span class="ncenter__empty-icon" aria-hidden="true">🔔</span>
				<p class="ncenter__empty-title">{$t('You’re all caught up')}</p>
				<p class="ncenter__empty-sub">
					{$t('Follow a discussion and we’ll let you know when your input is needed.')}
				</p>
			</div>
		{:else}
			{#each $notifications as n (n.notificationId)}
				<NotificationCard notification={n} {onNavigate} />
			{/each}
		{/if}
	</div>

	<footer class="ncenter__foot">
		<a class="ncenter__settings" href="/settings/notifications" onclick={onClose}>
			{$t('Notification settings')}
		</a>
	</footer>
</div>

{#if showPrimer}
	<PermissionPrimer onAllow={enable} onDismiss={() => (showPrimer = false)} />
{/if}
{#if showInstall}
	<InstallPwaSheet onClose={() => (showInstall = false)} />
{/if}

<style lang="scss">
	@use '../../../styles/mixins' as *;

	.ncenter {
		@include glass;
		display: flex;
		flex-direction: column;
		width: min(360px, calc(100vw - 24px));
		max-height: min(560px, calc(100vh - 80px));
		border-radius: var(--radius-md);
		overflow: hidden;

		&__head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: var(--space-sm) var(--space-md);
			border-bottom: 1px solid var(--glass-border);
		}
		&__title {
			font-size: 0.95rem;
			font-weight: 700;
			margin: 0;
		}
		&__action {
			background: transparent;
			border: none;
			color: var(--accent);
			font-size: 0.8rem;
			font-weight: 600;
			cursor: pointer;
			padding: var(--space-xs);
			border-radius: var(--radius-sm);

			&:hover {
				background: var(--bg-muted);
			}
		}

		&__banner {
			display: flex;
			align-items: center;
			gap: var(--space-sm);
			padding: var(--space-sm) var(--space-md);
			background: var(--question-soft);
			border-bottom: 1px solid var(--glass-border);

			&--muted {
				background: var(--bg-muted);
			}
		}
		&__banner-text {
			font-size: 0.78rem;
			color: var(--text-body);
			flex: 1;
		}
		&__banner-btn {
			@include pill-button;
			flex: 0 0 auto;
			font-size: 0.76rem;
			padding: 5px 12px;
			background: var(--accent-gradient);
			color: #fff;
			border: none;
		}

		&__list {
			flex: 1;
			overflow-y: auto;
		}

		&__empty {
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			gap: var(--space-xs);
			padding: var(--space-xl) var(--space-md);
		}
		&__empty-icon {
			font-size: 1.6rem;
			opacity: 0.7;
		}
		&__empty-title {
			font-weight: 700;
			margin: 0;
			font-size: 0.9rem;
		}
		&__empty-sub {
			margin: 0;
			font-size: 0.8rem;
			color: var(--text-muted);
			max-width: 240px;
		}

		&__foot {
			padding: var(--space-sm) var(--space-md);
			border-top: 1px solid var(--glass-border);
			text-align: center;
		}
		&__settings {
			font-size: 0.8rem;
			font-weight: 600;
			color: var(--text-muted);

			&:hover {
				color: var(--accent);
				text-decoration: none;
			}
		}
	}
</style>
