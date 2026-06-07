<script lang="ts">
	import type { PageData } from './$types';

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
	<title>{data.displayName} — Dialectical Chat</title>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
</svelte:head>

<main class="page">
	<nav class="breadcrumb"><a href="/">← All questions</a></nav>
	<h1>{data.displayName}</h1>

	<section>
		<h2>Questions</h2>
		{#if data.questions.length === 0}
			<p class="muted">No public questions.</p>
		{:else}
			<ul>
				{#each data.questions as q (q.id)}
					<li><a href={`/q/${q.id}`}>{q.title}</a> <span class="muted">· {q.optionCount} options</span></li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>Proposed options</h2>
		{#if data.options.length === 0}
			<p class="muted">No public options.</p>
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
