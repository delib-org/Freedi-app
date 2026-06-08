<script lang="ts">
	import type { PageData } from './$types';
	import { t, tp } from '$lib/i18n';

	let { data }: { data: PageData } = $props();

	const jsonLd = $derived(
		JSON.stringify({
			'@context': 'https://schema.org',
			'@type': 'ProfilePage',
			mainEntity: { '@type': 'Person', name: data.displayName, identifier: data.userId },
		}).replace(/</g, '\\u003c'),
	);
</script>

<svelte:head>
	<title>{data.displayName} — {$t('Dialectical Chat')}</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<main class="page">
	<nav class="breadcrumb"><a href="/">← {$t('All questions')}</a></nav>
	<h1>{data.displayName}</h1>

	<section>
		<h2>{$t('Questions')}</h2>
		{#if data.questions.length === 0}
			<p class="muted">{$t('No public questions.')}</p>
		{:else}
			<ul>
				{#each data.questions as q (q.id)}
					<li>
						<a href={`/q/${q.id}`}>{q.title}</a>
						<span class="muted"
							>· {$tp(q.optionCount === 1 ? '{{count}} option' : '{{count}} options', {
								count: q.optionCount,
							})}</span
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>{$t('Proposed options')}</h2>
		{#if data.options.length === 0}
			<p class="muted">{$t('No public options.')}</p>
		{:else}
			<ul>
				{#each data.options as o (o.id)}
					<li>{o.title} <span class="muted">· C {Math.round(o.c * 100)}%</span></li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style lang="scss">
	.breadcrumb {
		font-size: 0.85rem;
		margin-bottom: var(--space-md);
	}
	section {
		margin-top: var(--space-lg);
	}
	ul {
		padding-left: var(--space-lg);
	}
</style>
