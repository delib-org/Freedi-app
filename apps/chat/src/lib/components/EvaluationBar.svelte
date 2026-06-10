<script lang="ts">
	import { enhance } from '$app/forms';
	import { fly, scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { t } from '$lib/i18n';

	// 5-emoji face rater (port of the reference EvaluationBar). Collapsed shows the
	// option's 3 aggregate stats — consensus, # evaluators, average vote; clicking
	// expands to the faces. Each face is a real submit button posting to the
	// `evaluate` action, so it works without JS; `use:enhance` re-highlights after.
	let {
		statementId,
		myEvaluation = null,
		consensus = null,
		count = 0,
		average = null,
	}: {
		statementId: string;
		myEvaluation?: number | null;
		/** Consensus / corroboration level C ∈ [0,1]. */
		consensus?: number | null;
		/** Number of evaluators. */
		count?: number;
		/** Average vote ∈ [-1,1]. */
		average?: number | null;
	} = $props();

	const FACES = [
		{ v: -1, e: '😡', label: 'Strongly disagree' },
		{ v: -0.5, e: '😕', label: 'Disagree' },
		{ v: 0, e: '😐', label: 'Neutral' },
		{ v: 0.5, e: '🙂', label: 'Agree' },
		{ v: 1, e: '😍', label: 'Strongly agree' },
	];

	let expanded = $state(false);

	const consensusPct = $derived(consensus === null ? null : Math.round(consensus * 100));
	const consensusTone = $derived(
		consensusPct === null ? 'mid' : consensusPct >= 60 ? 'pos' : consensusPct >= 35 ? 'mid' : 'neg',
	);
	const avgText = $derived(
		average === null ? null : average > 0 ? `+${average.toFixed(2)}` : average.toFixed(2),
	);
	const avgTone = $derived(
		average === null ? 'mid' : average >= 0.18 ? 'pos' : average <= -0.18 ? 'neg' : 'mid',
	);
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
					title={$t(f.label)}
					aria-label={$t(f.label)}
					in:fly={{ x: -8, duration: 180, delay: i * 25 }}
				>{f.e}</button>
			{/each}
		</div>
	{:else}
		<button
			type="button"
			class="eval__summary"
			onclick={() => (expanded = true)}
			title={$t('Vote — shows consensus · evaluators · average vote')}
		>
			{#if consensusPct !== null}
				<span class="eval__metric eval__metric--{consensusTone}">
					<span class="eval__k">{$t('consensus')}</span>{consensusPct}%
				</span>
			{/if}
			{#if count > 0}
				<span class="eval__metric">
					<span class="eval__k">{$t('voters')}</span>{count}
				</span>
				{#if avgText !== null}
					<span class="eval__metric eval__metric--{avgTone}">
						<span class="eval__k">{$t('avg')}</span>{avgText}
					</span>
				{/if}
			{:else}
				<span class="eval__metric eval__metric--rate"><span class="eval__star">☆</span>{$t('Vote')}</span>
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

		&__summary {
			display: inline-flex;
			align-items: center;
			gap: var(--space-sm);
			cursor: pointer;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			padding: 3px 12px;
			font: inherit;
			transition: border-color 0.2s;

			&:hover {
				border-color: var(--accent);
			}
		}
		&__metric {
			display: inline-flex;
			align-items: baseline;
			gap: 4px;
			font-size: 0.74rem;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			color: var(--text-body);

			&--pos {
				color: var(--c-high);
			}
			&--mid {
				color: var(--c-mid);
			}
			&--neg {
				color: var(--c-low);
			}
			&--rate {
				color: var(--text-muted);
				font-weight: 600;
			}
		}
		&__k {
			font-size: 0.6rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--text-muted);
		}
		&__star {
			color: var(--amber);
			font-size: 0.85rem;
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
