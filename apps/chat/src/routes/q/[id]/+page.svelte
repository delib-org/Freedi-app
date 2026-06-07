<script lang="ts">
	import { onMount } from 'svelte';
	import { StatementType } from '@freedi/shared-types';
	import type { Statement } from '@freedi/shared-types';
	import type { PageData } from './$types';
	import { buildTree, sortChildren } from '$lib/stores/messages';
	import { buildQaPage, serializeJsonLd } from '$lib/seo/structuredData';
	import MessageNode from '$lib/components/MessageNode.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import ConvergenceMeter from '$lib/components/ConvergenceMeter.svelte';
	import { subscribeToConversation } from '$lib/realtime';

	let { data }: { data: PageData } = $props();

	// SSR provides `data.statements`; after hydration the realtime listener fills
	// `live`, which then overrides. `$derived` keeps it reactive to both.
	let live = $state<Statement[] | null>(null);
	const statements = $derived(live ?? data.statements);

	const root = $derived(data.root);
	const tree = $derived(buildTree(statements, root.statementId));
	const sortedTree = $derived(sortChildren(tree));
	const options = $derived(
		statements.filter(
			(s) => s.parentId === root.statementId && s.statementType === StatementType.option,
		),
	);
	const commentCount = $derived(
		statements.filter(
			(s) =>
				s.statementType === StatementType.evidence || s.statementType === StatementType.statement,
		).length,
	);

	const jsonLd = $derived(
		data.indexable
			? serializeJsonLd(
					buildQaPage({
						question: root,
						options,
						commentCount,
						url: `/q/${root.statementId}`,
					}),
				)
			: null,
	);

	onMount(() => {
		// Lazy realtime: patches `statements` on added/modified/removed.
		const unsub = subscribeToConversation(
			root.statementId,
			data.visibility,
			(next) => (live = next),
			() => statements,
		);

		return unsub;
	});
</script>

<svelte:head>
	<title>{root.statement} — Dialectical Chat</title>
	<meta name="description" content={root.statement.slice(0, 160)} />
	{#if !data.indexable}
		<meta name="robots" content="noindex" />
	{/if}
	{#if jsonLd}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html `<script type="application/ld+json">${jsonLd}<\/script>`}
	{/if}
</svelte:head>

<main class="page">
	<nav class="breadcrumb">
		<a href="/">← All questions</a>
	</nav>

	<header class="q">
		<h1 class="q__title">{root.statement}</h1>
		<div class="q__meta muted">
			<span>{options.length} option{options.length === 1 ? '' : 's'}</span>
			<span>· by {root.creator?.displayName ?? 'Anonymous'}</span>
		</div>
		<ConvergenceMeter value={root.convergenceIndex ?? 0} />
	</header>

	<section class="thread" aria-label="Answers and evidence">
		{#each sortedTree as node (node.statement.statementId)}
			<MessageNode {node} signedIn={data.signedIn} currentUid={data.currentUid} />
		{/each}
	</section>

	<section class="add" aria-label="Add to this question">
		<h2 class="add__heading">Add to this question</h2>
		<Composer
			parentId={root.statementId}
			parentType={StatementType.question}
			signedIn={data.signedIn}
		/>
	</section>
</main>

<style lang="scss">
	@use '../../../styles/mixins' as *;

	.breadcrumb {
		font-size: 0.85rem;
		margin-bottom: var(--space-md);
	}
	.q {
		@include glass;
		@include slide-up;
		margin-bottom: var(--space-lg);
		padding: var(--space-lg);
		border-radius: var(--radius-md);

		&__title {
			font-size: 1.7rem;
			margin-bottom: var(--space-sm);
		}
		&__meta {
			display: flex;
			gap: var(--space-xs);
			font-size: 0.85rem;
			margin-bottom: var(--space-md);
		}
	}
	.thread {
		margin-bottom: var(--space-xl);
	}
	.add {
		@include glass;
		padding: var(--space-lg);
		border-radius: var(--radius-md);

		&__heading {
			font-size: 1rem;
			margin-bottom: var(--space-md);
		}
	}
</style>
