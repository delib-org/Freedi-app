<script lang="ts">
	import type { PageData } from './$types';
	import ConvergenceMeter from '$lib/components/ConvergenceMeter.svelte';
	import { t } from '$lib/i18n';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dialectical Chat — evidence-weighted debate</title>
	<meta
		name="description"
		content="Turn debate into evidence-weighted reasoning. Browse open questions, propose answers, strengthen or critique with evidence."
	/>
</svelte:head>

<main class="page">
	<header class="hero">
		<h1>{$t('app.title')}</h1>
		<p class="muted">{$t('app.tagline')}</p>
		<a class="hero__cta" href="/new">Start a question</a>
	</header>

	<section aria-label="Open questions">
		{#if data.roots.length === 0}
			<p class="empty muted">{$t('discovery.noQuestions')}</p>
		{:else}
			<ul class="cards">
				{#each data.roots as q (q.statementId)}
					<li class="card">
						<a class="card__link" href={`/q/${q.statementId}`}>
							<h2 class="card__title">{q.statement}</h2>
						</a>
						<div class="card__meta muted">
							<span>{q.optionCount} option{q.optionCount === 1 ? '' : 's'}</span>
							<span>·</span>
							<span>by {q.creatorName}</span>
						</div>
						<ConvergenceMeter value={q.convergenceIndex} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style lang="scss">
	.hero {
		margin-bottom: var(--space-xl);
		h1 {
			font-size: 2rem;
		}
		&__cta {
			display: inline-block;
			margin-top: var(--space-md);
			background: var(--accent);
			color: var(--text-inverse);
			border-radius: var(--radius-pill);
			padding: var(--space-sm) var(--space-lg);
			font-weight: 600;
			&:hover {
				text-decoration: none;
				background: var(--accent-dark);
			}
		}
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--space-md);
	}
	.card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-md);
		box-shadow: var(--shadow-card);

		&__title {
			font-size: 1.15rem;
			margin: 0 0 var(--space-xs);
			color: var(--text-body);
		}
		&__meta {
			display: flex;
			gap: var(--space-xs);
			font-size: 0.85rem;
			margin-bottom: var(--space-sm);
		}
	}
	.empty {
		padding: var(--space-xl) 0;
		text-align: center;
	}
</style>
