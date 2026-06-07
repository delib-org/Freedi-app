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
		gap: 2px;
		margin: 0;
		padding: 2px;
		background: var(--eval-bg);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-pill);

		&__btn {
			border: 1px solid transparent;
			background: transparent;
			color: var(--text-muted);
			border-radius: var(--radius-pill);
			width: 26px;
			height: 26px;
			cursor: pointer;
			font-size: 0.7rem;
			line-height: 1;
			transition: all 0.15s var(--ease-spring);

			&:hover {
				background: var(--eval-btn);
				transform: scale(1.12);
			}
			&--up.active {
				color: var(--strengthen);
				background: var(--strengthen-soft);
			}
			&--down.active {
				color: var(--critique);
				background: var(--critique-soft);
			}
		}
	}
</style>
