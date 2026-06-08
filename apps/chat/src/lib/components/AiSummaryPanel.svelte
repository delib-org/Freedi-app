<script lang="ts">
	import { onMount } from 'svelte';
	import { slideFade } from '$lib/transitions';
	import { functionsClient } from '$lib/firebaseClient';

	// The AI summary box (reference `.summary-node`) — a ✨ callout with an "AI
	// Thread Summary" section and an amber "Suggested Revision" section. Rendered
	// INSIDE the message content (after the bubble); the toggle button lives in
	// the bubble's action row (MessageNode). Loads on mount via the REAL
	// generateDialecticalRevision callable (whole-subtree summary + caching).
	let {
		statementId,
		canAccept = false,
		onClose,
	}: { statementId: string; canAccept?: boolean; onClose?: () => void } = $props();

	let busy = $state(false);
	let loaded = $state(false);
	let error = $state('');
	let summary = $state('');
	let suggestion = $state('');
	let count = $state(0);
	let cached = $state(false);

	async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
		const [fns, { httpsCallable }] = await Promise.all([
			functionsClient(),
			import('firebase/functions'),
		]);

		return (await httpsCallable<TReq, TRes>(fns, name)(data)).data;
	}

	async function load() {
		busy = true;
		error = '';
		try {
			const res = await callFn<
				{ statementId: string },
				{
					summary: string;
					improvementSuggestion: string;
					descendantCount: number;
					cached?: boolean;
				}
			>('generateDialecticalRevision', { statementId });
			summary = res.summary;
			suggestion = res.improvementSuggestion;
			count = res.descendantCount ?? 0;
			cached = res.cached ?? false;
			loaded = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to generate';
		} finally {
			busy = false;
		}
	}

	async function accept() {
		busy = true;
		error = '';
		try {
			await callFn<{ statementId: string }, { accepted: boolean }>('acceptDialecticalRevision', {
				statementId,
			});
			onClose?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to accept';
		} finally {
			busy = false;
		}
	}

	onMount(load);
</script>

<div
	class="summary"
	data-digital-source="TrainedAlgorithmicMediaDigitalSource"
	transition:slideFade|local={{ duration: 260 }}
>
	<div class="summary__icon">✨</div>
	<div class="summary__content">
		{#if error}
			<p class="summary__error">{error}</p>
		{:else if busy && !loaded}
			<p class="summary__loading">Reading the whole thread…</p>
		{:else}
			<div class="summary__section">
				<span class="summary__label">
					AI Thread Summary{#if count > 0}<span class="summary__meta">
							· {count} sub-statement{count === 1 ? '' : 's'}</span
						>{/if}{#if cached}<span class="summary__cached"> · ✓ up to date</span>{/if}
				</span>
				<p>{summary}</p>
			</div>

			{#if suggestion}
				<div class="summary__section summary__section--suggestion">
					<span class="summary__label summary__label--amber">💡 Suggested Revision</span>
					<p class="summary__suggestion">"{suggestion}"</p>
					{#if canAccept}
						<button class="summary__accept" onclick={accept} disabled={busy}>
							{busy ? 'Applying…' : 'Accept Revision'}
						</button>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../styles/mixins' as *;

	// The AI callout — ✨ icon column + content (reference `.summary-node`).
	.summary {
		margin-top: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--glass-bg);
		backdrop-filter: blur(var(--glass-blur));
		-webkit-backdrop-filter: blur(var(--glass-blur));
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		display: flex;
		gap: var(--space-sm);
		align-items: flex-start;
		box-shadow: 0 4px 15px rgba(99, 102, 241, 0.12);

		&__icon {
			font-size: 1rem;
			margin-top: 2px;
			flex-shrink: 0;
		}

		&__content {
			display: flex;
			flex-direction: column;
			gap: var(--space-md);
			width: 100%;
			min-width: 0;

			p {
				font-size: 0.82rem;
				line-height: 1.45;
				margin: 0;
				color: var(--text-body);
				opacity: 0.92;
			}
		}

		&__section {
			display: flex;
			flex-direction: column;
			gap: var(--space-xs);

			&--suggestion {
				padding-top: var(--space-sm);
				border-top: 1px solid var(--glass-border);
			}
		}

		&__label {
			font-size: 0.65rem;
			font-weight: 700;
			color: var(--accent);
			text-transform: uppercase;
			letter-spacing: 0.5px;

			&--amber {
				color: var(--amber-dark);
			}
		}
		&__meta,
		&__cached {
			text-transform: none;
			letter-spacing: 0;
			font-weight: 600;
		}
		&__meta {
			color: var(--text-muted);
		}
		&__cached {
			color: var(--strengthen);
		}

		&__suggestion {
			font-style: italic;
			background: var(--amber-soft);
			padding: var(--space-sm) var(--space-md);
			border-radius: var(--radius-sm);
			border-left: 3px solid var(--amber-dark);
		}

		&__accept {
			@include pill-button;
			align-self: flex-start;
			margin-top: var(--space-xs);
			background: var(--amber-dark);
			color: #fff;
			padding: var(--space-xs) var(--space-md);
			font-size: 0.74rem;
			font-weight: 700;
			border-radius: var(--radius-sm);

			&:hover {
				background: var(--amber);
			}
		}

		&__loading {
			color: var(--text-muted);
			font-size: 0.82rem;
			margin: 0;
		}
		&__error {
			color: var(--critique);
			font-size: 0.82rem;
			margin: 0;
		}
	}
</style>
