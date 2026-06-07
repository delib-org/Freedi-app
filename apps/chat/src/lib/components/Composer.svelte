<script lang="ts">
	import { StatementType } from '@freedi/shared-types';
	import { composerChoicesFor, type ComposerChoice } from '$lib/chat/node';

	// Context-aware composer (§4.1 / §6). Reads the parent's type to offer the
	// right choices; posts to the `sendMessage` form action.
	let {
		parentId,
		parentType,
		signedIn = false,
	}: { parentId: string; parentType: StatementType; signedIn?: boolean } = $props();

	const choices = $derived(composerChoicesFor(parentType));
	let choice = $state<ComposerChoice>('standard');

	$effect(() => {
		if (choices.length && !choices.includes(choice)) choice = choices[0];
	});

	const labels: Record<ComposerChoice, string> = {
		'propose-option': 'Propose option',
		'ask-sub-question': 'Ask sub-question',
		standard: 'Standard',
		strengthen: 'Strengthen',
		critique: 'Critique',
	};
	const placeholders: Record<ComposerChoice, string> = {
		'propose-option': 'Propose an answer to this question…',
		'ask-sub-question': 'Refine with a sub-question…',
		standard: 'Add a standard reply…',
		strengthen: 'Add evidence that strengthens this claim…',
		critique: 'Point out a flaw or counter-argument…',
	};
</script>

{#if choices.length}
	<form method="POST" action="?/sendMessage" class="composer">
		<input type="hidden" name="parentId" value={parentId} />
		<div class="composer__pills" role="radiogroup" aria-label="Reply type">
			{#each choices as c (c)}
				<label class="pill pill--{c}" class:active={choice === c}>
					<input
						type="radio"
						name="kind"
						value={c}
						checked={choice === c}
						onchange={() => (choice = c)}
					/>
					{labels[c]}
				</label>
			{/each}
		</div>
		<textarea
			name="text"
			rows="2"
			required
			placeholder={placeholders[choice]}
			aria-label={labels[choice]}
		></textarea>
		<div class="composer__actions">
			{#if !signedIn}
				<span class="muted composer__hint">You'll be asked to sign in to post.</span>
			{/if}
			<button type="submit" class="composer__submit">Post</button>
		</div>
	</form>
{/if}

<style lang="scss">
	.composer {
		display: grid;
		gap: var(--space-sm);
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--space-md);

		&__pills {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-xs);
		}
		textarea {
			width: 100%;
			resize: vertical;
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			padding: var(--space-sm);
			font: inherit;
			color: var(--text-body);
			background: var(--bg-page);
		}
		&__actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: var(--space-sm);
		}
		&__hint {
			font-size: 0.8rem;
		}
		&__submit {
			background: var(--accent);
			color: var(--text-inverse);
			border: none;
			border-radius: var(--radius-pill);
			padding: var(--space-sm) var(--space-lg);
			font-weight: 600;
			cursor: pointer;
			&:hover {
				background: var(--accent-dark);
			}
		}
	}
	.pill {
		font-size: 0.78rem;
		padding: 4px 12px;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border);
		cursor: pointer;
		user-select: none;
		input {
			position: absolute;
			opacity: 0;
			width: 0;
			height: 0;
		}
		&.active {
			border-color: var(--accent);
			background: var(--bg-muted);
			font-weight: 600;
		}
		&--strengthen.active {
			border-color: var(--strengthen);
			color: var(--strengthen);
			background: var(--strengthen-soft);
		}
		&--critique.active {
			border-color: var(--critique);
			color: var(--critique);
			background: var(--critique-soft);
		}
	}
</style>
