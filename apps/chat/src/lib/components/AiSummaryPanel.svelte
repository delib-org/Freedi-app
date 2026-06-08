<script lang="ts">
	import { slideFade } from '$lib/transitions';
	import { functionsClient } from '$lib/firebaseClient';

	// AI thread summary + revision (architecture.md §2). Calls the REAL
	// `generateDialecticalRevision` callable, which reads the whole subtree of
	// sub-statements and returns a thread summary + a revised claim. On localhost
	// this runs against the functions emulator. AI-authored text is marked for
	// SEO `digitalSourceType`.
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
	let count = $state(0);
	let cached = $state(false);

	async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
		const [fns, { httpsCallable }] = await Promise.all([
			functionsClient(),
			import('firebase/functions'),
		]);

		return (await httpsCallable<TReq, TRes>(fns, name)(data)).data;
	}

	async function generate() {
		open = true;
		busy = true;
		error = '';
		try {
			const res = await callFn<
				{ statementId: string },
				{
					summary: string;
					improvementSuggestion: string;
					descendantCount: number;
					cached?: boolean;
				}
			>('generateDialecticalRevision', { statementId });
			summary = res.summary;
			suggestion = res.improvementSuggestion;
			count = res.descendantCount ?? 0;
			cached = res.cached ?? false;
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
			<div
				class="ai__panel"
				data-digital-source="TrainedAlgorithmicMediaDigitalSource"
				transition:slideFade|local={{ duration: 260 }}
			>
				{#if error}
					<p class="ai__error">{error}</p>
				{:else if busy && !suggestion}
					<p class="muted">Reading the whole thread…</p>
				{:else}
					<h4 class="ai__h">
						Thread summary{#if count > 0}<span class="ai__count"> · {count} sub-statement{count === 1 ? '' : 's'}</span>{/if}{#if cached}<span class="ai__cached"> · ✓ up to date</span>{/if}
					</h4>
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
	@use '../../styles/mixins' as *;

	.ai {
		margin-top: var(--space-sm);
		&__trigger {
			@include pill-button;
			background: var(--eval-bg);
			border: 1px solid var(--glass-border);
			padding: 4px 14px;
			font-size: 0.75rem;
			color: var(--accent);

			&:hover {
				border-color: var(--accent);
			}
		}
		&__panel {
			@include glass;
			margin-top: var(--space-sm);
			border: 1px solid var(--accent);
			border-radius: var(--radius-md);
			padding: var(--space-md);
			box-shadow: 0 4px 18px rgba(99, 102, 241, 0.15);
		}
		&__h {
			margin: var(--space-sm) 0 var(--space-xs);
			font-size: 0.65rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: var(--accent);

			&:first-child {
				margin-top: 0;
			}
		}
		&__count {
			color: var(--text-muted);
			font-weight: 500;
			text-transform: none;
			letter-spacing: 0;
		}
		&__cached {
			color: var(--strengthen);
			font-weight: 600;
			text-transform: none;
			letter-spacing: 0;
		}
		&__suggestion {
			background: var(--amber-soft);
			border-left: 3px solid var(--amber-dark);
			padding: var(--space-sm) var(--space-md);
			border-radius: var(--radius-sm);
			font-style: italic;
		}
		&__accept {
			@include pill-button;
			margin-top: var(--space-sm);
			background: var(--amber-dark);
			color: #fff;
			padding: var(--space-xs) var(--space-lg);
			font-size: 0.78rem;

			&:hover {
				background: var(--amber);
			}
		}
		&__error {
			color: var(--critique);
		}
	}
</style>
