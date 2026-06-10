<!--
  Per-question follow control. Thin wrapper around the BranchBell (which handles
  follow + frequency). On iOS Safari (where push needs an installed PWA) it shows
  an "Add to Home Screen" sheet at the intent moment so the user can enable push.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { getPushSupport } from '$lib/push';
	import { getInstallAffordance } from '$lib/installPrompt';
	import BranchBell from './notifications/BranchBell.svelte';
	import InstallPwaSheet from './notifications/InstallPwaSheet.svelte';

	let { statementId }: { statementId: string } = $props();

	let needsInstall = $state(false);
	let showInstall = $state(false);

	onMount(() => {
		const support = getPushSupport();
		needsInstall = !support.supported && support.reason === 'ios-needs-install';
	});

	function openInstall() {
		if (getInstallAffordance() === 'ios-instructions') showInstall = true;
	}
</script>

<div class="followq">
	<BranchBell {statementId} />
	{#if needsInstall}
		<button class="followq__install" onclick={openInstall}>
			{$t('Get push on iPhone →')}
		</button>
	{/if}
</div>

{#if showInstall}
	<InstallPwaSheet onClose={() => (showInstall = false)} />
{/if}

<style lang="scss">
	.followq {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);

		&__install {
			background: transparent;
			border: none;
			color: var(--text-muted);
			font-size: 0.75rem;
			cursor: pointer;
			text-decoration: underline;

			&:hover {
				color: var(--accent);
			}
		}
	}
</style>
