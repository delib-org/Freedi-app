<script lang="ts">
	/**
	 * Radial fan-out sort menu — the chat-app counterpart to the main app's
	 * `StatementBottomNav` sort control. A circular toggle button fans the sort
	 * options out to the left with a spin + slide, exactly like the main app.
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

	// Close when clicking anywhere outside the menu.
	$effect(() => {
		if (!open) return;
		function onDown(e: PointerEvent) {
			if (el && !el.contains(e.target as Node)) open = false;
		}
		document.addEventListener('pointerdown', onDown);

		return () => document.removeEventListener('pointerdown', onDown);
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
	<div class="sort__items" aria-hidden={!open}>
		{#each SORT_OPTIONS as opt, i (opt.id)}
			<button
				class="sort__item sort__item--{i + 1}"
				class:selected={mode === opt.id}
				tabindex={open ? 0 : -1}
				title={`Sort by ${opt.label}`}
				onclick={() => pick(opt.id)}
			>
				<span class="sort__bubble">{@render icon(opt.id)}</span>
				<span class="sort__label">{opt.label}</span>
			</button>
		{/each}
	</div>

	<button
		class="sort__toggle"
		aria-haspopup="true"
		aria-expanded={open}
		title={open ? 'Close sort' : 'Sort'}
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
	.sort {
		--sort-gap: 3.5rem;
		position: relative;
		display: inline-flex;
		align-items: center;

		@media (max-width: 480px) {
			--sort-gap: 3rem;
		}
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
		z-index: 2;
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

	// Zero-height anchor pinned to the toggle's left edge so the fanned items
	// overlay empty space without disturbing the toolbar layout.
	.sort__items {
		position: absolute;
		right: 100%;
		top: 50%;
		height: 0;
		width: 0;
	}

	.sort__item {
		position: absolute;
		right: 0;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 0;
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		opacity: 0;
		pointer-events: none;
		transform: translateY(-50%) scale(0.4);
		transition:
			right 450ms var(--ease-spring),
			transform 500ms var(--ease-spring),
			opacity 250ms ease;

		&:hover .sort__bubble,
		&.selected .sort__bubble {
			color: var(--accent);
			border-color: var(--accent);
		}
		&.selected .sort__bubble {
			background: var(--eval-bg);
			box-shadow: 0 0 0 2px var(--accent) inset;
		}
	}

	.sort--open .sort__item {
		opacity: 1;
		pointer-events: auto;
		transform: translateY(-50%) scale(1) rotate(360deg);

		&--1 {
			right: calc(var(--sort-gap) * 1);
		}
		&--2 {
			right: calc(var(--sort-gap) * 2);
		}
		&--3 {
			right: calc(var(--sort-gap) * 3);
		}
	}

	.sort__bubble {
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--eval-bg);
		border: 1px solid var(--glass-border);
		transition: color 0.15s, background 0.15s, border-color 0.15s;

		svg {
			width: 1.05rem;
			height: 1.05rem;
		}
	}

	.sort__label {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.3px;
		white-space: nowrap;
		color: inherit;
	}

	@media (prefers-reduced-motion: reduce) {
		.sort__item {
			transition: opacity 200ms ease;
			transform: translateY(-50%) scale(1);
		}
		.sort--open .sort__item {
			transform: translateY(-50%) scale(1);
		}
	}
</style>
