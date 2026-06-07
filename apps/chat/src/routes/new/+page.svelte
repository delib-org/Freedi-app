<script lang="ts">
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Start a question — Dialectical Chat</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page new">
	<nav class="breadcrumb"><a href="/">← All questions</a></nav>
	<h1>Start a question</h1>
	<p class="muted">Ask something people can answer with options, then debate with evidence.</p>

	<form method="POST" class="new__form">
		<textarea
			name="text"
			rows="3"
			required
			placeholder="e.g. Should our city ban cars from the old town?"
			aria-label="Question"
		></textarea>

		<fieldset class="new__visibility">
			<legend>Visibility</legend>
			<label><input type="radio" name="visibility" value="public" checked /> Public — listed & crawlable</label>
			<label><input type="radio" name="visibility" value="unlisted" /> Unlisted — by link only</label>
			<label><input type="radio" name="visibility" value="private" /> Private — members only</label>
		</fieldset>

		{#if form?.error}<p class="new__error">{form.error}</p>{/if}
		{#if !data.signedIn}<p class="muted">You'll be asked to sign in to create it.</p>{/if}

		<button type="submit" class="new__submit">Create question</button>
	</form>
</main>

<style lang="scss">
	.breadcrumb {
		font-size: 0.85rem;
		margin-bottom: var(--space-md);
	}
	.new__form {
		display: grid;
		gap: var(--space-md);
		margin-top: var(--space-lg);
		max-width: 560px;
		textarea {
			width: 100%;
			resize: vertical;
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			padding: var(--space-sm);
			font: inherit;
			color: var(--text-body);
			background: var(--bg-card);
		}
	}
	.new__visibility {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-sm) var(--space-md);
		display: grid;
		gap: var(--space-xs);
		legend {
			padding: 0 var(--space-xs);
			color: var(--text-muted);
			font-size: 0.85rem;
		}
		label {
			font-size: 0.9rem;
		}
	}
	.new__error {
		color: var(--critique);
	}
	.new__submit {
		background: var(--accent);
		color: var(--text-inverse);
		border: none;
		border-radius: var(--radius-pill);
		padding: var(--space-sm) var(--space-xl);
		font-weight: 600;
		cursor: pointer;
		justify-self: start;
	}
</style>
