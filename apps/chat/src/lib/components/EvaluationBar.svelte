<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';

	// 5-emoji face rater (port of the reference EvaluationBar). Collapsed shows the
	// current vote (or a "Rate" affordance); clicking expands to the faces. Each
	// face is a real submit button posting to the `evaluate` action, so it works
	// without JS; `use:enhance` keeps it smooth + re-highlights after voting.
	let {
		statementId,
		myEvaluation = null,
	}: { statementId: string; myEvaluation?: number | null } = $props();

	const FACES = [
		{ v: -1, e: '😡', label: 'Strongly disagree' },
		{ v: -0.5, e: '😕', label: 'Disagree' },
		{ v: 0, e: '😐', label: 'Neutral' },
		{ v: 0.5, e: '🙂', label: 'Agree' },
		{ v: 1, e: '😍', label: 'Strongly agree' },
	];

	let expanded = $state(false);
	const current = $derived(FACES.find((f) => f.v === myEvaluation) ?? null);
</script>

<form
	method="POST"
	action="?/evaluate"
	class="eval"
	use:enhance={() => {
		return async ({ update }) => {
			expanded = false;
			await update();
		};
	}}
	onmouseleave={() => (expanded = false)}
>
	<input type="hidden" name="statementId" value={statementId} />

	{#if expanded}
		<div class="eval__faces" in:scale={{ duration: 200, start: 0.85, easing: backOut }}>
			{#each FACES as f, i (f.v)}
				<button
					class="eval__face"
					class:active={myEvaluation === f.v}
					name="value"
					value={f.v}
					title={f.label}
					aria-label={f.label}
					in:fly={{ x: -8, duration: 180, delay: i * 25 }}
				>{f.e}</button>
			{/each}
		</div>
	{:else}
		<button
			type="button"
			class="eval__trigger"
			class:voted={current}
			onclick={() => (expanded = true)}
			title="Rate this"
		>
			{#if current}
				<span class="eval__current">{current.e}</span>
			{:else}
				<span class="eval__star">☆</span><span class="eval__label">Rate</span>
			{/if}
		</button>
	{/if}
</form>

<style lang="scss">
	.eval {
		display: inline-flex;
		align-items: center;
		margin: 0;
		min-height: 30px;

		&__trigger {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			cursor: pointer;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			padding: 3px 10px;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.7rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			transition: all 0.2s;

			&:hover {
				background: var(--eval-btn);
				border-color: var(--accent);
				color: var(--accent);
			}
			&.voted {
				padding: 2px 8px;
			}
		}
		&__star {
			color: var(--amber);
			font-size: 0.85rem;
		}
		&__current {
			font-size: 1rem;
			filter: grayscale(0);
		}

		&__faces {
			display: inline-flex;
			gap: 3px;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			padding: 3px;
		}
		&__face {
			width: 28px;
			height: 28px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border: 1px solid transparent;
			border-radius: var(--radius-pill);
			background: transparent;
			cursor: pointer;
			font-size: 0.95rem;
			filter: grayscale(0.45);
			transition: transform 0.12s var(--ease-spring), filter 0.2s, background 0.2s;

			&:hover {
				transform: scale(1.25);
				filter: grayscale(0);
				z-index: 2;
			}
			&.active {
				filter: grayscale(0);
				background: var(--eval-btn);
				border-color: var(--accent);
			}
		}
	}
</style>
