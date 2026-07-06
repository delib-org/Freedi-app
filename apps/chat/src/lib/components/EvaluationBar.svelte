<script lang="ts">
	import { enhance } from '$app/forms';
	import { scale, fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { t, tp } from '$lib/i18n';
	import { getEvaluationScale, type RatingMode } from '@freedi/shared-types';
	import {
		applyOptimistic,
		revertOptimistic,
		viewEvaluation,
		type EvalBase,
	} from '$lib/stores/evaluations.svelte';

	// 5-emoji face rater (port of the reference EvaluationBar). Collapsed shows the
	// option's aggregate stats — the average vote as a signed −100→+100 dial (the
	// headline, value inside the ring), then C_p (consensus %) and the evaluator
	// count as two side numbers; clicking expands to the faces. Each face is a real
	// submit button posting to the `evaluate` action; `use:enhance` applies the
	// vote optimistically (instant dial/C_p/count) and lets the realtime recompute
	// reconcile — no full-page reload.
	let {
		statementId,
		myEvaluation = null,
		consensus = null,
		count = 0,
		average = null,
		leaf = true,
		ratingMode = undefined,
	}: {
		statementId: string;
		myEvaluation?: number | null;
		/** Consensus / corroboration level C_p ∈ [0,1]. */
		consensus?: number | null;
		/** Number of evaluators. */
		count?: number;
		/** Average vote ∈ [-1,1]. */
		average?: number | null;
		/** Option has no direct evidence children — lets C_p be projected exactly. */
		leaf?: boolean;
		/** Evaluation mode from the question's statementSettings. 'reactions' →
		 *  positive-only 0..1 emoji scale; undefined/'agree-disagree' → signed faces. */
		ratingMode?: RatingMode;
	} = $props();

	// Agree-disagree (default) keeps the app's original signed face row exactly.
	// 'reactions' uses the shared cross-app positive-only emoji scale (values 0..1)
	// so the chat renders the same reactions as every other app.
	const AGREE_DISAGREE_FACES = [
		{ v: -1, e: '😡', label: 'Strongly disagree' },
		{ v: -0.5, e: '😕', label: 'Disagree' },
		{ v: 0, e: '😐', label: 'Neutral' },
		{ v: 0.5, e: '🙂', label: 'Agree' },
		{ v: 1, e: '😍', label: 'Strongly agree' },
	];

	const FACES = $derived(
		ratingMode === 'reactions'
			? getEvaluationScale('reactions').map((entry) => ({
					v: entry.value,
					e: entry.emoji,
					label: entry.labelKey,
				}))
			: AGREE_DISAGREE_FACES,
	);

	let expanded = $state(false);

	// Server stats → optimistic projection. `view` is reactive to the store, so a
	// click updates C_p / average / count here before the server round-trips.
	const base = $derived<EvalBase>({ myVote: myEvaluation, count, average, consensus });
	const view = $derived(viewEvaluation(statementId, base, leaf));

	const myVote = $derived(view.myVote);

	// Headline dial = the average vote on a signed −100→+100 scale; the value lives
	// inside the ring. The arc fills 0→full across that range ((avg+1)/2), so −100
	// reads empty, 0 half, +100 full; colour carries the sign.
	const avgInt = $derived(view.average === null ? null : Math.round(view.average * 100));
	const avgText = $derived(avgInt === null ? null : avgInt > 0 ? `+${avgInt}` : `${avgInt}`);
	const avgTone = $derived(
		view.average === null ? 'mid' : view.average >= 0.18 ? 'pos' : view.average <= -0.18 ? 'neg' : 'mid',
	);

	// Side number = consensus C_p as a percentage (0–100%).
	const consensusPct = $derived(view.consensus === null ? null : Math.round(view.consensus * 100));
	const consensusTone = $derived(
		consensusPct === null ? 'mid' : consensusPct >= 60 ? 'pos' : consensusPct >= 35 ? 'mid' : 'neg',
	);

	// Arc meter: r=12 → circumference 2π·12 ≈ 75.4. Dash length tracks the dial.
	const RING_C = 75.4;
	const ringDash = $derived(view.average === null ? 0 : ((view.average + 1) / 2) * RING_C);

	// Pulse a metric only when its value *changes* after mount — never on the
	// initial render (which would set every option pulsing at once on page load).
	// The dial also smoothly animates its arc via a CSS dasharray transition, so
	// its pulse is just a confirming scale.
	let avgPulse = $state(false);
	let cPulse = $state(false);
	let nPulse = $state(false);
	let prev: { c: number | null; a: number | null; n: number } | null = null;
	function flash(set: (v: boolean) => void): void {
		set(true);
		setTimeout(() => set(false), 450);
	}
	$effect(() => {
		const c = view.consensus;
		const a = view.average;
		const n = view.count;
		if (prev) {
			if (a !== prev.a) flash((v) => (avgPulse = v));
			if (c !== prev.c) flash((v) => (cPulse = v));
			if (n !== prev.n) flash((v) => (nPulse = v));
		}
		prev = { c, a, n };
	});
</script>

<form
	method="POST"
	action="?/evaluate"
	class="eval"
	use:enhance={({ formData }) => {
		const value = Number(formData.get('value') ?? 0);
		// Project locally before the network — instant feedback.
		applyOptimistic(statementId, value, base);
		expanded = false;

		return async ({ result }) => {
			// Redirect (anonymous → sign-in) or a failure: roll the projection back
			// and let SvelteKit handle the navigation. Success: keep the projection;
			// the realtime recompute will reconcile it. No `update()` — no reload.
			if (result.type === 'failure' || result.type === 'error') {
				revertOptimistic(statementId);
			} else if (result.type === 'redirect') {
				revertOptimistic(statementId);
				const { goto } = await import('$app/navigation');
				await goto(result.location);
			}
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
					class:active={myVote === f.v}
					name="value"
					value={f.v}
					title={$t(f.label)}
					aria-label={$t(f.label)}
					aria-pressed={myVote === f.v}
					in:fly={{ x: -8, duration: 180, delay: i * 25 }}
				>
					<span class="eval__face-emoji" aria-hidden="true">{f.e}</span>
				</button>
			{/each}
		</div>
	{:else}
		<button
			type="button"
			class="eval__summary"
			onclick={() => (expanded = true)}
			title={$t('Vote — shows average vote · consensus · evaluators')}
		>
			{#if avgText !== null || consensusPct !== null}
				{#if avgText !== null}
					<span
						class="eval__dial eval__dial--{avgTone}"
						class:eval__dial--pulse={avgPulse}
						aria-label={$tp('Average evaluation {{value}} (−100…+100)', { value: avgText })}
					>
						<span class="eval__ring" aria-hidden="true">
							<svg viewBox="0 0 32 32">
								<circle class="eval__ring-track" cx="16" cy="16" r="12" />
								<circle
									class="eval__ring-fill"
									cx="16"
									cy="16"
									r="12"
									stroke-dasharray="{ringDash} {RING_C}"
								/>
							</svg>
							<span class="eval__ring-label">{avgText}</span>
						</span>
					</span>
				{/if}

				{#if consensusPct !== null}
					{#if avgText !== null}<span class="eval__sep" aria-hidden="true"></span>{/if}
					<span
						class="eval__metric eval__metric--{consensusTone}"
						class:eval__metric--pulse={cPulse}
					>
						<span class="eval__k">C_p</span>
						<span class="eval__v">{consensusPct}%</span>
					</span>
				{/if}

				{#if view.count > 0}
					<span class="eval__sep" aria-hidden="true"></span>
					<span
						class="eval__metric eval__metric--neutral"
						class:eval__metric--pulse={nPulse}
					>
						<span class="eval__k">{$t('voters')}</span>
						<span class="eval__v">{view.count}</span>
					</span>
				{/if}
			{:else}
				<span class="eval__metric eval__metric--rate">
					<span class="eval__star">☆</span>{$t('Vote')}
				</span>
			{/if}
		</button>
	{/if}
</form>

<style lang="scss">
	@keyframes eval-pulse {
		0% {
			transform: scale(1);
		}
		35% {
			transform: scale(1.08);
		}
		100% {
			transform: scale(1);
		}
	}

	.eval {
		display: inline-flex;
		align-items: center;
		margin: 0;
		min-height: 30px;

		// ── Collapsed summary pill ──────────────────────────────────────────────
		&__summary {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			cursor: pointer;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			padding: 2px 10px 2px 4px;
			font: inherit;
			transition: border-color 0.2s, background 0.2s;

			&:hover {
				border-color: var(--accent);
			}
			&:focus-visible {
				outline: none;
				border-color: var(--accent);
				box-shadow: 0 0 0 2px var(--accent);
			}
		}

		// ── Dial: average vote as a signed −100→+100 ring ───────────────────────
		&__dial {
			display: inline-flex;
			align-items: center;

			--ring: var(--c-mid);
			&--pos {
				--ring: var(--c-high);
			}
			&--mid {
				--ring: var(--c-mid);
			}
			&--neg {
				--ring: var(--c-low);
			}
			&--pulse {
				animation: eval-pulse 420ms var(--ease-spring);
			}
		}

		&__ring {
			position: relative;
			width: 30px;
			height: 30px;
			flex-shrink: 0;

			svg {
				width: 100%;
				height: 100%;
				transform: rotate(-90deg);
			}
		}
		&__ring-track {
			fill: none;
			stroke: var(--glass-border);
			stroke-width: 3;
		}
		&__ring-fill {
			fill: none;
			stroke: var(--ring);
			stroke-width: 3;
			stroke-linecap: round;
			transition: stroke-dasharray 0.5s var(--ease-spring), stroke 0.3s ease;
		}
		&__ring-label {
			position: absolute;
			inset: 0;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 0.55rem;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
			letter-spacing: -0.02em;
			color: var(--ring);
		}

		// ── Side metrics: C_p, voters ───────────────────────────────────────────
		&__metric {
			display: inline-flex;
			flex-direction: column;
			align-items: flex-start;
			line-height: 1.05;

			color: var(--text-body);
			&--pos .eval__v {
				color: var(--c-high);
			}
			&--mid .eval__v {
				color: var(--c-mid);
			}
			&--neg .eval__v {
				color: var(--c-low);
			}
			&--neutral .eval__v {
				color: var(--text-body);
			}
			&--pulse {
				animation: eval-pulse 420ms var(--ease-spring);
			}
			&--rate {
				flex-direction: row;
				align-items: center;
				gap: 4px;
				color: var(--text-muted);
				font-size: 0.74rem;
				font-weight: 600;
			}
		}

		&__k {
			font-size: 0.56rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: var(--text-muted);
		}
		&__v {
			font-size: 0.8rem;
			font-weight: 700;
			font-variant-numeric: tabular-nums;
		}

		&__sep {
			width: 3px;
			height: 3px;
			border-radius: 50%;
			background: var(--glass-border);
			flex-shrink: 0;
			margin-inline: 2px;
		}
		&__star {
			color: var(--amber);
			font-size: 0.85rem;
		}

		// ── Expanded face rater ─────────────────────────────────────────────────
		&__faces {
			display: inline-flex;
			gap: 3px;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			padding: 3px;
		}
		&__face {
			width: 30px;
			height: 30px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border: 1px solid transparent;
			border-radius: var(--radius-pill);
			background: transparent;
			cursor: pointer;
			padding: 0;
			transition: transform 0.12s var(--ease-spring), background 0.2s, border-color 0.2s;

			&:hover {
				transform: scale(1.22);
				z-index: 2;
			}
			&:focus-visible {
				outline: none;
				box-shadow: 0 0 0 2px var(--accent);
			}
			&:active {
				transform: scale(0.94);
			}
			&.active {
				background: var(--eval-btn);
				border-color: var(--accent);
			}
		}
		&__face-emoji {
			font-size: 0.95rem;
			line-height: 1;
			filter: grayscale(0.45);
			transition: filter 0.2s, transform 0.2s var(--ease-spring);

			.eval__face:hover &,
			.eval__face.active & {
				filter: grayscale(0);
			}
			.eval__face.active & {
				transform: scale(1.12);
			}
		}
	}

	@media (max-width: 480px) {
		.eval__face {
			width: 38px;
			height: 38px;
		}
		.eval__face-emoji {
			font-size: 1.15rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.eval__dial,
		.eval__metric,
		.eval__ring-fill,
		.eval__face,
		.eval__face-emoji {
			animation: none;
			transition: none;
		}
	}
</style>
