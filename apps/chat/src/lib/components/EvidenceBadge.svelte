<script lang="ts">
	import { EvidenceStatus, DialogicType } from '@freedi/shared-types';
	import type { Statement } from '@freedi/shared-types';
	import { createTaxonomy } from '@freedi/evidence';
	import { t } from '$lib/i18n';

	let { statement }: { statement: Statement } = $props();

	const tax = createTaxonomy();
	const polarity = $derived(statement.dialecticType ?? DialogicType.standard);
	const evaluating = $derived(statement.evidenceStatus === EvidenceStatus.pending);
	const className = $derived(statement.evidenceClass ?? '');
	const classLabel = $derived(className ? tax.label(className) : '');
	const weightPct = $derived(
		typeof statement.effectiveWeight === 'number'
			? Math.round(statement.effectiveWeight * 100)
			: null,
	);
</script>

<div class="badge badge--{polarity}">
	<span class="badge__polarity">
		{#if polarity === DialogicType.strengthen}{$t('Strengthen')}{:else if polarity === DialogicType.critique}{$t('Critique')}{:else}{$t('Standard')}{/if}
	</span>
	{#if evaluating}
		<span class="badge__chip">{$t('evaluating…')}</span>
	{:else if classLabel}
		<span class="badge__class">{classLabel}{#if weightPct !== null} · w {weightPct}%{/if}</span>
	{/if}
</div>

<style lang="scss">
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.72rem;
		padding: 2px 10px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);

		&--strengthen {
			color: var(--strengthen);
			background: var(--strengthen-soft);
			border-color: var(--strengthen);
		}
		&--critique {
			color: var(--critique);
			background: var(--critique-soft);
			border-style: dashed;
			border-color: var(--critique);
		}
		&__polarity {
			font-weight: 600;
		}
		&__class {
			color: var(--text-muted);
		}
		&__chip {
			color: var(--text-muted);
			font-style: italic;
		}
	}
</style>
