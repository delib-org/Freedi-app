<script lang="ts">
	import { slideFade } from '$lib/transitions';
	import type { SummaryResult } from '$lib/aiSummary';
	import { t, tp } from '$lib/i18n';

	// Presentational only — the AI summary box (reference `.summary-node`): a ✨
	// callout with an "AI Thread Summary" section and an amber "Suggested
	// Revision" section. Mounted by MessageNode ONLY once the summary is loaded,
	// so it opens in one smooth slide. The fetch/wait lives on the action button.
	let {
		data,
		error = '',
		canAccept = false,
		accepting = false,
		onAccept,
	}: {
		data: SummaryResult | null;
		error?: string;
		canAccept?: boolean;
		accepting?: boolean;
		onAccept?: () => void;
	} = $props();
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
		{:else if data}
			<div class="summary__section">
				<span class="summary__label">
					{$t('AI Thread Summary')}{#if data.descendantCount > 0}<span class="summary__meta">
							· {$tp(
								data.descendantCount === 1
									? '{{count}} sub-statement'
									: '{{count}} sub-statements',
								{ count: data.descendantCount },
							)}</span
						>{/if}{#if data.cached}<span class="summary__cached"> · ✓ {$t('up to date')}</span>{/if}
				</span>
				<p>{data.summary}</p>
			</div>

			{#if data.improvementSuggestion}
				<div class="summary__section summary__section--suggestion">
					<span class="summary__label summary__label--amber">💡 {$t('Suggested Revision')}</span>
					<p class="summary__suggestion">"{data.improvementSuggestion}"</p>
					{#if canAccept}
						<button class="summary__accept" onclick={() => onAccept?.()} disabled={accepting}>
							{accepting ? $t('Applying…') : $t('Accept Revision')}
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
			border-inline-start: 3px solid var(--amber-dark);
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

		&__error {
			color: var(--critique);
			font-size: 0.82rem;
			margin: 0;
		}
	}
</style>
