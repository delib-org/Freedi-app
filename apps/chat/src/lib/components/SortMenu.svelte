<script lang="ts">
	/**
	 * Sort control for the conversation toolbar — the chat-app counterpart to the
	 * main app's `StatementBottomNav` sort menu. A circular toggle pops open a
	 * compact glass panel of sort options with a staggered "pop" animation.
	 *
	 * A radial horizontal fan (the main app's pattern) doesn't fit at the right
	 * end of a crowded mobile toolbar — it would collide with the sibling tool
	 * buttons — so the open state is a right-anchored floating panel instead.
	 */
	import { SORT_OPTIONS, type SortMode } from '$lib/stores/messages';

	let {
		mode,
		onChange,
	}: {
		mode: SortMode;
		onChange: (mode: SortMode) => void;
	} = $props();

	let open = $state(false);
	let el = $state<HTMLElement>();

	function toggle() {
		open = !open;
	}

	function pick(id: SortMode) {
		onChange(id);
		open = false;
	}

	// Close when clicking outside, or on Escape.
	$effect(() => {
		if (!open) return;
		function onDown(e: PointerEvent) {
			if (el && !el.contains(e.target as Node)) open = false;
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') open = false;
		}
		document.addEventListener('pointerdown', onDown);
		document.addEventListener('keydown', onKey);

		return () => {
			document.removeEventListener('pointerdown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

{#snippet icon(id: SortMode)}
	<svg viewBox="0 0 24 24" aria-hidden="true">
		{#if id === 'agreement'}
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
			<path
				d="M8 12l3 3 5-6"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else if id === 'newest'}
			<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
			<path
				d="M12 8v4l3 2"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{:else if id === 'discussed'}
			<path
				d="M4 5h14v10H9l-5 4z"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			<path d="M8 9h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		{/if}
	</svg>
{/snippet}

<div class="sort" class:sort--open={open} bind:this={el}>
	<div class="sort__panel" role="menu" aria-hidden={!open} aria-label="Sort answers">
		{#each SORT_OPTIONS as opt, i (opt.id)}
			<button
				class="sort__item"
				class:selected={mode === opt.id}
				style={`--i:${i}`}
				role="menuitemradio"
				aria-checked={mode === opt.id}
				tabindex={open ? 0 : -1}
				onclick={() => pick(opt.id)}
			>
				<span class="sort__bubble">{@render icon(opt.id)}</span>
				<span class="sort__label">{opt.label}</span>
			</button>
		{/each}
	</div>

	<button
		class="sort__toggle"
		aria-haspopup="menu"
		aria-expanded={open}
		title={open ? 'Close sort' : 'Sort answers'}
		aria-label={open ? 'Close sort' : 'Sort answers'}
		onclick={toggle}
	>
		{#if open}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M6 6l12 12M18 6L6 18"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path
					d="M7 5v14M7 19l-3-3M7 19l3-3M17 19V5M17 5l-3 3M17 5l3 3"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		{/if}
	</button>
</div>

<style lang="scss">
	@use '../../styles/mixins' as *;

	.sort {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.sort__toggle {
		width: 2rem;
		height: 2rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-pill);
		border: 1px solid var(--glass-border);
		background: var(--eval-bg);
		color: var(--text-muted);
		cursor: pointer;
		position: relative;
		z-index: 3;
		transition: color 0.15s, background 0.15s, border-color 0.15s;

		&:hover {
			color: var(--accent);
			border-color: var(--accent);
		}

		svg {
			width: 1rem;
			height: 1rem;
		}
	}

	.sort--open .sort__toggle {
		color: var(--accent);
		border-color: var(--accent);
	}

	// Floating panel anchored to the toggle's right edge, opening up over the row.
	// Opaque glass so it reads cleanly even where it overlaps neighbouring tools.
	.sort__panel {
		position: absolute;
		right: 0;
		bottom: calc(100% + 0.4rem);
		display: flex;
		align-items: stretch;
		gap: 0.15rem;
		padding: 0.3rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--glass-border);
		background: var(--bubble-other, var(--eval-bg));
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
		z-index: 2;
		transform-origin: bottom right;
		opacity: 0;
		transform: translateY(0.4rem) scale(0.92);
		pointer-events: none;
		transition: opacity 0.18s ease, transform 0.22s var(--ease-spring);

		@include glass;
	}

	.sort--open .sort__panel {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	.sort__item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		width: 3.25rem;
		padding: 0.35rem 0.2rem;
		background: none;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		cursor: pointer;
		// Subtle per-item stagger as the panel opens.
		opacity: 0;
		transform: translateY(4px);
		transition: opacity 0.2s ease, transform 0.25s var(--ease-spring), color 0.15s,
			background 0.15s, border-color 0.15s;
		transition-delay: calc(var(--i) * 35ms);

		&:hover {
			color: var(--accent);
			background: var(--eval-bg);
		}
		&.selected {
			color: var(--accent);
			border-color: var(--accent);
			background: var(--eval-bg);
		}
	}

	.sort--open .sort__item {
		opacity: 1;
		transform: translateY(0);
	}

	.sort__bubble {
		display: flex;
		align-items: center;
		justify-content: center;

		svg {
			width: 1.25rem;
			height: 1.25rem;
		}
	}

	.sort__label {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.2px;
		line-height: 1;
		white-space: nowrap;
		color: inherit;
	}

	@media (prefers-reduced-motion: reduce) {
		.sort__panel,
		.sort__item {
			transition: opacity 0.15s ease;
			transform: none;
		}
		.sort--open .sort__panel,
		.sort--open .sort__item {
			transform: none;
		}
	}
</style>
