<!--
  Per-question follow control with frequency. Collapsed: a Follow button (when
  not subscribed) or a bell showing the current cadence (when subscribed).
  Clicking the bell opens a small frequency popover (Instant / Daily / Weekly /
  Off) plus Unfollow. In-app always works; `Instant` also opts the device into
  push (best-effort — on iOS that needs an installed PWA).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { getSubscriptionState, setQuestionFrequency, type SubscriptionState } from '$lib/push';

	let { statementId }: { statementId: string } = $props();

	let subState = $state<SubscriptionState>('unsubscribed');
	let open = $state(false);
	let busy = $state(false);
	let root = $state<HTMLElement>();

	onMount(async () => {
		subState = await getSubscriptionState(statementId);
	});

	const FREQ_OPTIONS: { value: SubscriptionState; icon: string; label: () => string }[] = [
		{ value: 'instant', icon: '🔔', label: () => $t('Instant') },
		{ value: 'daily', icon: '📅', label: () => $t('Daily') },
		{ value: 'weekly', icon: '🗓️', label: () => $t('Weekly') },
		{ value: 'muted', icon: '🔕', label: () => $t('Off') },
	];

	const collapsedLabel = $derived.by(() => {
		switch (subState) {
			case 'instant':
				return $t('Instant');
			case 'daily':
				return $t('Daily');
			case 'weekly':
				return $t('Weekly');
			case 'muted':
				return $t('Off');
			default:
				return $t('Follow');
		}
	});
	const collapsedIcon = $derived(
		subState === 'unsubscribed' ? '🔕' : subState === 'muted' ? '🔕' : '🔔',
	);
	const isFollowing = $derived(subState !== 'unsubscribed');

	async function apply(next: SubscriptionState) {
		if (busy) return;
		busy = true;
		const previous = subState;
		subState = next; // optimistic
		open = false;
		const result = await setQuestionFrequency(statementId, next);
		if (!result.ok) subState = previous; // revert on failure
		busy = false;
	}

	function onPrimary() {
		if (subState === 'unsubscribed') {
			void apply('instant'); // first follow → sensible default
		} else {
			open = !open;
		}
	}

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="bbell" bind:this={root}>
	<button
		class="bbell__btn"
		class:bbell__btn--on={isFollowing && subState !== 'muted'}
		onclick={onPrimary}
		disabled={busy}
		aria-haspopup="menu"
		aria-expanded={open}
		title={isFollowing ? $t('Change notification frequency') : $t('Get notified of new answers')}
	>
		<span class="bbell__icon" aria-hidden="true">{busy ? '…' : collapsedIcon}</span>
		<span class="bbell__label">{collapsedLabel}</span>
		{#if isFollowing}<span class="bbell__caret" aria-hidden="true">▾</span>{/if}
	</button>

	{#if open}
		<div class="bbell__menu" role="menu">
			<p class="bbell__menu-title">{$t('Notify me')}</p>
			{#each FREQ_OPTIONS as opt (opt.value)}
				<button
					class="bbell__opt"
					class:bbell__opt--active={subState === opt.value}
					role="menuitemradio"
					aria-checked={subState === opt.value}
					onclick={() => apply(opt.value)}
				>
					<span class="bbell__opt-icon" aria-hidden="true">{opt.icon}</span>
					<span>{opt.label()}</span>
					{#if subState === opt.value}<span class="bbell__check" aria-hidden="true">✓</span>{/if}
				</button>
			{/each}
			<button class="bbell__opt bbell__opt--danger" role="menuitem" onclick={() => apply('unsubscribed')}>
				{$t('Unfollow')}
			</button>
		</div>
	{/if}
</div>

<style lang="scss">
	.bbell {
		position: relative;
		display: inline-flex;

		&__btn {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			padding: 0.3rem 0.7rem;
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
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
		}
		&__icon {
			font-size: 0.9rem;
			line-height: 1;
		}
		&__caret {
			font-size: 0.6rem;
			opacity: 0.7;
		}

		&__menu {
			position: absolute;
			top: calc(100% + 6px);
			inset-inline-start: 0;
			z-index: 40;
			min-width: 160px;
			padding: var(--space-xs);
			border-radius: var(--radius-md);
			border: 1px solid var(--glass-border);
			background: var(--bg-card);
			backdrop-filter: blur(var(--glass-blur));
			box-shadow: var(--glass-shadow);
		}
		&__menu-title {
			margin: 0;
			padding: var(--space-xs) var(--space-sm);
			font-size: 0.7rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--text-muted);
		}
		&__opt {
			display: flex;
			align-items: center;
			gap: var(--space-sm);
			width: 100%;
			padding: var(--space-sm);
			border: none;
			border-radius: var(--radius-sm);
			background: transparent;
			color: var(--text-body);
			font-size: 0.85rem;
			text-align: start;
			cursor: pointer;

			&:hover {
				background: var(--bg-muted);
			}
			&--active {
				color: var(--accent);
				font-weight: 600;
			}
			&--danger {
				color: var(--critique);
				border-top: 1px solid var(--glass-border);
				margin-top: var(--space-xs);
			}
		}
		&__opt-icon {
			width: 1.1rem;
			text-align: center;
		}
		&__check {
			margin-inline-start: auto;
		}
	}
</style>
