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

	// Collapse/expand all: broadcast a versioned signal down the tree. Bumping
	// `collapseVersion` makes every MessageNode adopt `collapseTarget` once, while
	// still allowing per-node toggling afterwards.
	let collapseVersion = $state(0);
	let collapseTarget = $state(true);
	const hasThreads = $derived(sortedTree.some((n) => n.children.length > 0));

	function setAll(open: boolean) {
		collapseTarget = open;
		collapseVersion += 1;
	}

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

	<div class="conversation">
		<header class="conversation__header">
			<h1 class="conversation__title">{root.statement}</h1>
			<div class="conversation__meta muted">
				<span>{options.length} option{options.length === 1 ? '' : 's'}</span>
				<span>· {commentCount} comment{commentCount === 1 ? '' : 's'}</span>
				<span>· by {root.creator?.displayName ?? 'Anonymous'}</span>
			</div>
			<ConvergenceMeter value={root.convergenceIndex ?? 0} />
		</header>

		<section class="conversation__thread" aria-label="Answers and evidence">
			{#if hasThreads}
				<div class="conversation__tools">
					<button class="conversation__tool" onclick={() => setAll(true)}>Expand all</button>
					<button class="conversation__tool" onclick={() => setAll(false)}>Collapse all</button>
				</div>
			{/if}
			{#if sortedTree.length === 0}
				<p class="conversation__empty muted">No answers yet — propose the first option below.</p>
			{/if}
			{#each sortedTree as node (node.statement.statementId)}
				<MessageNode
					{node}
					signedIn={data.signedIn}
					currentUid={data.currentUid}
					myEvaluations={data.myEvaluations}
					{collapseVersion}
					{collapseTarget}
				/>
			{/each}
		</section>

		<section class="conversation__footer" aria-label="Add to this question">
			<h2 class="conversation__add-heading">Add to this question</h2>
			<Composer
				parentId={root.statementId}
				parentType={StatementType.question}
				signedIn={data.signedIn}
			/>
		</section>
	</div>
</main>

<style lang="scss">
	@use '../../../styles/mixins' as *;

	.breadcrumb {
		font-size: 0.85rem;
		margin-bottom: var(--space-md);
	}

	// One cohesive floating "conversation window" (reference chat-container):
	// glass panel, a header, a slightly inset thread area, and a footer composer.
	.conversation {
		@include glass;
		@include slide-up;
		border-radius: var(--radius-lg);
		overflow: hidden;

		&__header {
			padding: var(--space-lg);
			border-bottom: 1px solid var(--glass-border);
			background: var(--header-tint);
		}
		&__title {
			font-size: 1.6rem;
			margin-bottom: var(--space-sm);
		}
		&__meta {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-xs);
			font-size: 0.85rem;
			margin-bottom: var(--space-md);
		}

		&__thread {
			padding: var(--space-md) var(--space-lg) var(--space-lg);
			background: var(--inset);
		}

		&__tools {
			display: flex;
			justify-content: flex-end;
			gap: var(--space-sm);
		}
		&__tool {
			background: none;
			border: none;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.72rem;
			font-weight: 600;
			cursor: pointer;
			padding: var(--space-xs) var(--space-sm);
			border-radius: var(--radius-sm);

			&:hover {
				color: var(--accent);
				background: var(--eval-bg);
			}
		}
		&__empty {
			padding: var(--space-lg) 0;
			text-align: center;
		}

		&__footer {
			padding: var(--space-lg);
			border-top: 1px solid var(--glass-border);
			background: var(--header-tint);
		}
		&__add-heading {
			font-size: 0.95rem;
			margin-bottom: var(--space-md);
			color: var(--text-muted);
		}
	}
</style>
