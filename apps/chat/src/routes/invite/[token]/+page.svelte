<script lang="ts">
	import { get } from 'svelte/store';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { auth, functionsClient } from '$lib/firebaseClient';
	import { t } from '$lib/i18n';

	// Private invite redeem (§2). Lazy Google sign-in → mint session cookie →
	// call the `redeemInvite` callable → land in the private conversation.
	let busy = $state(false);
	let errorMsg = $state('');
	const token = $derived(page.params.token ?? '');

	async function redeem() {
		busy = true;
		errorMsg = '';
		try {
			const a = await auth();
			const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
			const cred = await signInWithPopup(a, new GoogleAuthProvider());
			const idToken = await cred.user.getIdToken();
			await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ idToken }),
			});

			const [fns, { httpsCallable }] = await Promise.all([
				functionsClient(),
				import('firebase/functions'),
			]);
			const call = httpsCallable<{ token: string }, { topParentId: string }>(fns, 'redeemInvite');
			const res = await call({ token });

			await goto(`/q/${res.data.topParentId}`, { invalidateAll: true });
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : get(t)('Could not redeem invite');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{$t('Join private conversation — Dialectical Chat')}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page invite">
	<h1>{$t("You've been invited")}</h1>
	<p class="muted">{$t('Sign in with Google to join this private conversation.')}</p>
	<button class="invite__btn" onclick={redeem} disabled={busy}>
		{busy ? $t('Joining…') : $t('Accept invite')}
	</button>
	{#if errorMsg}<p class="invite__error">{errorMsg}</p>{/if}
</main>

<style lang="scss">
	.invite {
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
			cursor: pointer;
			&:disabled {
				opacity: 0.6;
			}
		}
		&__error {
			color: var(--critique);
			margin-top: var(--space-md);
		}
	}
</style>
