<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { slideFade } from '$lib/transitions';
	import Self from './MessageNode.svelte';
	import { StatementType, DialogicType } from '@freedi/shared-types';
	import type { RatingMode } from '@freedi/shared-types';
	import type { SortMode, TreeNode } from '$lib/stores/messages';
	import { sortChildren } from '$lib/stores/messages';
	import { evalStatsOf } from '$lib/chat/node';
	import { parseMessageSegments } from '$lib/chat/links';
	import { timeAgo } from '$lib/chat/time';
	import Avatar from './Avatar.svelte';
	import EvidenceBadge from './EvidenceBadge.svelte';
	import EvaluationBar from './EvaluationBar.svelte';
	import CorrectnessRating from './CorrectnessRating.svelte';
	import Composer from './Composer.svelte';
	import AiSummaryPanel from './AiSummaryPanel.svelte';
	import { generateSummary, acceptRevision, type SummaryResult } from '$lib/aiSummary';
	import { t, tp } from '$lib/i18n';

	let {
		node,
		signedIn = false,
		currentUid = null,
		currentUser = null,
		myEvaluations = {},
		maxDepth = 4,
		collapseVersion = 0,
		collapseTarget = true,
		sortMode = 'agreement',
		isMobile = false,
		ratingMode = undefined,
		onFocus,
	}: {
		node: TreeNode;
		signedIn?: boolean;
		currentUid?: string | null;
		currentUser?: { displayName: string | null; photoURL: string | null } | null;
		myEvaluations?: Record<string, number>;
		maxDepth?: number;
		collapseVersion?: number;
		collapseTarget?: boolean;
		sortMode?: SortMode;
		isMobile?: boolean;
		/** Evaluation mode from the conversation's question — threaded down to the
		 *  face rater so options render agree-disagree faces or reactions. */
		ratingMode?: RatingMode;
		onFocus?: (id: string) => void;
	} = $props();

	const s = $derived(node.statement);
	const isQuestion = $derived(s.statementType === StatementType.question);
	const isEvidence = $derived(s.statementType === StatementType.evidence);
	const isOption = $derived(s.statementType === StatementType.option);
	// A chosen option — mirrors the main app's green "selected" treatment.
	const isSelected = $derived(isOption && (s.selected === true || s.isChosen === true));
	const scored = $derived(isOption || isEvidence);
	// An option with no direct evidence children — its C_p is purely vote-based,
	// so the optimistic projection can reproduce it exactly.
	const isLeafOption = $derived(
		isOption && !node.children.some((c) => c.statement.statementType === StatementType.evidence),
	);
	const polarity = $derived(s.dialecticType ?? DialogicType.standard);
	const evalStats = $derived(evalStatsOf(s));
	const textSegments = $derived(parseMessageSegments(s.statement));

	const sorted = $derived(sortChildren(node.children, sortMode));
	const hasChildren = $derived(node.children.length > 0 && !isQuestion);
	const truncate = $derived(node.depth >= maxDepth && node.children.length > 0);

	// FB sizing: top-level comments get 32px avatars, replies get 24px.
	const avatarSize = $derived(node.depth === 0 ? 32 : 24);

	let open = $state(true);
	let showReply = $state(false);

	// Collapse/expand all: adopt the page-level target whenever its version bumps.
	// Tracking only the version (not the target) keeps per-node toggling free
	// between broadcasts.
	let lastCollapseVersion = untrack(() => collapseVersion);
	$effect(() => {
		if (collapseVersion !== lastCollapseVersion) {
			lastCollapseVersion = collapseVersion;
			open = collapseTarget;
		}
	});

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
	// On mobile, threads only nest ~3 levels (depth 0,1,2); a node at depth ≥ 2
	// hides its children behind a "Continue thread →" button that drills into it
	// as a focused root. Desktop keeps full nesting up to `maxDepth`.
	const mobileFocus = $derived(isMobile && node.depth >= 2 && hasChildren);
	const showChildren = $derived(open && hasChildren && !truncate && !mobileFocus);
	const showContinue = $derived(open && hasChildren && truncate && !mobileFocus);
	const showFocus = $derived(open && mobileFocus);
</script>

<article class="node" style:--node-avatar="{avatarSize}px">
	<div class="node__row">
		{#if showChildren}
			<button
				class="node__thread"
				aria-label={open ? $t('Collapse thread') : $t('Expand thread')}
				onclick={() => (open = !open)}
				transition:fade|local={{ duration: 150 }}
			></button>
		{/if}

		<div class="node__rail">
			<Avatar
				name={s.creator?.displayName ?? $t('Anonymous')}
				photoURL={s.creator?.photoURL ?? null}
				size={avatarSize}
			/>
		</div>

		<div class="node__main">
			<div
				class="node__bubble"
				class:node__bubble--strengthen={isEvidence && polarity === DialogicType.strengthen}
				class:node__bubble--critique={isEvidence && polarity === DialogicType.critique}
				class:node__bubble--option={isOption && !isSelected}
				class:node__bubble--selected={isSelected}
				class:node__bubble--question={isQuestion}
			>
				<div class="node__sender">
					<span class="node__author">{s.creator?.displayName ?? $t('Anonymous')}</span>
					{#if isEvidence && polarity === DialogicType.strengthen}
						<span class="node__tag node__tag--strengthen">🛡 {$t('Strengthen')}</span>
					{:else if isEvidence && polarity === DialogicType.critique}
						<span class="node__tag node__tag--critique">⚡ {$t('Critique')}</span>
					{:else if isSelected}
						<span class="node__tag node__tag--selected">✓ {$t('Selected')}</span>
					{:else if isOption}
						<span class="node__tag node__tag--option">💡 {$t('Option')}</span>
					{:else if isQuestion}
						<span class="node__tag node__tag--question">❓ {$t('Question')}</span>
					{/if}
				</div>

				{#if isEvidence}
					<div class="node__evidence-head">
						<EvidenceBadge statement={s} />
					</div>
				{/if}

				<p class="node__text">
					{#each textSegments as segment, i (i)}
						{#if segment.type === 'link'}
							<a class="node__link" href={segment.url} target="_blank" rel="noopener noreferrer">
								{segment.label}
							</a>
						{:else}
							{segment.text}
						{/if}
					{/each}
				</p>

				<!-- Evaluation indicators live inside the bubble, under the claim text. -->
				{#if isEvidence}
					<div class="node__indicators">
						<CorrectnessRating
							statementId={s.statementId}
							value={myEvaluations[s.statementId] ?? null}
							corroboration={s.corroborationScore ?? null}
							count={evalStats.count}
						/>
					</div>
				{:else if isOption}
					<div class="node__indicators">
						<!-- Collapsed: average dial · consensus · # evaluators -->
						<EvaluationBar
							statementId={s.statementId}
							myEvaluation={myEvaluations[s.statementId] ?? null}
							consensus={s.corroborationScore ?? null}
							count={evalStats.count}
							average={evalStats.average}
							leaf={isLeafOption}
							{ratingMode}
						/>
					</div>
				{/if}
			</div>

			<!-- FB action row: "1d · Reply · replies · AI". -->
			<div class="node__meta">
				<span class="node__time">{timeAgo(s.createdAt)}</span>
				{#if scored && !truncate}
					<button class="node__action" onclick={() => (showReply = !showReply)}>
						{showReply ? $t('Cancel') : $t('Reply')}
					</button>
				{/if}
				{#if node.children.length > 0}
					<button class="node__action" onclick={() => (open = !open)}>
						{open
							? $t('Hide replies')
							: $tp(
									node.children.length === 1
										? 'View {{count}} reply'
										: 'View all {{count}} replies',
									{ count: node.children.length },
								)}
					</button>
				{/if}
				{#if canSummarize}
					<button
						class="node__action node__action--ai"
						class:active={aiOpen || aiBusy}
						onclick={toggleAi}
						disabled={aiBusy}
					>
						✨ {aiBusy ? $t('Summarizing…') : aiOpen ? $t('Hide Summary') : $t('AI Summary')}
					</button>
				{/if}
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
					{$t('Open sub-question')} · {$tp(
						(s.optionCount ?? 0) === 1 ? '{{count}} option' : '{{count}} options',
						{ count: s.optionCount ?? 0 },
					)} →
				</a>
			{/if}

			{#if showReply && scored && !truncate}
				<div class="node__reply" transition:slideFade|local={{ duration: 240 }}>
					<Composer
						parentId={s.statementId}
						parentType={s.statementType}
						{signedIn}
						userName={currentUser?.displayName ?? null}
						userPhotoURL={currentUser?.photoURL ?? null}
					/>
				</div>
			{/if}

			{#if showFocus}
				<div class="node__focus-wrap" transition:slideFade|local={{ duration: 240 }}>
					<button class="node__focus-btn" onclick={() => onFocus?.(s.statementId)}>
						{$tp(
							node.children.length === 1
								? 'Continue thread ({{count}} reply)'
								: 'Continue thread ({{count}} replies)',
							{ count: node.children.length },
						)} →
					</button>
				</div>
			{/if}

			{#if showContinue}
				<a class="node__continue" href={`/q/${s.statementId}`}>
					{$tp(
						node.children.length === 1
							? 'Continue thread ({{count}} reply)'
							: 'Continue thread ({{count}} replies)',
						{ count: node.children.length },
					)} →
				</a>
			{/if}
		</div>
	</div>

	{#if showChildren}
		<div class="node__children" transition:slideFade|local={{ duration: 320 }}>
			{#each sorted as child (child.statement.statementId)}
				<div class="node__child" animate:flip={{ duration: 350, easing: cubicOut }}>
					<Self
						node={child}
						{signedIn}
						{currentUid}
						{currentUser}
						{myEvaluations}
						{maxDepth}
						{collapseVersion}
						{collapseTarget}
						{sortMode}
						{isMobile}
						{ratingMode}
						{onFocus}
					/>
				</div>
			{/each}
		</div>
	{/if}
</article>

<style lang="scss">
	@use '../../styles/mixins' as *;

	// FB comment-thread geometry. `--node-avatar` (set inline per depth) drives
	// the rail width, the collapse line x-position, and the reply indent, so the
	// curved connectors stay aligned at every depth — in LTR and RTL alike.
	.node {
		position: relative;
		margin-top: var(--space-md);

		&__row {
			position: relative;
			display: flex;
			gap: var(--space-sm);
		}

		// Collapse affordance: the vertical thread line running from under the
		// avatar down to the replies (click to fold, like FB's gray line).
		&__thread {
			position: absolute;
			inset-inline-start: calc(var(--node-avatar) / 2 - 1px);
			top: calc(var(--node-avatar) + 4px);
			bottom: 0;
			width: 2px;
			padding: 0;
			border: none;
			background: var(--thread-line);
			cursor: pointer;
			transition: background 0.2s;

			&:hover {
				background: var(--accent);
			}
		}

		&__rail {
			width: var(--node-avatar);
			flex-shrink: 0;
		}

		&__main {
			flex: 1;
			min-width: 0;
		}

		&__sender {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-sm);
		}

		&__author {
			font-size: 0.8125rem;
			font-weight: 600;
			color: var(--text-body);
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
				color: var(--option);
				background: var(--option-soft);
				border-color: var(--option-border);
			}
			&--selected {
				color: var(--selected);
				background: var(--selected-soft);
				border-color: var(--selected-border);
			}
			&--question {
				color: var(--question);
				background: var(--question-soft);
				border-color: var(--question-border);
			}
		}

		// FB comment bubble: gray, 18px radius, hugs its content.
		&__bubble {
			background: var(--bubble-other);
			padding: var(--space-sm) 12px;
			border-radius: 18px;
			display: flex;
			flex-direction: column;
			gap: 2px;
			width: fit-content;
			max-width: 100%;

			// Type identity stays (it's functional), expressed as FB-subtle tints.
			&--option {
				border: 1px solid var(--option-border);
				background: var(--option-soft);
			}
			&--selected {
				border: 1px solid var(--selected-border);
				background: var(--selected-soft);
			}
			&--question {
				border: 1px solid var(--question-border);
				background: var(--question-soft);
			}
			&--strengthen {
				border: 1px solid var(--strengthen-border);
				background: var(--strengthen-soft);
			}
			&--critique {
				border: 1px dashed var(--critique-border);
				background: var(--critique-soft);
			}
		}

		&__evidence-head {
			padding-bottom: var(--space-xs);
			border-bottom: 1px solid var(--glass-border);
		}

		&__text {
			margin: 0;
			font-size: 0.9375rem;
			line-height: 1.33;
			word-break: break-word;
			color: var(--text-body);
		}

		// Evaluation indicators tucked inside the bubble, set off from the claim
		// text by a hairline divider so they read as the claim's standing.
		&__indicators {
			margin-top: var(--space-xs);
			padding-top: var(--space-xs);
			border-top: 1px solid var(--glass-border);
		}

		&__link {
			color: var(--accent);
			text-decoration: underline;
			word-break: break-all;

			&:hover {
				text-decoration: none;
			}
		}

		// FB action row under the bubble: "1d · Like · Reply".
		&__meta {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-xs) 12px;
			margin-top: var(--space-xs);
			padding-inline-start: 12px;
		}

		&__time {
			font-size: 0.75rem;
			color: var(--text-muted);
		}

		&__action {
			background: none;
			border: none;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.75rem;
			font-weight: 700;
			cursor: pointer;
			padding: 0;

			&:hover {
				text-decoration: underline;
			}
			&--ai.active {
				color: var(--accent);
			}
		}

		&__subq {
			display: inline-block;
			margin-top: var(--space-sm);
			padding: var(--space-xs) var(--space-md);
			border-radius: var(--radius-pill);
			background: var(--question-soft);
			border: 1px solid var(--question-border);
			color: var(--question);
			font-size: 0.85rem;
			font-weight: 600;

			&:hover {
				border-color: var(--question);
				text-decoration: none;
			}
		}

		&__reply {
			margin: var(--space-sm) 0 0;
		}

		// Replies indent under the parent's content, FB-style: avatar + gap.
		&__children {
			margin-inline-start: calc(var(--node-avatar) + var(--space-sm));
		}

		// Each reply gets a curved elbow branching off the parent's thread line
		// into its avatar; non-last replies also extend the vertical line through
		// their own height so the line reads as continuous and stops at the last
		// reply's elbow — exactly how FB draws it.
		&__child {
			position: relative;
			margin-top: var(--space-sm);

			&::before {
				content: '';
				position: absolute;
				top: -8px;
				inset-inline-start: calc(-1 * (var(--node-avatar) / 2 + 9px));
				width: calc(var(--node-avatar) / 2 + 7px);
				height: 20px;
				border-inline-start: 2px solid var(--thread-line);
				border-bottom: 2px solid var(--thread-line);
				border-end-start-radius: 10px;
				pointer-events: none;
			}

			&:not(:last-child)::after {
				content: '';
				position: absolute;
				top: -8px;
				bottom: calc(-1 * var(--space-sm));
				inset-inline-start: calc(-1 * (var(--node-avatar) / 2 + 9px));
				width: 2px;
				background: var(--thread-line);
				pointer-events: none;
			}
		}

		// Nested nodes get their spacing from the `.node__child` wrapper.
		// (:global — the recursive <Self> renders outside this template's
		// static scope, so a scoped selector would be stripped as unused.)
		&__child > :global(.node) {
			margin-top: 0;
		}

		// FB's "View all N replies" link look.
		&__continue {
			display: inline-block;
			margin: var(--space-sm) 0 0;
			padding-inline-start: 12px;
			color: var(--text-muted);
			font-size: 0.8125rem;
			font-weight: 700;

			&:hover {
				color: var(--text-body);
				text-decoration: underline;
			}
		}

		// Mobile deep-thread drill-in: a full-width tappable card (ported look from
		// the reference's `.continue-thread-btn`).
		&__focus-wrap {
			margin-top: var(--space-sm);
		}
		&__focus-btn {
			width: 100%;
			text-align: start;
			padding: var(--space-sm) var(--space-md);
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-md);
			color: var(--accent);
			font: inherit;
			font-size: 0.84rem;
			font-weight: 600;
			cursor: pointer;
			transition: border-color 0.15s, background 0.15s;

			&:hover {
				border-color: var(--accent);
				background: var(--eval-btn);
			}
		}
	}

	@media (max-width: 480px) {
		.node__action {
			// Comfortable touch target (≈44px tall hit area via padding).
			padding: var(--space-xs) 2px;
		}
	}
</style>
