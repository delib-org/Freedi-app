<!--
  Topbar notification bell. Owns the live notification listener lifecycle, shows
  the unread badge, and toggles the notification center. This is the single
  unified bell — push opt-in lives inside the center, not as a separate control.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { unreadCount, pushToast } from '$lib/stores/notifications';
	import { subscribeToNotifications } from '$lib/notifications';
	import { getPermission, onForegroundMessage } from '$lib/push';
	import type { NotificationType } from '@freedi/shared-types';
	import NotificationCenter from './NotificationCenter.svelte';

	let { uid, seed = [] }: { uid: string; seed?: NotificationType[] } = $props();

	let open = $state(false);
	let root = $state<HTMLElement>();

	function toggle() {
		open = !open;
	}
	function close() {
		open = false;
	}

	function onWindowClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) close();
	}
	function onKey(event: KeyboardEvent) {
		if (event.key === 'Escape') close();
	}

	onMount(() => {
		const stopList = subscribeToNotifications(uid, seed);

		// If push was already granted in a previous session, surface foreground
		// messages as toasts even before the user opens the center.
		let stopFg: (() => void) | undefined;
		if (getPermission() === 'granted') {
			void onForegroundMessage((payload) => {
				pushToast({
					title: payload.notification?.title ?? $t('New activity'),
					body: payload.notification?.body ?? '',
					targetPath: payload.data?.url,
				});
			}).then((fn) => (stopFg = fn));
		}

		return () => {
			stopList();
			stopFg?.();
		};
	});

	const badge = $derived($unreadCount > 99 ? '99+' : String($unreadCount));
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="bell" bind:this={root}>
	<button
		class="bell__btn"
		class:bell__btn--active={open}
		onclick={toggle}
		aria-label={$unreadCount > 0
			? `${$t('Notifications')} (${$unreadCount})`
			: $t('Notifications')}
		aria-haspopup="dialog"
		aria-expanded={open}
		title={$t('Notifications')}
	>
		<span class="bell__icon" aria-hidden="true">🔔</span>
		{#if $unreadCount > 0}
			<span class="bell__badge">{badge}</span>
		{/if}
	</button>

	{#if open}
		<div class="bell__panel">
			<NotificationCenter onClose={close} />
		</div>
	{/if}
</div>

<style lang="scss">
	.bell {
		position: relative;
		display: inline-flex;

		&__btn {
			position: relative;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: transparent;
			border: none;
			cursor: pointer;
			font-size: 1.05rem;
			line-height: 1;
			color: var(--text-muted);
			padding: var(--space-xs);
			border-radius: var(--radius-sm);
			transition: color 0.15s ease;

			&:hover,
			&--active {
				color: var(--accent);
			}
		}
		&__icon {
			pointer-events: none;
		}
		&__badge {
			position: absolute;
			top: -2px;
			inset-inline-end: -2px;
			min-width: 16px;
			height: 16px;
			padding: 0 4px;
			border-radius: var(--radius-pill);
			background: var(--critique);
			color: #fff;
			font-size: 0.62rem;
			font-weight: 700;
			line-height: 16px;
			text-align: center;
			pointer-events: none;
		}

		&__panel {
			position: absolute;
			top: calc(100% + 8px);
			inset-inline-end: 0;
			z-index: 60;
		}
	}
</style>
