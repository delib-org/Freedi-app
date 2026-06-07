<script lang="ts">
	// ±1 evaluation toggle. Posts to the `evaluate` form action so it works with
	// JS disabled; the live C update arrives via onSnapshot once hydrated.
	let {
		statementId,
		myEvaluation = 0,
	}: { statementId: string; myEvaluation?: number } = $props();
</script>

<form method="POST" action="?/evaluate" class="eval">
	<input type="hidden" name="statementId" value={statementId} />
	<button
		class="eval__btn eval__btn--up"
		class:active={myEvaluation > 0}
		name="value"
		value="1"
		aria-label="Agree"
		aria-pressed={myEvaluation > 0}
	>▲</button>
	<button
		class="eval__btn eval__btn--down"
		class:active={myEvaluation < 0}
		name="value"
		value="-1"
		aria-label="Disagree"
		aria-pressed={myEvaluation < 0}
	>▼</button>
</form>

<style lang="scss">
	.eval {
		display: inline-flex;
		gap: var(--space-xs);
		margin: 0;
		&__btn {
			border: 1px solid var(--border);
			background: var(--bg-card);
			color: var(--text-muted);
			border-radius: var(--radius-sm);
			width: 30px;
			height: 30px;
			cursor: pointer;
			font-size: 0.8rem;
			line-height: 1;

			&:hover {
				border-color: var(--border-strong);
			}
			&--up.active {
				color: var(--strengthen);
				border-color: var(--strengthen);
				background: var(--strengthen-soft);
			}
			&--down.active {
				color: var(--critique);
				border-color: var(--critique);
				background: var(--critique-soft);
			}
		}
	}
</style>
