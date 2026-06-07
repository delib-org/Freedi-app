<script lang="ts">
	import { onMount } from 'svelte';
	import '../styles/global.scss';
	import { initLang } from '$lib/i18n';

	let { children } = $props();

	onMount(() => initLang());
</script>

{@render children()}
