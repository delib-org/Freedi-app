<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import '../styles/global.scss';
	import { initLang } from '$lib/i18n';
	import { signOutEverywhere } from '$lib/firebaseClient';

	let { children, data } = $props();

	let signingOut = $state(false);

	onMount(() => initLang());

	const signInHref = $derived(`/signin?redirectTo=${encodeURIComponent(page.url.pathname)}`);

	async function signOut() {
		signingOut = true;
		try {
			await signOutEverywhere();
			await invalidateAll();
			await goto('/');
		} finally {
			signingOut = false;
		}
	}
</script>

<header class="topbar">
	<div class="topbar__inner">
		<a class="topbar__brand" href="/">
			<span class="topbar__logo">◆</span>
			<span class="topbar__name">Dialectical Chat</span>
		</a>

		<nav class="topbar__nav">
			<a class="topbar__link" href="/new">Start a question</a>
			{#if data.user}
				<a class="topbar__user" href={`/u/${data.user.uid}`} title="Your profile">
					{#if data.user.photoURL}
						<img class="topbar__avatar" src={data.user.photoURL} alt="" />
					{/if}
					<span class="topbar__username"
						>{data.user.displayName ?? data.user.email ?? 'You'}</span
					>
				</a>
				<button class="topbar__btn" onclick={signOut} disabled={signingOut}>
					{signingOut ? '…' : 'Sign out'}
				</button>
			{:else}
				<a class="topbar__btn topbar__btn--primary" href={signInHref}>Sign in</a>
			{/if}
		</nav>
	</div>
</header>

{@render children()}

<style lang="scss">
	@use '../styles/mixins' as *;

	.topbar {
		position: sticky;
		top: 0;
		z-index: 50;
		@include glass;
		border-left: none;
		border-right: none;
		border-top: none;

		&__inner {
			max-width: var(--max-width);
			margin: 0 auto;
			padding: var(--space-sm) var(--space-md);
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-md);
		}

		&__brand {
			display: inline-flex;
			align-items: center;
			gap: var(--space-sm);
			font-weight: 700;
			color: var(--text-body);

			&:hover {
				text-decoration: none;
			}
		}
		&__logo {
			color: var(--accent);
			font-size: 1.1rem;
		}
		&__name {
			@include text-gradient;
		}

		&__nav {
			display: flex;
			align-items: center;
			gap: var(--space-md);
		}
		&__link {
			font-size: 0.85rem;
			font-weight: 600;
			color: var(--text-muted);

			&:hover {
				color: var(--accent);
				text-decoration: none;
			}
		}

		&__user {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			font-size: 0.85rem;
			font-weight: 600;
			color: var(--text-body);
			max-width: 160px;

			&:hover {
				text-decoration: none;
				color: var(--accent);
			}
		}
		&__avatar {
			width: 24px;
			height: 24px;
			border-radius: var(--radius-pill);
			object-fit: cover;
		}
		&__username {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		&__btn {
			@include pill-button;
			font-size: 0.82rem;
			padding: 6px 14px;
			background: var(--eval-btn);
			border: 1px solid var(--glass-border);
			color: var(--text-body);

			&:hover {
				border-color: var(--accent);
			}
			&--primary {
				background: var(--accent-gradient);
				color: #fff;
				border: none;
			}
		}
	}

	@media (max-width: 480px) {
		.topbar__link {
			display: none;
		}
		.topbar__username {
			display: none;
		}
	}
</style>
