<!--
  Per-question push opt-in. Lets a signed-in user follow THIS question so the
  `fn_notifications` function pushes them when new answers/evidence are posted.
  Shown only when web push is available on this browser/context.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import {
		followQuestion,
		unfollowQuestion,
		getFollowStatus,
		getPushSupport,
		onForegroundMessage,
	} from '$lib/push';

	let { statementId }: { statementId: string } = $props();

	let supported = $state(false);
	let needsInstall = $state(false);
	let following = $state(false);
	let busy = $state(false);
	let hint = $state('');

	onMount(async () => {
		const support = getPushSupport();
		if (!support.supported) {
			needsInstall = support.reason === 'ios-needs-install';

			return;
		}
		supported = true;
		following = await getFollowStatus(statementId);
		if (following) wireForeground();
	});

	function wireForeground() {
		void onForegroundMessage((payload) => {
			const title = payload.notification?.title ?? $t('New activity');
			const body = payload.notification?.body ?? '';
			new Notification(title, { body, icon: '/icons/wizcol-chat-192.png' });
		});
	}

	async function toggle() {
		if (busy) return;
		busy = true;
		hint = '';

		const result = following
			? await unfollowQuestion(statementId)
			: await followQuestion(statementId);

		if (result.ok) {
			following = result.following;
			if (following) wireForeground();
		} else if (result.reason === 'permission-denied') {
			hint = $t('Allow notifications in your browser to follow this question.');
		} else if (result.reason === 'ios-needs-install') {
			needsInstall = true;
		} else if (result.reason === 'missing-vapid-key') {
			hint = $t('Push is not configured for this environment.');
		} else {
			hint = $t('Could not update notifications. Please try again.');
		}

		busy = false;
	}
</script>

{#if needsInstall}
	<p class="follow-hint muted">{$t('Install the app to get notifications for this question.')}</p>
{:else if supported}
	<button
		class="follow"
		class:follow--on={following}
		onclick={toggle}
		disabled={busy}
		aria-pressed={following}
		title={hint || (following ? $t('You are following this question') : $t('Get notified of new answers'))}
	>
		<span class="follow__icon" aria-hidden="true">{following ? '🔔' : '🔕'}</span>
		<span class="follow__label">
			{busy ? '…' : following ? $t('Following') : $t('Follow')}
		</span>
	</button>
	{#if hint}
		<span class="follow-hint muted">{hint}</span>
	{/if}
{/if}

<style lang="scss">
	.follow {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs, 0.35rem);
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--border, rgba(127, 127, 127, 0.3));
		border-radius: 999px;
		background: transparent;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;

		&:hover:not(:disabled) {
			color: var(--accent);
			border-color: var(--accent);
		}

		&:disabled {
			cursor: default;
			opacity: 0.7;
		}

		&--on {
			color: var(--accent);
			border-color: var(--accent);
			background: color-mix(in srgb, var(--accent) 10%, transparent);
		}

		&__icon {
			font-size: 0.9rem;
			line-height: 1;
		}
	}

	.follow-hint {
		display: inline-block;
		margin-inline-start: 0.5rem;
		font-size: 0.75rem;
	}
</style>
