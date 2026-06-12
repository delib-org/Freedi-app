<script lang="ts">
	import { onMount } from 'svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { StatementType } from '@freedi/shared-types';
	import type { Statement } from '@freedi/shared-types';
	import type { PageData } from './$types';
	import { buildTree, sortChildren, type SortMode, type TreeNode } from '$lib/stores/messages';
	import { buildQaPage, serializeJsonLd } from '$lib/seo/structuredData';
	import MessageNode from '$lib/components/MessageNode.svelte';
	import SortMenu from '$lib/components/SortMenu.svelte';
	import Composer from '$lib/components/Composer.svelte';
	import ConvergenceMeter from '$lib/components/ConvergenceMeter.svelte';
	import FollowQuestion from '$lib/components/FollowQuestion.svelte';
	import { subscribeToConversation } from '$lib/realtime';
	import { t, tp } from '$lib/i18n';

	let { data }: { data: PageData } = $props();

	// SSR provides `data.statements`; after hydration the realtime listener fills
	// `live`, which then overrides. `$derived` keeps it reactive to both.
	let live = $state<Statement[] | null>(null);
	const statements = $derived(live ?? data.statements);

	const root = $derived(data.root);
	const tree = $derived(buildTree(statements, root.statementId));

	// Active sort mode, shared with every MessageNode so nested levels sort alike.
	let sortMode = $state<SortMode>('agreement');
	const sortedTree = $derived(sortChildren(tree, sortMode));
	const canSort = $derived(sortedTree.length > 1);
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

	// Mobile "focus mode" (ported from the reference impl): on phones we only nest
	// ~3 levels inline; deeper threads collapse to a "Continue thread →" button
	// that drills into that node as a fresh root. `focusStack` lets Back step out
	// one level at a time. On desktop this stays inactive (full nesting).
	let isMobile = $state(false);
	let focusStack = $state<string[]>([]);
	const focusedId = $derived(focusStack[focusStack.length - 1] ?? null);

	function findNode(nodes: TreeNode[], id: string): TreeNode | null {
		for (const n of nodes) {
			if (n.statement.statementId === id) return n;
			const found = findNode(n.children, id);
			if (found) return found;
		}

		return null;
	}

	// Re-root a focused subtree at depth 0 so it again earns a fresh 3 levels.
	function reroot(node: TreeNode, depth = 0): TreeNode {
		return { ...node, depth, children: node.children.map((c) => reroot(c, depth + 1)) };
	}

	const focusedNode = $derived.by(() => {
		if (!focusedId) return null;
		const found = findNode(sortedTree, focusedId);

		return found ? reroot(found) : null;
	});

	function focusOn(id: string) {
		focusStack = [...focusStack, id];
		if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function focusBack() {
		focusStack = focusStack.slice(0, -1);
	}

	const displayTree = $derived(
		focusedNode ? [focusedNode] : questionsOnly ? questionNodes : sortedTree,
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
		// Track phone-width so deep threads switch to in-page focus mode.
		const mq = window.matchMedia('(max-width: 600px)');
		const applyMobile = () => (isMobile = mq.matches);
		applyMobile();
		mq.addEventListener('change', applyMobile);

		// Lazy realtime: patches `statements` on added/modified/removed.
		const unsub = subscribeToConversation(
			root.statementId,
			data.visibility,
			(next) => (live = next),
			() => statements,
		);

		return () => {
			mq.removeEventListener('change', applyMobile);
			unsub();
		};
	});
</script>

<svelte:head>
	<title>{root.statement} — {$t('Dialectical Chat')}</title>
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
			<a href="/">← {$t('All questions')}</a>
		{/if}
	</nav>

	<div class="conversation">
		<header class="conversation__header">
			<h1 class="conversation__title">{root.statement}</h1>
			<div class="conversation__meta muted">
				<span
					>{$tp(options.length === 1 ? '{{count}} option' : '{{count}} options', {
						count: options.length,
					})}</span
				>
				<span
					>· {$tp(commentCount === 1 ? '{{count}} comment' : '{{count}} comments', {
						count: commentCount,
					})}</span
				>
				<span>· {$tp('by {{name}}', { name: root.creator?.displayName ?? $t('Anonymous') })}</span>
			</div>
			<ConvergenceMeter value={root.convergenceIndex ?? 0} />
			{#if data.signedIn}
				<div class="conversation__follow">
					<FollowQuestion statementId={root.statementId} />
				</div>
			{/if}
		</header>

		<section class="conversation__thread" aria-label={$t('Answers and evidence')}>
			{#if focusedNode}
				<div class="conversation__focus">
					<button class="conversation__back" onclick={focusBack}>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path
								d="M19 12H5M12 19l-7-7 7-7"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{$t('Back')}
					</button>
					<span class="conversation__focus-label">{$t('Focused thread')}</span>
				</div>
			{:else if hasThreads || hasQuestions || canSort}
				<div class="conversation__tools">
					{#if hasQuestions}
						<button
							class="conversation__tool conversation__tool--toggle"
							class:active={questionsOnly}
							aria-pressed={questionsOnly}
							aria-label={questionsOnly ? $t('Show everything') : $t('Show only questions')}
							title={questionsOnly ? $t('Show everything') : $t('Show only questions')}
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
							<span class="conversation__tool-label">{$t('Questions')}</span>
						</button>
					{/if}
					{#if hasThreads && !questionsOnly}
						<button class="conversation__tool" aria-label={$t('Expand all threads')} title={$t('Expand all')} onclick={() => setAll(true)}>
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
							<span class="conversation__tool-label">{$t('Expand all')}</span>
						</button>
						<button class="conversation__tool" aria-label={$t('Collapse all threads')} title={$t('Collapse all')} onclick={() => setAll(false)}>
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
							<span class="conversation__tool-label">{$t('Collapse all')}</span>
						</button>
					{/if}
					{#if canSort && !questionsOnly}
						<SortMenu mode={sortMode} onChange={(m) => (sortMode = m)} />
					{/if}
				</div>
			{/if}
			{#if displayTree.length === 0}
				<p class="conversation__empty muted">
					{#if questionsOnly}
						{$t('No sub-questions yet.')}
					{:else}
						{$t('No answers yet — propose the first option below.')}
					{/if}
				</p>
			{/if}
			{#each displayTree as node (node.statement.statementId)}
				<div class="conversation__item" animate:flip={{ duration: 350, easing: cubicOut }}>
					<MessageNode
						{node}
						signedIn={data.signedIn}
						currentUid={data.currentUid}
						currentUser={data.currentUser}
						myEvaluations={data.myEvaluations}
						{collapseVersion}
						{collapseTarget}
						{sortMode}
						{isMobile}
						onFocus={focusOn}
					/>
				</div>
			{/each}
		</section>

		<section class="conversation__footer" aria-label={$t('Add to this question')}>
			<Composer
				parentId={root.statementId}
				parentType={StatementType.question}
				signedIn={data.signedIn}
				userName={data.currentUser?.displayName ?? null}
				userPhotoURL={data.currentUser?.photoURL ?? null}
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
		// `clip` (not `hidden`) so the sticky footer below still sticks —
		// overflow:hidden would turn the card into the sticky containing
		// scrollport and pin the footer to the card instead of the viewport.
		overflow: clip;

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
		&__follow {
			margin-top: var(--space-sm);
		}

		&__thread {
			padding: var(--space-md) var(--space-lg) var(--space-lg);
			background: var(--inset);
		}

		// Focus-mode header (mobile deep-thread drill-in): a Back button + label,
		// sticky to the top of the thread so it stays reachable while scrolling.
		&__focus {
			position: sticky;
			top: 0;
			z-index: 5;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-md);
			margin: calc(var(--space-sm) * -1) calc(var(--space-md) * -1) var(--space-md);
			padding: var(--space-sm) var(--space-md);
			background: var(--inset);
			backdrop-filter: blur(var(--glass-blur));
			border-bottom: 1px solid var(--glass-border);
		}
		&__back {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-pill);
			color: var(--text-body);
			font: inherit;
			font-size: 0.82rem;
			font-weight: 600;
			padding: var(--space-xs) var(--space-md);
			cursor: pointer;
			transition: border-color 0.15s, background 0.15s;

			&:hover {
				border-color: var(--accent);
				color: var(--accent);
			}

			svg {
				width: 1rem;
				height: 1rem;
			}
		}
		&__focus-label {
			font-size: 0.68rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.06em;
			color: var(--accent);
		}

		&__tools {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
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

		// FB-style: the comment box stays pinned to the viewport bottom while
		// long threads scroll behind it (sticky within the conversation card).
		&__footer {
			position: sticky;
			bottom: 0;
			z-index: 6;
			padding: var(--space-md) var(--space-lg);
			border-top: 1px solid var(--glass-border);
			background: var(--bg-card);
		}
	}

	// On phones, reclaim horizontal room and collapse the toolbar to a single row
	// of compact icon buttons (labels become tooltip/aria-only). The sort control
	// is rendered last so its left-fanning menu stays inside the card.
	@media (max-width: 480px) {
		.conversation {
			&__header,
			&__thread,
			&__footer {
				padding: var(--space-md);
			}
			&__thread {
				padding-top: var(--space-sm);
			}
			&__title {
				font-size: 1.3rem;
			}
			&__tools {
				gap: var(--space-sm);
			}
			&__tool {
				width: 2rem;
				height: 2rem;
				padding: 0;
				justify-content: center;
				gap: 0;
				background: var(--eval-bg);
				border-color: var(--glass-border);
				border-radius: var(--radius-pill);
			}
			&__icon {
				width: 1.05rem;
				height: 1.05rem;
			}
		}
		.conversation__tool-label {
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
	}
</style>
