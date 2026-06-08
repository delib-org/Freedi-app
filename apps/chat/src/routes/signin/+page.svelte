<script lang="ts">
	import { get } from 'svelte/store';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/firebaseClient';
	import { t } from '$lib/i18n';

	// Lazy Google sign-in (§6.4). Never gates reading; draft-preserving — returns
	// to the page the user was on (and the parent they were replying to).
	let busy = $state(false);
	let errorMsg = $state('');

	const redirectTo = $derived(page.url.searchParams.get('redirectTo') ?? '/');

	async function signIn() {
		busy = true;
		errorMsg = '';
		try {
			const a = await auth();
			const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
			const cred = await signInWithPopup(a, new GoogleAuthProvider());
			const idToken = await cred.user.getIdToken();

			const res = await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ idToken }),
			});
			if (!res.ok) throw new Error(get(t)('Session creation failed'));

			await goto(redirectTo, { invalidateAll: true });
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : get(t)('Sign-in failed');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{$t('Sign in — Dialectical Chat')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page signin">
	<h1>{$t('Sign in')}</h1>
	<p class="muted">{$t('Reading is always open. Sign in to post answers, evidence, and votes.')}</p>
	<button class="signin__btn" onclick={signIn} disabled={busy}>
		{busy ? $t('Signing in…') : $t('Continue with Google')}
	</button>
	{#if errorMsg}
		<p class="signin__error">{errorMsg}</p>
	{/if}
	<a class="muted signin__skip" href={redirectTo}>{$t('Back without signing in')}</a>
</main>

<style lang="scss">
	.signin {
		max-width: 420px;
		text-align: center;
		&__btn {
			margin-top: var(--space-lg);
			background: var(--accent);
			color: var(--text-inverse);
			border: none;
			border-radius: var(--radius-pill);
			padding: var(--space-sm) var(--space-xl);
			font-weight: 600;
			font-size: 1rem;
			cursor: pointer;
			&:disabled {
				opacity: 0.6;
				cursor: default;
			}
		}
		&__error {
			color: var(--critique);
			margin-top: var(--space-md);
		}
		&__skip {
			display: block;
			margin-top: var(--space-lg);
			font-size: 0.85rem;
		}
	}
</style>
