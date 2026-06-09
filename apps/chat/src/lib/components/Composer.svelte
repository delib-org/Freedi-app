<script lang="ts">
	import { enhance } from '$app/forms';
	import { StatementType } from '@freedi/shared-types';
	import { composerChoicesFor, type ComposerChoice } from '$lib/chat/node';
	import { t } from '$lib/i18n';

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
	<form
		method="POST"
		action="?/sendMessage"
		class="composer"
		use:enhance={() => {
			return async ({ result, update }) => {
				if (result.type === 'success') {
					await update(); // resets the textarea + invalidates so the new node shows
				} else {
					await update({ reset: false });
				}
			};
		}}
	>
		<input type="hidden" name="parentId" value={parentId} />
		<div class="composer__pills" role="radiogroup" aria-label={$t('Reply type')}>
			{#each choices as c (c)}
				<label class="pill pill--{c}" class:active={choice === c}>
					<input
						type="radio"
						name="kind"
						value={c}
						checked={choice === c}
						onchange={() => (choice = c)}
					/>
					{$t(labels[c])}
				</label>
			{/each}
		</div>
		<textarea
			name="text"
			rows="2"
			required
			placeholder={$t(placeholders[choice])}
			aria-label={$t(labels[choice])}
		></textarea>
		<div class="composer__actions">
			{#if !signedIn}
				<span class="muted composer__hint">{$t("You'll be asked to sign in to post.")}</span>
			{/if}
			<button type="submit" class="composer__submit">{$t('Post')}</button>
		</div>
	</form>
{/if}

<style lang="scss">
	@use '../../styles/mixins' as *;

	.composer {
		@include glass;
		display: grid;
		gap: var(--space-sm);
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
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-md);
			padding: var(--space-sm) var(--space-md);
			font: inherit;
			font-size: 0.95rem;
			color: var(--text-body);
			background: var(--eval-bg);
			outline: none;
			transition: border-color 0.2s, background 0.2s;

			&:focus {
				border-color: rgba(99, 102, 241, 0.5);
				background: var(--bubble-other);
			}
			&::placeholder {
				color: var(--text-muted);
			}
		}
		&__actions {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: var(--space-md);
		}
		&__hint {
			font-size: 0.8rem;
			margin-inline-end: auto;
		}
		&__submit {
			@include pill-button;
			background: var(--accent-gradient);
			color: #fff;
			padding: var(--space-sm) var(--space-lg);
			box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35);

			&:hover {
				box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
			}
		}
	}
	.pill {
		font-size: 0.75rem;
		padding: 5px 14px;
		border-radius: var(--radius-md);
		border: 1px solid var(--glass-border);
		background: var(--eval-bg);
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		transition: all 0.2s;
		input {
			position: absolute;
			opacity: 0;
			width: 0;
			height: 0;
		}
		&:hover {
			color: var(--text-body);
			background: var(--eval-btn);
		}
		&.active {
			border-color: var(--accent);
			background: var(--eval-btn);
			color: var(--text-body);
			font-weight: 600;
		}
		&--strengthen.active {
			border-color: var(--strengthen-border);
			color: var(--strengthen);
			background: var(--strengthen-soft);
		}
		&--critique.active {
			border-color: var(--critique-border);
			color: var(--critique);
			background: var(--critique-soft);
		}
	}
</style>
