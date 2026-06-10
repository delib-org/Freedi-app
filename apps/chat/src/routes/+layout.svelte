<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import '../styles/global.scss';
	import { initLang, lang, setLanguage, t } from '$lib/i18n';
	import { signOutEverywhere } from '$lib/firebaseClient';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
	import ToastOverlay from '$lib/components/notifications/ToastOverlay.svelte';
	import LanguageMenu from '$lib/components/LanguageMenu.svelte';
	import { initInstallCapture } from '$lib/installPrompt';

	let { children, data } = $props();

	let signingOut = $state(false);
	let theme = $state<'dark' | 'light'>('dark');

	function applyTheme(t: 'dark' | 'light') {
		theme = t;
		document.documentElement.setAttribute('data-theme', t);
		localStorage.setItem('chat.theme', t);
	}

	function toggleTheme() {
		applyTheme(theme === 'dark' ? 'light' : 'dark');
	}

	async function onLanguageChange(next: string) {
		setLanguage(next);
		// Remember the choice on the user's account (cross-device). The cookie /
		// localStorage copy that setLanguage() wrote already covers SSR, so this
		// is best-effort and non-blocking.
		if (!data.user) return;
		try {
			await fetch('/api/user/language', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ lang: next }),
			});
		} catch {
			// Ignore — the local copy still persists the choice for this device.
		}
	}

	onMount(() => {
		initLang(data.lang);
		const stored = localStorage.getItem('chat.theme') as 'dark' | 'light' | null;
		const initial =
			stored ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
		applyTheme(initial);

		// Capture the Android/desktop install prompt so we can offer it at an
		// intent moment (iOS has no programmatic prompt — handled separately).
		return initInstallCapture();
	});

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
			<span class="topbar__name">{$t('Dialectical Chat')}</span>
		</a>

		<nav class="topbar__nav">
			<a class="topbar__link" href="/new">{$t('Start a question')}</a>
			<LanguageMenu current={$lang} onChange={onLanguageChange} />
			<button
				class="topbar__theme"
				onclick={toggleTheme}
				title={$t('Toggle light / dark')}
				aria-label={$t('Toggle light or dark theme')}
			>{theme === 'dark' ? '☀️' : '🌙'}</button>
			{#if data.user}
				<NotificationBell uid={data.user.uid} />
				<a class="topbar__user" href={`/u/${data.user.uid}`} title={$t('Your profile')}>
					{#if data.user.photoURL}
						<img class="topbar__avatar" src={data.user.photoURL} alt="" />
					{/if}
					<span class="topbar__username"
						>{data.user.displayName ?? data.user.email ?? $t('You')}</span
					>
				</a>
				<button
					class="topbar__btn topbar__btn--icon"
					onclick={signOut}
					disabled={signingOut}
					title={$t('Sign out')}
					aria-label={$t('Sign out')}
				>
					{#if signingOut}
						<span class="topbar__btn-text">…</span>
					{:else}
						<svg
							class="topbar__btn-icon"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<polyline points="16 17 21 12 16 7" />
							<line x1="21" y1="12" x2="9" y2="12" />
						</svg>
						<span class="topbar__btn-text">{$t('Sign out')}</span>
					{/if}
				</button>
			{:else}
				<a class="topbar__btn topbar__btn--primary" href={signInHref}>{$t('Sign in')}</a>
			{/if}
		</nav>
	</div>
</header>

{@render children()}

{#if data.user}
	<ToastOverlay />
{/if}

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
			gap: var(--space-sm);
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

		&__theme {
			width: 34px;
			height: 34px;
			border-radius: var(--radius-pill);
			border: 1px solid var(--glass-border);
			background: var(--eval-btn);
			cursor: pointer;
			font-size: 0.95rem;
			line-height: 1;
			transition: transform 0.15s var(--ease-spring), border-color 0.2s;

			&:hover {
				transform: scale(1.1);
				border-color: var(--accent);
			}
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
		&__btn-icon {
			display: none; // Desktop shows the text label; icon is mobile-only.
			width: 1.15rem;
			height: 1.15rem;
		}
	}

	@media (max-width: 480px) {
		.topbar__link {
			display: none;
		}
		.topbar__username {
			display: none;
		}
		.topbar__inner {
			gap: var(--space-sm);
		}
		.topbar__name {
			white-space: nowrap;
			font-size: 0.95rem;
		}
		.topbar__btn {
			white-space: nowrap;
		}
		// Collapse the sign-out button to an icon-only square on mobile.
		.topbar__btn--icon {
			padding: 6px;
			width: 34px;
			height: 34px;
			display: inline-flex;
			align-items: center;
			justify-content: center;
		}
		.topbar__btn--icon .topbar__btn-text {
			display: none;
		}
		.topbar__btn--icon .topbar__btn-icon {
			display: block;
		}
	}
</style>
