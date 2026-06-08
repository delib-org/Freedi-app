<script lang="ts">
	import { onMount } from 'svelte';
	import { StatementType } from '@freedi/shared-types';
	import type { Statement } from '@freedi/shared-types';
	import type { PageData } from './$types';
	import { buildTree, sortChildren, type TreeNode } from '$lib/stores/messages';
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

	// Questions-only filter: when on, flatten the tree to just its question nodes
	// (sub-questions at any depth) so the thread reads as a navigable outline.
	let questionsOnly = $state(false);

	function collectQuestions(nodes: TreeNode[]): TreeNode[] {
		const out: TreeNode[] = [];
		for (const n of nodes) {
			if (n.statement.statementType === StatementType.question) {
				out.push({ ...n, depth: 0, children: [] });
			}
			out.push(...collectQuestions(n.children));
		}

		return out;
	}

	const questionNodes = $derived(collectQuestions(sortedTree));
	const hasQuestions = $derived(questionNodes.length > 0);
	const displayTree = $derived(questionsOnly ? questionNodes : sortedTree);

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
		{#if data.parent}
			<a href={`/q/${data.parent.statementId}`} title={data.parent.statement}>
				← {data.parent.statement.length > 48
					? `${data.parent.statement.slice(0, 48)}…`
					: data.parent.statement}
			</a>
		{:else}
			<a href="/">← All questions</a>
		{/if}
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
			{#if hasThreads || hasQuestions}
				<div class="conversation__tools">
					{#if hasQuestions}
						<button
							class="conversation__tool conversation__tool--toggle"
							class:active={questionsOnly}
							aria-pressed={questionsOnly}
							title={questionsOnly ? 'Show everything' : 'Show only questions'}
							onclick={() => (questionsOnly = !questionsOnly)}
						>
							<svg viewBox="0 0 24 24" aria-hidden="true" class="conversation__icon">
								<path
									d="M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.1-1.6 2.4"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
								/>
								<circle cx="12" cy="18" r="1.1" fill="currentColor" />
							</svg>
							Questions
						</button>
					{/if}
					{#if hasThreads && !questionsOnly}
						<button class="conversation__tool" onclick={() => setAll(true)}>
							<svg viewBox="0 0 24 24" aria-hidden="true" class="conversation__icon">
								<path
									d="M7 10l5 5 5-5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Expand all
						</button>
						<button class="conversation__tool" onclick={() => setAll(false)}>
							<svg viewBox="0 0 24 24" aria-hidden="true" class="conversation__icon">
								<path
									d="M7 14l5-5 5 5"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Collapse all
						</button>
					{/if}
				</div>
			{/if}
			{#if displayTree.length === 0}
				<p class="conversation__empty muted">
					{#if questionsOnly}
						No sub-questions yet.
					{:else}
						No answers yet — propose the first option below.
					{/if}
				</p>
			{/if}
			{#each displayTree as node (node.statement.statementId)}
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
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: var(--space-xs);
			margin-bottom: var(--space-sm);
		}
		&__tool {
			display: inline-flex;
			align-items: center;
			gap: 0.3rem;
			background: none;
			border: 1px solid transparent;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.72rem;
			font-weight: 600;
			cursor: pointer;
			padding: var(--space-xs) var(--space-sm);
			border-radius: var(--radius-sm);
			transition: color 0.15s, background 0.15s, border-color 0.15s;

			&:hover {
				color: var(--accent);
				background: var(--eval-bg);
			}

			// The Questions filter is a toggle — show its pressed state clearly.
			&--toggle.active {
				color: var(--accent);
				background: var(--eval-bg);
				border-color: var(--accent);
			}
		}
		&__icon {
			width: 0.95rem;
			height: 0.95rem;
			flex-shrink: 0;
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
