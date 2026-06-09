<script lang="ts">
	import type { PageData } from './$types';
	import ConvergenceMeter from '$lib/components/ConvergenceMeter.svelte';
	import { t, tp } from '$lib/i18n';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{$t('Dialectical Chat — evidence-weighted debate')}</title>
	<meta
		name="description"
		content="Turn debate into evidence-weighted reasoning. Browse open questions, propose answers, strengthen or critique with evidence."
	/>
</svelte:head>

<main class="page">
	<header class="hero">
		<h1>{$t('Dialectical Chat')}</h1>
		<p class="muted">{$t('Turn debate into evidence-weighted reasoning.')}</p>
		<a class="hero__cta" href="/new">{$t('Start a question')}</a>
	</header>

	<section aria-label={$t('Open questions')}>
		{#if data.roots.length === 0}
			<p class="empty muted">{$t('No public questions yet.')}</p>
		{:else}
			<ul class="cards">
				{#each data.roots as q (q.statementId)}
					<li class="card">
						<a class="card__link" href={`/q/${q.statementId}`}>
							<h2 class="card__title">{q.statement}</h2>
						</a>
						<div class="card__meta muted">
							<span
								>{$tp(q.optionCount === 1 ? '{{count}} option' : '{{count}} options', {
									count: q.optionCount,
								})}</span
							>
							<span>·</span>
							<span>{$tp('by {{name}}', { name: q.creatorName })}</span>
						</div>
						<ConvergenceMeter value={q.convergenceIndex} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style lang="scss">
	@use '../styles/mixins' as *;

	.hero {
		margin-bottom: var(--space-xl);
		@include slide-up;

		h1 {
			font-size: 2.4rem;
			@include text-gradient;
		}
		p {
			font-size: 1.05rem;
		}
		&__cta {
			@include pill-button;
			display: inline-block;
			margin-top: var(--space-md);
			background: var(--accent-gradient);
			color: #fff;
			padding: var(--space-sm) var(--space-lg);
			box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35);

			&:hover {
				text-decoration: none;
				box-shadow: 0 6px 22px rgba(99, 102, 241, 0.5);
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
		@include glass;
		border-radius: var(--radius-md);
		padding: var(--space-lg);
		transition: transform 0.2s var(--ease-spring), border-color 0.2s;

		&:hover {
			transform: translateY(-2px);
			border-color: rgba(99, 102, 241, 0.4);
		}
		&__title {
			font-size: 1.2rem;
			margin: 0 0 var(--space-xs);
			color: var(--text-body);
		}
		&__meta {
			display: flex;
			gap: var(--space-xs);
			font-size: 0.85rem;
			margin-bottom: var(--space-md);
		}
	}
	.empty {
		padding: var(--space-xl) 0;
		text-align: center;
	}
</style>
