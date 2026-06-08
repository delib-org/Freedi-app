<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import '../styles/global.scss';
	import { initLang, lang, setLanguage, t, LANGS, LANGUAGE_NAMES } from '$lib/i18n';
	import { signOutEverywhere } from '$lib/firebaseClient';

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
			<select
				class="topbar__lang"
				value={$lang}
				onchange={(e) => onLanguageChange((e.currentTarget as HTMLSelectElement).value)}
				title={$t('Language')}
				aria-label={$t('Language')}
			>
				{#each LANGS as code (code)}
					<option value={code}>{LANGUAGE_NAMES[code]}</option>
				{/each}
			</select>
			<button
				class="topbar__theme"
				onclick={toggleTheme}
				title={$t('Toggle light / dark')}
				aria-label={$t('Toggle light or dark theme')}
			>{theme === 'dark' ? '☀️' : '🌙'}</button>
			{#if data.user}
				<a class="topbar__user" href={`/u/${data.user.uid}`} title={$t('Your profile')}>
					{#if data.user.photoURL}
						<img class="topbar__avatar" src={data.user.photoURL} alt="" />
					{/if}
					<span class="topbar__username"
						>{data.user.displayName ?? data.user.email ?? $t('You')}</span
					>
				</a>
				<button class="topbar__btn" onclick={signOut} disabled={signingOut}>
					{signingOut ? '…' : $t('Sign out')}
				</button>
			{:else}
				<a class="topbar__btn topbar__btn--primary" href={signInHref}>{$t('Sign in')}</a>
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

		&__lang {
			height: 34px;
			border-radius: var(--radius-pill);
			border: 1px solid var(--glass-border);
			background: var(--eval-btn);
			color: var(--text-body);
			cursor: pointer;
			font: inherit;
			font-size: 0.82rem;
			padding: 0 var(--space-sm);
			transition: border-color 0.2s;

			&:hover {
				border-color: var(--accent);
			}
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
	}
</style>
