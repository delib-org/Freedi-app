<!--
  One notification row. Shows who acted, on which question, and the message —
  framed as a call to come back and respond, not just "new activity". Clicking
  navigates to the discussion and marks the notification read.
-->
<script lang="ts">
	import { t, tp } from '$lib/i18n';
	import { StatementType, type NotificationType } from '@freedi/shared-types';

	let { notification, onNavigate }: {
		notification: NotificationType;
		onNavigate: (n: NotificationType) => void;
	} = $props();

	const href = $derived(notification.targetPath ?? `/q/${notification.parentId}`);

	const initial = $derived((notification.creatorName ?? '?').trim().charAt(0).toUpperCase() || '?');

	// A contribution-oriented label for what happened, by statement type.
	const actionLabel = $derived.by(() => {
		switch (notification.statementType) {
			case StatementType.option:
				return $t('proposed an answer');
			case StatementType.statement:
				return $t('added evidence');
			case StatementType.question:
				return $t('asked a follow-up');
			default:
				return $t('replied');
		}
	});

	function relativeTime(ms: number): string {
		const diff = Date.now() - ms;
		const sec = Math.round(diff / 1000);
		if (sec < 60) return $t('just now');
		const min = Math.round(sec / 60);
		if (min < 60) return $tp('{{n}}m ago', { n: min });
		const hr = Math.round(min / 60);
		if (hr < 24) return $tp('{{n}}h ago', { n: hr });
		const day = Math.round(hr / 24);
		if (day < 7) return $tp('{{n}}d ago', { n: day });
		const wk = Math.round(day / 7);

		return $tp('{{n}}w ago', { n: wk });
	}
</script>

<a
	class="ncard"
	class:ncard--unread={!notification.read}
	{href}
	onclick={() => onNavigate(notification)}
>
	{#if !notification.read}
		<span class="ncard__dot" aria-hidden="true"></span>
	{/if}

	<span class="ncard__avatar" aria-hidden="true">
		{#if notification.creatorImage}
			<img class="ncard__img" src={notification.creatorImage} alt="" />
		{:else}
			{initial}
		{/if}
	</span>

	<span class="ncard__body">
		<span class="ncard__head">
			<span class="ncard__name">{notification.creatorName}</span>
			<span class="ncard__action">{actionLabel}</span>
			<span class="ncard__time">· {relativeTime(notification.createdAt)}</span>
		</span>
		{#if notification.parentStatement}
			<span class="ncard__context">{notification.parentStatement}</span>
		{/if}
		<span class="ncard__text">{notification.text}</span>
	</span>
</a>

<style lang="scss">
	.ncard {
		position: relative;
		display: flex;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		padding-inline-start: var(--space-lg);
		color: var(--text-body);
		border-bottom: 1px solid var(--glass-border);
		transition: background 0.15s ease;

		&:hover {
			text-decoration: none;
			background: var(--bg-muted);
		}

		&--unread {
			background: var(--question-soft);
		}

		&__dot {
			position: absolute;
			inset-inline-start: var(--space-sm);
			top: 50%;
			transform: translateY(-50%);
			width: 8px;
			height: 8px;
			border-radius: var(--radius-pill);
			background: var(--accent);
		}

		&__avatar {
			flex: 0 0 auto;
			width: 32px;
			height: 32px;
			border-radius: var(--radius-pill);
			background: var(--accent-gradient);
			color: #fff;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			font-size: 0.8rem;
			font-weight: 700;
			overflow: hidden;
		}
		&__img {
			width: 100%;
			height: 100%;
			object-fit: cover;
		}

		&__body {
			display: flex;
			flex-direction: column;
			gap: 2px;
			min-width: 0;
		}

		&__head {
			font-size: 0.82rem;
			line-height: 1.3;
		}
		&__name {
			font-weight: 700;
		}
		&__action {
			color: var(--text-muted);
		}
		&__time {
			color: var(--text-muted);
			white-space: nowrap;
		}

		&__context {
			font-size: 0.78rem;
			color: var(--question);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__text {
			font-size: 0.85rem;
			color: var(--text-body);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}
	}
</style>
