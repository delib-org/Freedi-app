<script lang="ts">
	import { fade } from 'svelte/transition';
	import { slideFade } from '$lib/transitions';
	import Self from './MessageNode.svelte';
	import { StatementType, DialogicType } from '@freedi/shared-types';
	import type { TreeNode } from '$lib/stores/messages';
	import { sortChildren } from '$lib/stores/messages';
	import { evalStatsOf } from '$lib/chat/node';
	import EvidenceBadge from './EvidenceBadge.svelte';
	import EvaluationBar from './EvaluationBar.svelte';
	import CorrectnessRating from './CorrectnessRating.svelte';
	import Composer from './Composer.svelte';
	import AiSummaryPanel from './AiSummaryPanel.svelte';
	import { generateSummary, acceptRevision, type SummaryResult } from '$lib/aiSummary';

	let {
		node,
		signedIn = false,
		currentUid = null,
		myEvaluations = {},
		maxDepth = 4,
	}: {
		node: TreeNode;
		signedIn?: boolean;
		currentUid?: string | null;
		myEvaluations?: Record<string, number>;
		maxDepth?: number;
	} = $props();

	const s = $derived(node.statement);
	const isQuestion = $derived(s.statementType === StatementType.question);
	const isEvidence = $derived(s.statementType === StatementType.evidence);
	const isOption = $derived(s.statementType === StatementType.option);
	const scored = $derived(isOption || isEvidence);
	const polarity = $derived(s.dialecticType ?? DialogicType.standard);
	const evalStats = $derived(evalStatsOf(s));

	const sorted = $derived(sortChildren(node.children));
	const hasChildren = $derived(node.children.length > 0 && !isQuestion);
	const truncate = $derived(node.depth >= maxDepth && node.children.length > 0);

	let open = $state(true);
	let showReply = $state(false);

	// AI summary lives next to Collapse — on scored claims that have replies.
	const canSummarize = $derived(scored && signedIn && node.children.length > 0);

	// Fetch state lives here so the WAIT shows on the button and the summary box
	// only mounts once loaded — one smooth open instead of a two-step jump.
	let aiOpen = $state(false);
	let aiBusy = $state(false);
	let aiAccepting = $state(false);
	let aiError = $state('');
	let aiData = $state<SummaryResult | null>(null);

	async function toggleAi() {
		if (aiOpen) {
			aiOpen = false;

			return;
		}
		if (aiData || aiError) {
			aiOpen = true; // already loaded — just reveal

			return;
		}
		aiBusy = true;
		aiError = '';
		try {
			aiData = await generateSummary(s.statementId);
			aiOpen = true; // open only once content is ready
		} catch (e) {
			aiError = e instanceof Error ? e.message : 'Failed to generate';
			aiOpen = true;
		} finally {
			aiBusy = false;
		}
	}

	async function acceptAi() {
		aiAccepting = true;
		try {
			await acceptRevision(s.statementId);
			aiOpen = false;
			aiData = null; // claim text changed — drop the stale summary
		} catch (e) {
			aiError = e instanceof Error ? e.message : 'Failed to accept';
		} finally {
			aiAccepting = false;
		}
	}

	// Derived flags so each transition element is the DIRECT child of its own
	// `{#if}` — otherwise `transition:…|local` is suppressed when an ancestor
	// block toggles (and the collapse/expand would snap instead of animate).
	const showChildren = $derived(open && hasChildren && !truncate);
	const showContinue = $derived(open && hasChildren && truncate);
</script>

<article class="node">
	<div class="node__row">
		{#if node.children.length > 0 && open && !truncate}
			<button
				class="node__thread"
				aria-label={open ? 'Collapse thread' : 'Expand thread'}
				onclick={() => (open = !open)}
				transition:fade|local={{ duration: 150 }}
			></button>
		{/if}

		<div class="node__main">
			<div class="node__sender">
				<span class="node__author">{s.creator?.displayName ?? 'Anonymous'}</span>
				{#if isEvidence && polarity === DialogicType.strengthen}
					<span class="node__tag node__tag--strengthen">🛡 Strengthen</span>
				{:else if isEvidence && polarity === DialogicType.critique}
					<span class="node__tag node__tag--critique">⚡ Critique</span>
				{:else if isOption}
					<span class="node__tag node__tag--option">Option</span>
				{/if}
			</div>

			<div
				class="node__bubble"
				class:node__bubble--strengthen={isEvidence && polarity === DialogicType.strengthen}
				class:node__bubble--critique={isEvidence && polarity === DialogicType.critique}
				class:node__bubble--option={isOption}
			>
				{#if isEvidence}
					<div class="node__evidence-head">
						<EvidenceBadge statement={s} />
					</div>
				{/if}

				<p class="node__text">{s.statement}</p>

				<div class="node__meta">
					<div class="node__meta-left">
						{#if isEvidence}
							<CorrectnessRating
								statementId={s.statementId}
								value={myEvaluations[s.statementId] ?? null}
								corroboration={s.corroborationScore ?? null}
								count={evalStats.count}
							/>
						{:else if isOption}
							<!-- Collapsed: consensus · # evaluators · average vote -->
							<EvaluationBar
								statementId={s.statementId}
								myEvaluation={myEvaluations[s.statementId] ?? null}
								consensus={s.corroborationScore ?? null}
								count={evalStats.count}
								average={evalStats.average}
							/>
						{/if}
					</div>
					<div class="node__actions">
						{#if scored && !truncate}
							<button class="node__action" onclick={() => (showReply = !showReply)}>
								{showReply ? 'Cancel' : 'Reply'}
							</button>
						{/if}
						{#if node.children.length > 0}
							<button class="node__action" onclick={() => (open = !open)}>
								{open ? 'Collapse' : `Expand (${node.children.length})`}
							</button>
						{/if}
						{#if canSummarize}
							<button
								class="node__action node__action--ai"
								class:active={aiOpen || aiBusy}
								onclick={toggleAi}
								disabled={aiBusy}
							>
								✨ {aiBusy ? 'Summarizing…' : aiOpen ? 'Hide Summary' : 'AI Summary'}
							</button>
						{/if}
					</div>
				</div>
			</div>

			{#if aiOpen}
				<AiSummaryPanel
					data={aiData}
					error={aiError}
					canAccept={Boolean(currentUid) && s.creatorId === currentUid}
					accepting={aiAccepting}
					onAccept={acceptAi}
				/>
			{/if}

			{#if isQuestion}
				<a class="node__subq" href={`/q/${s.statementId}`}>
					Open sub-question · {s.optionCount ?? 0} option{(s.optionCount ?? 0) === 1 ? '' : 's'} →
				</a>
			{/if}
		</div>
	</div>

	{#if showReply && scored && !truncate}
		<div class="node__reply" transition:slideFade|local={{ duration: 240 }}>
			<Composer parentId={s.statementId} parentType={s.statementType} {signedIn} />
		</div>
	{/if}

	{#if showContinue}
		<a class="node__continue" href={`/q/${s.statementId}`}>
			Continue thread ({node.children.length}
			{node.children.length === 1 ? 'reply' : 'replies'}) →
		</a>
	{/if}

	{#if showChildren}
		<div class="node__children" transition:slideFade|local={{ duration: 320 }}>
			{#each sorted as child (child.statement.statementId)}
				<Self node={child} {signedIn} {currentUid} {myEvaluations} {maxDepth} />
			{/each}
		</div>
	{/if}
</article>

<style lang="scss">
	@use '../../styles/mixins' as *;

	.node {
		position: relative;
		margin-top: var(--space-md);

		&__row {
			position: relative;
			display: flex;
			flex-direction: column;
		}

		&__thread {
			position: absolute;
			left: -1.5rem;
			top: 2.2rem;
			bottom: -0.5rem;
			width: 2px;
			padding: 0;
			border: none;
			background: var(--thread-line);
			border-radius: var(--radius-pill);
			cursor: pointer;
			transition: background 0.2s, width 0.2s;

			&:hover {
				background: var(--accent);
				width: 4px;
			}
		}

		&__main {
			min-width: 0;
		}

		&__sender {
			display: flex;
			align-items: center;
			gap: var(--space-sm);
			margin: 0 0 var(--space-xs) var(--space-sm);
			font-size: 0.75rem;
			font-weight: 500;
			color: var(--text-muted);
		}

		&__author {
			font-weight: 600;
		}

		&__tag {
			font-size: 0.62rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.5px;
			padding: 2px 8px;
			border-radius: var(--radius-sm);
			border: 1px solid var(--border);

			&--strengthen {
				color: var(--strengthen);
				background: var(--strengthen-soft);
				border-color: var(--strengthen-border);
			}
			&--critique {
				color: var(--critique);
				background: var(--critique-soft);
				border-color: var(--critique-border);
			}
			&--option {
				color: var(--accent-2);
				background: rgba(139, 92, 246, 0.12);
				border-color: rgba(139, 92, 246, 0.4);
			}
		}

		&__bubble {
			@include glass;
			background: var(--bubble-other);
			padding: var(--space-md);
			border-radius: var(--radius-md);
			border-bottom-left-radius: 4px;
			display: flex;
			flex-direction: column;
			gap: var(--space-sm);

			&--option {
				border-radius: var(--radius-md);
				border: 1px solid rgba(139, 92, 246, 0.3);
			}
			&--strengthen {
				border: 2px solid var(--strengthen-border);
				border-radius: var(--radius-lg);
				background: var(--strengthen-soft);
				box-shadow: 0 4px 18px var(--strengthen-soft);
			}
			&--critique {
				border: 2px dashed var(--critique-border);
				border-radius: var(--radius-lg);
				background: var(--critique-soft);
				box-shadow: 0 4px 18px var(--critique-soft);
			}
		}

		&__evidence-head {
			padding-bottom: var(--space-xs);
			border-bottom: 1px solid var(--glass-border);
		}

		&__text {
			margin: 0;
			font-size: 0.95rem;
			line-height: 1.45;
			word-break: break-word;
			color: var(--text-body);
		}

		&__meta {
			display: flex;
			justify-content: space-between;
			align-items: center;
			gap: var(--space-md);
		}

		&__meta-left {
			display: flex;
			align-items: center;
			gap: var(--space-sm);
		}

		&__actions {
			display: flex;
			gap: var(--space-sm);
			opacity: 0.7;
			transition: opacity 0.2s;
		}

		&__bubble:hover &__actions {
			opacity: 1;
		}

		&__action {
			background: none;
			border: none;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.72rem;
			font-weight: 600;
			cursor: pointer;
			padding: 0;

			&:hover {
				color: var(--accent);
			}
			&--ai.active {
				color: var(--accent);
			}
		}

		&__subq {
			display: inline-block;
			margin-top: var(--space-sm);
			font-size: 0.85rem;
			font-weight: 600;
		}

		&__reply {
			margin: var(--space-sm) 0 0;
		}

		&__children {
			margin-left: 1.5rem;
			padding-left: var(--space-md);
		}

		&__continue {
			display: inline-block;
			margin: var(--space-sm) 0 0 1.5rem;
			padding: var(--space-sm) var(--space-md);
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-md);
			color: var(--accent);
			font-size: 0.82rem;
			font-weight: 600;

			&:hover {
				border-color: var(--accent);
				text-decoration: none;
			}
		}
	}

	@media (max-width: 480px) {
		.node__children {
			margin-left: 0.75rem;
			padding-left: var(--space-sm);
		}
		.node__thread {
			left: -0.75rem;
		}
	}
</style>
