<script lang="ts">
	import Self from './MessageNode.svelte';
	import { StatementType } from '@freedi/shared-types';
	import type { TreeNode } from '$lib/stores/messages';
	import { sortChildren } from '$lib/stores/messages';
	import CorroborationBar from './CorroborationBar.svelte';
	import EvidenceBadge from './EvidenceBadge.svelte';
	import EvaluationBar from './EvaluationBar.svelte';
	import Composer from './Composer.svelte';
	import AiSummaryPanel from './AiSummaryPanel.svelte';

	let {
		node,
		signedIn = false,
		currentUid = null,
		maxDepth = 4,
	}: { node: TreeNode; signedIn?: boolean; currentUid?: string | null; maxDepth?: number } =
		$props();

	const s = $derived(node.statement);
	const isQuestion = $derived(s.statementType === StatementType.question);
	const isEvidence = $derived(s.statementType === StatementType.evidence);
	const isOption = $derived(s.statementType === StatementType.option);
	const scored = $derived(isOption || isEvidence);

	const sorted = $derived(sortChildren(node.children));
	const truncate = $derived(node.depth >= maxDepth && node.children.length > 0);

	let open = $state(true);
</script>

<article class="node node--{s.statementType}" class:evidence={isEvidence}>
	<div class="node__body">
		{#if scored}
			<EvaluationBar statementId={s.statementId} />
		{/if}
		<div class="node__content">
			{#if isEvidence}
				<EvidenceBadge statement={s} />
			{/if}
			<p class="node__text">{s.statement}</p>
			<div class="node__meta muted">
				<span>{s.creator?.displayName ?? 'Anonymous'}</span>
				{#if scored}
					<CorroborationBar value={s.corroborationScore} />
				{/if}
			</div>
		</div>
	</div>

	{#if isQuestion}
		<!-- Sub-question: render as a link to its own addressable route (§6.2). -->
		<a class="subq" href={`/q/${s.statementId}`}>
			Open sub-question · {s.optionCount ?? 0} options →
		</a>
	{:else if node.children.length}
		<button class="node__toggle" onclick={() => (open = !open)} aria-expanded={open}>
			{open ? 'Collapse' : `Show ${node.children.length} repl${node.children.length === 1 ? 'y' : 'ies'}`}
		</button>
		{#if open}
			{#if truncate}
				<a class="continue" href={`/q/${s.statementId}`}>
					Continue thread ({node.children.length}) →
				</a>
			{:else}
				<div class="node__children">
					{#each sorted as child (child.statement.statementId)}
						<Self node={child} {signedIn} {currentUid} {maxDepth} />
					{/each}
				</div>
			{/if}
		{/if}
	{/if}

	{#if isOption}
		<AiSummaryPanel
			statementId={s.statementId}
			{signedIn}
			canAccept={Boolean(currentUid) && s.creatorId === currentUid}
		/>
	{/if}

	{#if scored && !truncate}
		<details class="node__reply">
			<summary>Reply</summary>
			<Composer parentId={s.statementId} parentType={s.statementType} {signedIn} />
		</details>
	{/if}
</article>

<style lang="scss">
	.node {
		border-left: 2px solid var(--border);
		padding-left: var(--space-md);
		margin-top: var(--space-md);

		&__body {
			display: flex;
			gap: var(--space-sm);
			align-items: flex-start;
		}
		&__content {
			flex: 1;
			min-width: 0;
		}
		&__text {
			margin: var(--space-xs) 0;
		}
		&__meta {
			display: flex;
			align-items: center;
			gap: var(--space-md);
			font-size: 0.8rem;
		}
		&__children {
			margin-left: var(--space-sm);
		}
		&__toggle {
			background: none;
			border: none;
			color: var(--text-muted);
			cursor: pointer;
			font-size: 0.78rem;
			padding: var(--space-xs) 0;
		}
		&__reply {
			margin-top: var(--space-sm);
			summary {
				cursor: pointer;
				font-size: 0.8rem;
				color: var(--accent);
			}
		}
		&.evidence {
			border-left-color: var(--border-strong);
		}
	}
	.subq,
	.continue {
		display: inline-block;
		margin-top: var(--space-sm);
		font-size: 0.85rem;
		font-weight: 600;
	}
</style>
