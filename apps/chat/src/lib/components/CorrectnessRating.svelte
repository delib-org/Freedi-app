<script lang="ts">
	import { enhance } from '$app/forms';

	// Bipolar epistemic-stance control for evidence (critique/corroborate):
	// "I think it's incorrect" ←─ unsure ─→ "I think it's correct".
	// Two states: collapsed shows ⚖️ + the average rating so far; pressing it
	// reveals the slider. Emits a continuous value in [-1,1] to the `evaluate`
	// form action (the corroboration scorer reads it via (e+1)/2).
	let {
		statementId,
		value = null,
		average = null,
		count = 0,
	}: {
		statementId: string;
		value?: number | null;
		average?: number | null;
		count?: number;
	} = $props();

	const BANDS = [
		{ min: 0.62, label: "Confident it's correct" },
		{ min: 0.18, label: 'Likely correct' },
		{ min: -0.18, label: 'Unsure' },
		{ min: -0.62, label: 'Likely incorrect' },
		{ min: -1.01, label: "Confident it's incorrect" },
	];

	let trackEl = $state<HTMLDivElement>();
	let formEl: HTMLFormElement;
	let hiddenEl: HTMLInputElement;
	let expanded = $state(false);
	let dragging = $state(false);
	let draft = $state<number | null>(null); // live value while dragging (uncommitted)

	const current = $derived(draft ?? value);
	const engaged = $derived(current !== null);
	const v = $derived(current ?? 0);
	const pct = $derived(((v + 1) / 2) * 100);
	const band = $derived(BANDS.find((b) => v >= b.min) ?? BANDS[BANDS.length - 1]);
	const tone = $derived(v >= 0.18 ? 'pos' : v <= -0.18 ? 'neg' : 'mid');

	const avgTone = $derived(
		average === null ? 'mid' : average >= 0.18 ? 'pos' : average <= -0.18 ? 'neg' : 'mid',
	);
	const avgText = $derived(
		average === null ? '' : average > 0 ? `+${average.toFixed(2)}` : average.toFixed(2),
	);

	const round = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 100) / 100;

	function valueFromX(clientX: number): number {
		if (!trackEl) return v;
		const r = trackEl.getBoundingClientRect();

		return round(((clientX - r.left) / r.width) * 2 - 1);
	}

	function submit(val: number) {
		hiddenEl.value = String(round(val));
		formEl.requestSubmit();
	}

	function onPointerDown(e: PointerEvent) {
		e.preventDefault();
		dragging = true;
		trackEl?.setPointerCapture?.(e.pointerId);
		draft = valueFromX(e.clientX);
	}

	function onKey(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.2 : 0.05;
		let next = v;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = v - step;
		else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = v + step;
		else if (e.key === 'Home') next = -1;
		else if (e.key === 'End') next = 1;
		else if (e.key === '0') next = 0;
		else return;
		e.preventDefault();
		draft = round(next);
		submit(draft);
	}

	$effect(() => {
		if (!dragging) return;
		const move = (e: PointerEvent) => (draft = valueFromX(e.clientX));
		const up = () => {
			dragging = false;
			if (draft !== null) submit(draft);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);

		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
	});
</script>

<form
	bind:this={formEl}
	method="POST"
	action="?/evaluate"
	class="cr"
	use:enhance={() => {
		return async ({ update }) => {
			draft = null;
			await update();
		};
	}}
>
	<input type="hidden" name="statementId" value={statementId} />
	<input type="hidden" name="value" bind:this={hiddenEl} />

	{#if !expanded}
		<button
			type="button"
			class="cr__summary"
			onclick={() => (expanded = true)}
			title="Rate how correct this is"
		>
			<span class="cr__scale">⚖️</span>
			{#if count > 0 && average !== null}
				<span class="cr__avg cr__avg--{avgTone}">{avgText}</span>
				<span class="cr__count">· {count}</span>
			{:else}
				<span class="cr__none">Rate correctness</span>
			{/if}
		</button>
	{:else}
		<button
			type="button"
			class="cr__collapse"
			onclick={() => (expanded = false)}
			title="Collapse"
			aria-label="Collapse rating"
		>⚖️</button>

		<!-- Decorative click/drag hit-area; the focusable thumb (role=slider) below
		     carries the semantics + keyboard control. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="cr__track" class:idle={!engaged} bind:this={trackEl} onpointerdown={onPointerDown}>
			<span class="cr__center"></span>
			<button
				type="button"
				class="cr__thumb cr__thumb--{tone}"
				class:idle={!engaged}
				class:dragging
				role="slider"
				aria-label="How correct is this statement?"
				aria-valuemin={-1}
				aria-valuemax={1}
				aria-valuenow={v}
				aria-valuetext={engaged ? band.label : 'Not rated'}
				onkeydown={onKey}
				style={`left:${pct}%`}
			></button>
		</div>

		<span class="cr__label cr__label--{tone}" class:idle={!engaged}>
			{engaged ? band.label : 'How correct is this?'}
		</span>
	{/if}
</form>

<style lang="scss">
	.cr {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		margin: 0;
	}

	// ---- collapsed state ----
	.cr__summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		background: var(--eval-bg);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-pill);
		padding: 3px 10px 3px 8px;
		font: inherit;
		cursor: pointer;
		transition: border-color 0.2s;

		&:hover {
			border-color: var(--accent);
		}
	}
	.cr__scale {
		font-size: 0.95rem;
		line-height: 1;
	}
	.cr__avg {
		font-size: 0.74rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;

		&--pos {
			color: var(--strengthen);
		}
		&--neg {
			color: var(--critique);
		}
		&--mid {
			color: var(--text-muted);
		}
	}
	.cr__count {
		font-size: 0.68rem;
		color: var(--text-muted);
	}
	.cr__none {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	// ---- expanded state ----
	.cr__collapse {
		background: none;
		border: none;
		padding: 0;
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0.85;

		&:hover {
			opacity: 1;
		}
	}

	.cr__track {
		position: relative;
		width: 150px;
		height: 6px;
		border-radius: var(--radius-pill);
		cursor: pointer;
		touch-action: none;
		background: linear-gradient(
			to right,
			var(--critique) 0%,
			var(--bg-muted) 50%,
			var(--strengthen) 100%
		);

		&.idle {
			filter: saturate(0.4) opacity(0.6);
		}
	}

	.cr__center {
		position: absolute;
		top: -3px;
		left: 50%;
		width: 2px;
		height: 12px;
		transform: translateX(-50%);
		background: var(--border-strong);
		border-radius: 1px;
	}

	.cr__thumb {
		position: absolute;
		top: 50%;
		width: 16px;
		height: 16px;
		padding: 0;
		border-radius: 50%;
		transform: translate(-50%, -50%);
		border: 2px solid var(--bg-card);
		cursor: grab;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
		transition:
			left 0.08s ease,
			background 0.15s ease;

		&--pos {
			background: var(--strengthen);
		}
		&--neg {
			background: var(--critique);
		}
		&--mid {
			background: var(--text-muted);
		}
		&.idle {
			border-style: dashed;
			background: var(--bg-muted);
		}
		&.dragging {
			cursor: grabbing;
		}
		&:focus-visible {
			outline: none;
			box-shadow:
				0 0 0 3px rgba(99, 102, 241, 0.35),
				0 2px 6px rgba(0, 0, 0, 0.35);
		}
	}

	.cr__label {
		font-size: 0.72rem;
		font-weight: 600;
		white-space: nowrap;

		&--pos {
			color: var(--strengthen);
		}
		&--neg {
			color: var(--critique);
		}
		&--mid {
			color: var(--text-muted);
		}
		&.idle {
			color: var(--text-muted);
			font-weight: 500;
			font-style: italic;
		}
	}
</style>
