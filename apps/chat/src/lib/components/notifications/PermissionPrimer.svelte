<!--
  Soft pre-prompt shown BEFORE the browser's one-shot native notification
  permission dialog. Explains the value honestly so the user opts in willingly
  (and so we don't burn the irreversible native prompt on someone who'll dismiss
  it). On confirm, the parent triggers the real permission request.
-->
<script lang="ts">
	import { t } from '$lib/i18n';

	let { onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void } = $props();
</script>

<div class="primer" role="dialog" aria-modal="true" aria-label={$t('Turn on notifications')}>
	<button class="primer__backdrop" aria-label={$t('Close')} onclick={onDismiss}></button>
	<div class="primer__panel">
		<span class="primer__icon" aria-hidden="true">🔔</span>
		<h2 class="primer__title">{$t('Stay in the loop on discussions you care about')}</h2>
		<p class="primer__body">
			{$t('We’ll let you know when someone responds to your contribution or a discussion you follow needs your input. You can change or turn this off any time.')}
		</p>
		<div class="primer__actions">
			<button class="primer__btn primer__btn--ghost" onclick={onDismiss}>{$t('Not now')}</button>
			<button class="primer__btn primer__btn--primary" onclick={onAllow}>{$t('Turn on notifications')}</button>
		</div>
	</div>
</div>

<style lang="scss">
	.primer {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		align-items: center;
		justify-content: center;

		&__backdrop {
			position: absolute;
			inset: 0;
			border: none;
			background: rgba(0, 0, 0, 0.5);
			cursor: pointer;
		}
		&__panel {
			position: relative;
			width: min(400px, calc(100% - 32px));
			padding: var(--space-lg);
			border-radius: var(--radius-lg);
			background: var(--bg-card);
			border: 1px solid var(--glass-border);
			backdrop-filter: blur(var(--glass-blur));
			box-shadow: var(--glass-shadow);
			text-align: center;
			animation: primer-in 0.2s var(--ease-spring);
		}
		&__icon {
			font-size: 2rem;
		}
		&__title {
			margin: var(--space-sm) 0;
			font-size: 1.1rem;
			font-weight: 700;
		}
		&__body {
			margin: 0 0 var(--space-lg);
			font-size: 0.88rem;
			color: var(--text-muted);
		}
		&__actions {
			display: flex;
			justify-content: center;
			gap: var(--space-sm);
		}
		&__btn {
			padding: 8px 18px;
			border-radius: var(--radius-pill);
			font-weight: 600;
			font-size: 0.85rem;
			cursor: pointer;

			&--ghost {
				background: transparent;
				border: 1px solid var(--glass-border);
				color: var(--text-muted);
			}
			&--primary {
				background: var(--accent-gradient);
				border: none;
				color: #fff;
			}
		}
	}

	@keyframes primer-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.primer__panel {
			animation: none;
		}
	}
</style>
