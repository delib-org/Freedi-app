<script lang="ts">
	// AI thread summary + revision (architecture.md §2). Lazily calls the
	// `generateDialecticalRevision` / `acceptDialecticalRevision` callables.
	// AI-authored text is marked for SEO `digitalSourceType`.
	let {
		statementId,
		signedIn = false,
		canAccept = false,
	}: { statementId: string; signedIn?: boolean; canAccept?: boolean } = $props();

	let open = $state(false);
	let busy = $state(false);
	let error = $state('');
	let summary = $state('');
	let suggestion = $state('');

	async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
		const [{ getApp }, { getFunctions, httpsCallable }] = await Promise.all([
			import('firebase/app'),
			import('firebase/functions'),
		]);
		const fns = getFunctions(getApp(), 'me-west1');

		return (await httpsCallable<TReq, TRes>(fns, name)(data)).data;
	}

	async function generate() {
		open = true;
		busy = true;
		error = '';
		try {
			const res = await callFn<{ statementId: string }, { summary: string; improvementSuggestion: string }>(
				'generateDialecticalRevision',
				{ statementId },
			);
			summary = res.summary;
			suggestion = res.improvementSuggestion;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to generate';
		} finally {
			busy = false;
		}
	}

	async function accept() {
		busy = true;
		error = '';
		try {
			await callFn<{ statementId: string }, { accepted: boolean }>('acceptDialecticalRevision', {
				statementId,
			});
			open = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to accept';
		} finally {
			busy = false;
		}
	}
</script>

{#if signedIn}
	<div class="ai">
		<button class="ai__trigger" onclick={generate} disabled={busy}>
			✨ {busy && !suggestion ? 'Summarizing…' : 'AI Summary'}
		</button>

		{#if open}
			<div class="ai__panel" data-digital-source="TrainedAlgorithmicMediaDigitalSource">
				{#if error}
					<p class="ai__error">{error}</p>
				{:else if busy && !suggestion}
					<p class="muted">Reading the debate…</p>
				{:else}
					<h4 class="ai__h">Thread summary</h4>
					<p class="ai__summary">{summary}</p>
					<h4 class="ai__h">Suggested revision</h4>
					<p class="ai__suggestion">{suggestion}</p>
					{#if canAccept}
						<button class="ai__accept" onclick={accept} disabled={busy}>
							{busy ? 'Applying…' : 'Accept revision'}
						</button>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style lang="scss">
	.ai {
		margin-top: var(--space-sm);
		&__trigger {
			background: none;
			border: 1px solid var(--border);
			border-radius: var(--radius-pill);
			padding: 2px 12px;
			font-size: 0.78rem;
			cursor: pointer;
			color: var(--accent);
		}
		&__panel {
			margin-top: var(--space-sm);
			background: var(--bg-muted);
			border: 1px solid var(--border);
			border-radius: var(--radius-md);
			padding: var(--space-md);
		}
		&__h {
			margin: var(--space-sm) 0 var(--space-xs);
			font-size: 0.8rem;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--text-muted);
		}
		&__suggestion {
			background: rgba(230, 168, 23, 0.12);
			border-left: 3px solid var(--c-mid);
			padding: var(--space-sm);
			border-radius: var(--radius-sm);
		}
		&__accept {
			margin-top: var(--space-sm);
			background: var(--strengthen);
			color: var(--text-inverse);
			border: none;
			border-radius: var(--radius-pill);
			padding: var(--space-xs) var(--space-lg);
			font-weight: 600;
			cursor: pointer;
		}
		&__error {
			color: var(--critique);
		}
	}
</style>
