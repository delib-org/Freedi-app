<script lang="ts">
	import { enhance } from '$app/forms';
	import { StatementType } from '@freedi/shared-types';
	import { composerChoicesFor, type ComposerChoice } from '$lib/chat/node';
	import { formatLabeledLink, pastedUrl } from '$lib/chat/links';
	import Avatar from './Avatar.svelte';
	import { t } from '$lib/i18n';

	// Context-aware composer (§4.1 / §6). Reads the parent's type to offer the
	// right choices; posts to the `sendMessage` form action. Rendered as FB's
	// inline reply row: your avatar next to a rounded gray field.
	let {
		parentId,
		parentType,
		signedIn = false,
		userName = null,
		userPhotoURL = null,
	}: {
		parentId: string;
		parentType: StatementType;
		signedIn?: boolean;
		userName?: string | null;
		userPhotoURL?: string | null;
	} = $props();

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

	// Paste-a-link flow: when the clipboard is exactly one URL we hold it and
	// ask for a display word ("Google" → [Google](https://google.com)). Skipping
	// (or confirming with no word) inserts the bare URL — it still renders as a
	// clickable link, just without a friendly label.
	let textarea = $state<HTMLTextAreaElement>();
	let pendingUrl = $state<string | null>(null);
	let linkLabel = $state('');

	function onPaste(event: ClipboardEvent) {
		const url = pastedUrl(event.clipboardData?.getData('text/plain') ?? '');
		if (!url) return; // prose (even with URLs inside) pastes normally
		event.preventDefault();
		pendingUrl = url;
		linkLabel = '';
	}

	function insertAtCursor(snippet: string) {
		const el = textarea;
		if (!el) return;
		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? start;
		el.value = el.value.slice(0, start) + snippet + el.value.slice(end);
		const caret = start + snippet.length;
		el.setSelectionRange(caret, caret);
		el.focus();
	}

	function confirmLink() {
		if (!pendingUrl) return;
		const label = linkLabel.trim();
		insertAtCursor(label ? formatLabeledLink(label, pendingUrl) : pendingUrl);
		pendingUrl = null;
		linkLabel = '';
	}

	function skipLink() {
		if (!pendingUrl) return;
		insertAtCursor(pendingUrl);
		pendingUrl = null;
		linkLabel = '';
	}

	function onLabelKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			confirmLink();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			skipLink();
		}
	}

	function focusOnMount(el: HTMLInputElement) {
		el.focus();
	}
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
		<div class="composer__avatar">
			<Avatar name={userName ?? $t('Anonymous')} photoURL={userPhotoURL} size={32} />
		</div>
		<div class="composer__field">
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
			bind:this={textarea}
			onpaste={onPaste}
		></textarea>
		{#if pendingUrl}
			<div class="composer__link-prompt" role="group" aria-label={$t('Add a word for the link')}>
				<span class="composer__link-url" dir="ltr">{pendingUrl}</span>
				<div class="composer__link-controls">
					<input
						type="text"
						class="composer__link-input"
						placeholder={$t('Add a word for the link')}
						aria-label={$t('Add a word for the link')}
						bind:value={linkLabel}
						onkeydown={onLabelKeydown}
						use:focusOnMount
					/>
					<button type="button" class="composer__link-add" onclick={confirmLink}>
						{$t('Add link')}
					</button>
					<button type="button" class="composer__link-skip" onclick={skipLink}>
						{$t('Skip')}
					</button>
				</div>
			</div>
		{/if}
			<div class="composer__actions">
				{#if !signedIn}
					<span class="muted composer__hint">{$t("You'll be asked to sign in to post.")}</span>
				{/if}
				<button type="submit" class="composer__submit">{$t('Post')}</button>
			</div>
		</div>
	</form>
{/if}

<style lang="scss">
	@use '../../styles/mixins' as *;

	// FB inline reply: avatar on the start side, a rounded gray field that holds
	// the type pills, the textarea, and the actions.
	.composer {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);

		&__avatar {
			flex-shrink: 0;
		}

		&__field {
			flex: 1;
			min-width: 0;
			display: grid;
			gap: var(--space-sm);
			background: var(--bubble-other);
			border-radius: 18px;
			padding: var(--space-sm) 12px;
		}

		&__pills {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-xs);
		}
		textarea {
			width: 100%;
			resize: vertical;
			border: none;
			padding: var(--space-xs) 0;
			font: inherit;
			font-size: 0.9375rem;
			color: var(--text-body);
			background: transparent;
			outline: none;

			&::placeholder {
				color: var(--text-muted);
			}
		}
		&__link-prompt {
			display: grid;
			gap: var(--space-xs);
			padding: var(--space-sm) var(--space-md);
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-md);
			background: var(--eval-bg);
		}
		&__link-url {
			font-size: 0.75rem;
			color: var(--text-muted);
			word-break: break-all;
		}
		&__link-controls {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: var(--space-sm);
		}
		&__link-input {
			flex: 1;
			min-width: 10rem;
			border: 1px solid var(--glass-border);
			border-radius: var(--radius-md);
			padding: var(--space-xs) var(--space-sm);
			font: inherit;
			font-size: 0.85rem;
			color: var(--text-body);
			background: var(--bg-card);
			outline: none;
			transition: border-color 0.2s;

			&:focus {
				border-color: var(--accent);
			}
			&::placeholder {
				color: var(--text-muted);
			}
		}
		&__link-add {
			@include pill-button;
			background: var(--accent-gradient);
			color: #fff;
			font-size: 0.78rem;
			padding: var(--space-xs) var(--space-md);
		}
		&__link-skip {
			background: none;
			border: none;
			color: var(--text-muted);
			font: inherit;
			font-size: 0.78rem;
			font-weight: 600;
			cursor: pointer;
			padding: var(--space-xs);

			&:hover {
				color: var(--text-body);
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
			background: var(--accent-dark);
			color: #fff;
			padding: var(--space-sm) var(--space-lg);

			&:hover {
				filter: brightness(1.1);
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
