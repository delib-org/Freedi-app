<!--
  Compact language switcher: a globe button that opens a popover list, mirroring
  the main app's ChangeLanguage. Replaces the wide full-width <select> so the
  header stays narrow. Closes on outside-click / Escape / selection.
-->
<script lang="ts">
	import { LANGS, LANGUAGE_NAMES } from '$lib/i18n';
	import { t } from '$lib/i18n';

	let {
		current,
		onChange,
	}: { current: string; onChange: (code: string) => void } = $props();

	let open = $state(false);
	let root = $state<HTMLDivElement | null>(null);

	function toggle() {
		open = !open;
	}

	function select(code: string) {
		onChange(code);
		open = false;
	}

	function onWindowClick(event: MouseEvent) {
		if (open && root && !root.contains(event.target as Node)) {
			open = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKeydown} />

<div class="lang" bind:this={root}>
	<button
		class="lang__trigger"
		onclick={toggle}
		title={$t('Language')}
		aria-label={$t('Language')}
		aria-haspopup="listbox"
		aria-expanded={open}
	>
		<svg
			class="lang__globe"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9.5" />
			<line x1="2.5" y1="12" x2="21.5" y2="12" />
			<path d="M12 2.5a14.5 14.5 0 0 1 3.8 9.5 14.5 14.5 0 0 1-3.8 9.5 14.5 14.5 0 0 1-3.8-9.5A14.5 14.5 0 0 1 12 2.5z" />
		</svg>
	</button>

	{#if open}
		<div class="lang__menu" role="listbox" aria-label={$t('Language selection')}>
			{#each LANGS as code (code)}
				<button
					class="lang__option"
					class:lang__option--selected={code === current}
					role="option"
					aria-selected={code === current}
					onclick={() => select(code)}
				>
					<span class="lang__name">{LANGUAGE_NAMES[code]}</span>
					{#if code === current}
						<span class="lang__check" aria-hidden="true">✓</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="scss">
	.lang {
		position: relative;
		display: inline-flex;

		&__trigger {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 2rem;
			height: 2rem;
			padding: 0;
			background: transparent;
			border: none;
			border-radius: 8px;
			color: var(--text-muted);
			cursor: pointer;
			transition: color 0.15s ease;

			&:hover,
			&[aria-expanded='true'] {
				color: var(--accent);
			}
		}

		&__globe {
			width: 1.25rem;
			height: 1.25rem;
		}

		&__menu {
			position: absolute;
			top: calc(100% + 0.4rem);
			inset-inline-end: 0;
			z-index: 60;
			min-width: 9.5rem;
			max-height: 60vh;
			overflow-y: auto;
			padding: 0.3rem;
			border-radius: 12px;
			// Solid, theme-aware surface so page content doesn't bleed through the
			// menu (the translucent card token let text show behind it).
			background: var(--bg-page);
			border: 1px solid var(--glass-border);
			box-shadow: var(--glass-shadow);
		}

		&__option {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-sm);
			width: 100%;
			padding: 0.5rem 0.7rem;
			background: transparent;
			border: none;
			border-radius: 8px;
			color: var(--text-body);
			font-size: 0.9rem;
			text-align: start;
			cursor: pointer;

			&:hover {
				background: var(--bg-muted);
			}

			&--selected {
				color: var(--accent);
				font-weight: 700;
			}
		}

		&__check {
			color: var(--accent);
		}
	}
</style>
