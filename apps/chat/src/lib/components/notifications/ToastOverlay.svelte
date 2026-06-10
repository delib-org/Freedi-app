<!--
  Renders transient foreground toasts (a push that arrived while the tab is
  focused — FCM doesn't auto-display those). Auto-dismisses; clicking navigates
  to the discussion. Mounted once in the layout.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toasts, dismissToast, type Toast } from '$lib/stores/notifications';

	const AUTO_DISMISS_MS = 6000;
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	// Schedule auto-dismiss for any toast we haven't seen yet.
	$effect(() => {
		for (const toast of $toasts) {
			if (!timers.has(toast.id)) {
				timers.set(
					toast.id,
					setTimeout(() => {
						dismissToast(toast.id);
						timers.delete(toast.id);
					}, AUTO_DISMISS_MS),
				);
			}
		}
	});

	onMount(() => () => {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
	});

	async function onClick(toast: Toast) {
		dismissToast(toast.id);
		if (toast.targetPath) await goto(toast.targetPath);
	}
</script>

<div class="toasts" aria-live="polite" aria-atomic="false">
	{#each $toasts as toast (toast.id)}
		<div class="toasts__item">
			<button class="toasts__main" onclick={() => onClick(toast)}>
				<span class="toasts__title">{toast.title}</span>
				{#if toast.body}
					<span class="toasts__body">{toast.body}</span>
				{/if}
			</button>
			<button
				class="toasts__close"
				onclick={() => dismissToast(toast.id)}
				aria-label="Dismiss"
			>×</button>
		</div>
	{/each}
</div>

<style lang="scss">
	@use '../../../styles/mixins' as *;

	.toasts {
		position: fixed;
		inset-block-end: var(--space-md);
		inset-inline-end: var(--space-md);
		z-index: 80;
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		max-width: min(360px, calc(100vw - 24px));
		pointer-events: none;

		&__item {
			@include glass;
			pointer-events: auto;
			display: flex;
			align-items: stretch;
			gap: var(--space-xs);
			border-radius: var(--radius-md);
			border-inline-start: 3px solid var(--accent);
			overflow: hidden;
			animation: toast-in 0.25s var(--ease-spring);
		}

		&__main {
			flex: 1;
			display: flex;
			flex-direction: column;
			gap: 2px;
			text-align: start;
			background: transparent;
			border: none;
			cursor: pointer;
			padding: var(--space-sm) var(--space-md);
			color: var(--text-body);
		}
		&__title {
			font-size: 0.85rem;
			font-weight: 700;
		}
		&__body {
			font-size: 0.8rem;
			color: var(--text-muted);
			display: -webkit-box;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			-webkit-box-orient: vertical;
			overflow: hidden;
		}

		&__close {
			flex: 0 0 auto;
			background: transparent;
			border: none;
			color: var(--text-muted);
			font-size: 1.1rem;
			line-height: 1;
			cursor: pointer;
			padding: var(--space-xs) var(--space-sm);

			&:hover {
				color: var(--text-body);
			}
		}
	}

	@keyframes toast-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toasts__item {
			animation: none;
		}
	}
</style>
