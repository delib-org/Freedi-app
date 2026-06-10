<!--
  Global notification settings (Ring 3). Simple-first: the master mute sits at
  the top, channels + frequency + quiet hours below. Per-discussion controls
  live on each question, not here.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n';
	import { NotificationFrequency, type NotificationSettings } from '@freedi/shared-types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Plain (non-reactive) snapshot of the loaded settings — the form below is an
	// intentional editable copy seeded once from this initial load.
	const initial = untrack(() => data.settings);
	let muted = $state(initial.muted);
	let channelInApp = $state(initial.defaultChannels.inApp);
	let channelPush = $state(initial.defaultChannels.push);
	let channelEmail = $state(initial.defaultChannels.email);
	let frequency = $state<NotificationFrequency>(initial.defaultFrequency);
	let quietEnabled = $state(initial.quietHours?.enabled ?? false);
	let quietStart = $state(initial.quietHours?.startTime ?? '21:00');
	let quietEnd = $state(initial.quietHours?.endTime ?? '08:00');

	let saving = $state(false);
	let savedAt = $state(0);
	let error = $state('');

	const FREQUENCIES: { value: NotificationFrequency; label: () => string }[] = [
		{ value: NotificationFrequency.INSTANT, label: () => $t('Instant') },
		{ value: NotificationFrequency.DAILY, label: () => $t('Daily') },
		{ value: NotificationFrequency.WEEKLY, label: () => $t('Weekly') },
		{ value: NotificationFrequency.NONE, label: () => $t('Off') },
	];

	function browserTimezone(): string {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		} catch {
			return 'UTC';
		}
	}

	async function save() {
		saving = true;
		error = '';
		const patch: Partial<NotificationSettings> = {
			muted,
			defaultChannels: { inApp: channelInApp, push: channelPush, email: channelEmail },
			defaultFrequency: frequency,
			quietHours: {
				enabled: quietEnabled,
				startTime: quietStart,
				endTime: quietEnd,
				timezone: data.settings.quietHours?.timezone ?? browserTimezone(),
			},
		};
		try {
			const res = await fetch('/api/notifications/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ patch }),
			});
			if (!res.ok) throw new Error('save-failed');
			savedAt = Date.now();
		} catch {
			error = $t('Could not save. Please try again.');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>{$t('Notification settings')}</title></svelte:head>

<main class="settings">
	<header class="settings__head">
		<a class="settings__back" href="/">← {$t('Back')}</a>
		<h1 class="settings__title">{$t('Notification settings')}</h1>
	</header>

	<!-- Master mute -->
	<section class="settings__card">
		<label class="settings__row">
			<span class="settings__row-main">
				<span class="settings__row-title">{$t('Pause all notifications')}</span>
				<span class="settings__row-sub">{$t('Turn off every notification until you switch this back on.')}</span>
			</span>
			<input class="settings__switch" type="checkbox" bind:checked={muted} role="switch" />
		</label>
	</section>

	<fieldset class="settings__card" disabled={muted} class:settings__card--off={muted}>
		<legend class="settings__legend">{$t('Channels')}</legend>

		<label class="settings__row">
			<span class="settings__row-main">
				<span class="settings__row-title">{$t('In-app')}</span>
				<span class="settings__row-sub">{$t('Show notifications inside the app')}</span>
			</span>
			<input class="settings__switch" type="checkbox" bind:checked={channelInApp} role="switch" />
		</label>

		<label class="settings__row">
			<span class="settings__row-main">
				<span class="settings__row-title">{$t('Push')}</span>
				<span class="settings__row-sub">{$t('Send push notifications to this device')}</span>
			</span>
			<input class="settings__switch" type="checkbox" bind:checked={channelPush} role="switch" />
		</label>

		<label class="settings__row">
			<span class="settings__row-main">
				<span class="settings__row-title">{$t('Email')}</span>
				<span class="settings__row-sub">{$t('Send email notifications')}</span>
			</span>
			<input class="settings__switch" type="checkbox" bind:checked={channelEmail} role="switch" />
		</label>
	</fieldset>

	<fieldset class="settings__card" disabled={muted} class:settings__card--off={muted}>
		<legend class="settings__legend">{$t('How often')}</legend>
		<div class="settings__choices">
			{#each FREQUENCIES as f (f.value)}
				<label class="settings__choice" class:settings__choice--active={frequency === f.value}>
					<input type="radio" name="frequency" value={f.value} bind:group={frequency} />
					<span>{f.label()}</span>
				</label>
			{/each}
		</div>
	</fieldset>

	<fieldset class="settings__card" disabled={muted} class:settings__card--off={muted}>
		<legend class="settings__legend">{$t('Quiet hours')}</legend>
		<label class="settings__row">
			<span class="settings__row-main">
				<span class="settings__row-title">{$t('Pause notifications during set hours')}</span>
			</span>
			<input class="settings__switch" type="checkbox" bind:checked={quietEnabled} role="switch" />
		</label>
		{#if quietEnabled}
			<div class="settings__times">
				<label class="settings__time">
					<span>{$t('From')}</span>
					<input type="time" bind:value={quietStart} />
				</label>
				<label class="settings__time">
					<span>{$t('To')}</span>
					<input type="time" bind:value={quietEnd} />
				</label>
			</div>
		{/if}
	</fieldset>

	<footer class="settings__foot">
		{#if error}
			<span class="settings__msg settings__msg--error">{error}</span>
		{:else if savedAt > 0 && !saving}
			<span class="settings__msg settings__msg--ok">{$t('Saved')}</span>
		{/if}
		<button class="settings__save" onclick={save} disabled={saving}>
			{saving ? $t('Saving…') : $t('Save')}
		</button>
	</footer>
</main>

<style lang="scss">
	@use '../../../styles/mixins' as *;

	.settings {
		max-width: 560px;
		margin: 0 auto;
		padding: var(--space-lg) var(--space-md);
		display: flex;
		flex-direction: column;
		gap: var(--space-md);

		&__head {
			display: flex;
			flex-direction: column;
			gap: var(--space-xs);
		}
		&__back {
			font-size: 0.85rem;
			color: var(--text-muted);
			&:hover {
				color: var(--accent);
				text-decoration: none;
			}
		}
		&__title {
			margin: 0;
			font-size: 1.3rem;
			@include text-gradient;
		}

		&__card {
			@include glass;
			border-radius: var(--radius-md);
			padding: var(--space-sm) var(--space-md);
			display: flex;
			flex-direction: column;
			border: 1px solid var(--glass-border);

			&--off {
				opacity: 0.55;
			}
		}
		&__legend {
			font-size: 0.78rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--text-muted);
			padding: var(--space-xs) 0;
		}

		&__row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-md);
			padding: var(--space-sm) 0;
			cursor: pointer;

			& + & {
				border-top: 1px solid var(--glass-border);
			}
		}
		&__row-main {
			display: flex;
			flex-direction: column;
			gap: 2px;
		}
		&__row-title {
			font-size: 0.9rem;
			font-weight: 600;
		}
		&__row-sub {
			font-size: 0.78rem;
			color: var(--text-muted);
		}

		&__switch {
			flex: 0 0 auto;
			width: 40px;
			height: 22px;
			cursor: pointer;
			accent-color: var(--accent);
		}

		&__choices {
			display: flex;
			flex-wrap: wrap;
			gap: var(--space-sm);
			padding-block: var(--space-sm);
		}
		&__choice {
			display: inline-flex;
			align-items: center;
			gap: var(--space-xs);
			padding: 6px 14px;
			border-radius: var(--radius-pill);
			border: 1px solid var(--glass-border);
			background: var(--eval-btn);
			font-size: 0.85rem;
			cursor: pointer;

			input {
				accent-color: var(--accent);
			}
			&--active {
				border-color: var(--accent);
				background: var(--question-soft);
			}
		}

		&__times {
			display: flex;
			gap: var(--space-md);
			padding-block: var(--space-sm);
		}
		&__time {
			display: flex;
			flex-direction: column;
			gap: var(--space-xs);
			font-size: 0.8rem;
			color: var(--text-muted);

			input {
				background: var(--eval-btn);
				border: 1px solid var(--glass-border);
				border-radius: var(--radius-sm);
				color: var(--text-body);
				padding: 6px 10px;
				font-size: 0.9rem;
			}
		}

		&__foot {
			display: flex;
			align-items: center;
			justify-content: flex-end;
			gap: var(--space-md);
		}
		&__msg {
			font-size: 0.82rem;
			&--ok {
				color: var(--strengthen);
			}
			&--error {
				color: var(--critique);
			}
		}
		&__save {
			@include pill-button;
			padding: 8px 22px;
			background: var(--accent-gradient);
			color: #fff;
			border: none;
			font-weight: 600;

			&:disabled {
				opacity: 0.6;
				cursor: default;
			}
		}
	}
</style>
