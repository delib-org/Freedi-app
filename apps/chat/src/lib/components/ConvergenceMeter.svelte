<script lang="ts">
	// Visualizes a question's convergenceIndex ∈ [0,1] (§1.5) — how clearly a
	// leading answer has separated from the field.
	let { value = 0 }: { value?: number } = $props();

	const pct = $derived(Math.round(Math.max(0, Math.min(1, value)) * 100));
	const label = $derived(
		pct >= 66 ? 'Converging' : pct >= 33 ? 'Forming' : 'Open',
	);
</script>

<div class="conv" title={`Convergence ${pct}%`}>
	<div class="conv__track">
		<div class="conv__fill" style={`width:${pct}%`}></div>
	</div>
	<span class="conv__label muted">{label} · {pct}%</span>
</div>

<style lang="scss">
	.conv {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		&__track {
			flex: 1;
			height: 6px;
			background: var(--bg-muted);
			border-radius: var(--radius-pill);
			overflow: hidden;
		}
		&__fill {
			height: 100%;
			background: linear-gradient(90deg, var(--c-mid), var(--c-high));
			border-radius: var(--radius-pill);
			transition: width 0.4s ease;
		}
		&__label {
			font-size: 0.75rem;
			white-space: nowrap;
		}
	}
</style>
