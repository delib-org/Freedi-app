<script lang="ts">
	// The C bar for an option/evidence node. C ∈ [0,1]; color shifts low→high.
	import { tp } from '$lib/i18n';

	let { value }: { value?: number } = $props();

	const has = $derived(typeof value === 'number');
	const pct = $derived(has ? Math.round(Math.max(0, Math.min(1, value as number)) * 100) : 0);
	const color = $derived(pct >= 60 ? 'var(--c-high)' : pct >= 35 ? 'var(--c-mid)' : 'var(--c-low)');
</script>

{#if has}
	<div class="cbar" title={$tp('Corroboration {{pct}}%', { pct })}>
		<div class="cbar__track">
			<div class="cbar__fill" style={`width:${pct}%;background:${color}`}></div>
		</div>
		<span class="cbar__val">C {pct}%</span>
	</div>
{/if}

<style lang="scss">
	.cbar {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		&__track {
			flex: 1;
			height: 8px;
			background: var(--bg-muted);
			border-radius: var(--radius-pill);
			overflow: hidden;
		}
		&__fill {
			height: 100%;
			border-radius: var(--radius-pill);
			transition: width 0.4s ease;
		}
		&__val {
			font-size: 0.72rem;
			font-weight: 600;
			color: var(--text-muted);
			white-space: nowrap;
		}
	}
</style>
