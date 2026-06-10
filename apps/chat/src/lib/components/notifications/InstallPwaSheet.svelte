<!--
  iOS "Add to Home Screen" instructions sheet. iOS Safari has no programmatic
  install prompt and only allows web push from an installed PWA, so we explain
  the manual Share → Add to Home Screen steps honestly. Shown only at an intent
  moment (e.g. the user just tried to turn on notifications), never on load.
-->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { snoozeInstall } from '$lib/installPrompt';

	let { onClose }: { onClose: () => void } = $props();

	function dismiss() {
		onClose();
	}
	function notNow() {
		snoozeInstall();
		onClose();
	}
</script>

<div class="sheet" role="dialog" aria-modal="true" aria-label={$t('Install the app')}>
	<button class="sheet__backdrop" aria-label={$t('Close')} onclick={dismiss}></button>
	<div class="sheet__panel">
		<h2 class="sheet__title">{$t('Get notified — add Freedi to your Home Screen')}</h2>
		<p class="sheet__intro">
			{$t('On iPhone and iPad, notifications work once the app is on your Home Screen. It only takes a moment:')}
		</p>
		<ol class="sheet__steps">
			<li>
				<span class="sheet__step-icon" aria-hidden="true">⬆️</span>
				{$t('Tap the Share button in Safari’s toolbar.')}
			</li>
			<li>
				<span class="sheet__step-icon" aria-hidden="true">➕</span>
				{$t('Choose “Add to Home Screen”.')}
			</li>
			<li>
				<span class="sheet__step-icon" aria-hidden="true">✅</span>
				{$t('Open Freedi from your Home Screen, then turn on notifications.')}
			</li>
		</ol>
		<div class="sheet__actions">
			<button class="sheet__btn sheet__btn--ghost" onclick={notNow}>{$t('Maybe later')}</button>
			<button class="sheet__btn sheet__btn--primary" onclick={dismiss}>{$t('Got it')}</button>
		</div>
	</div>
</div>

<style lang="scss">
	.sheet {
		position: fixed;
		inset: 0;
		z-index: 90;
		display: flex;
		align-items: flex-end;
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
			width: min(440px, 100%);
			margin: var(--space-md);
			padding: var(--space-lg);
			border-radius: var(--radius-lg);
			// Opaque base so the page doesn't bleed through the sheet.
			background: linear-gradient(0deg, var(--glass-bg), var(--glass-bg)), var(--bg-color);
			border: 1px solid var(--glass-border);
			box-shadow: var(--glass-shadow);
			animation: sheet-up 0.25s var(--ease-spring);
		}
		&__title {
			margin: 0 0 var(--space-sm);
			font-size: 1.1rem;
			font-weight: 700;
		}
		&__intro {
			margin: 0 0 var(--space-md);
			font-size: 0.88rem;
			color: var(--text-muted);
		}
		&__steps {
			margin: 0 0 var(--space-lg);
			padding-inline-start: 0;
			list-style: none;
			display: flex;
			flex-direction: column;
			gap: var(--space-sm);

			li {
				display: flex;
				align-items: center;
				gap: var(--space-sm);
				font-size: 0.9rem;
			}
		}
		&__step-icon {
			flex: 0 0 auto;
			width: 1.6rem;
			text-align: center;
		}
		&__actions {
			display: flex;
			justify-content: flex-end;
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

	@keyframes sheet-up {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet__panel {
			animation: none;
		}
	}
</style>
