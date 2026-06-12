<script lang="ts">
	// FB-style circular avatar: the user's photo when available, otherwise the
	// first letter of their name on a deterministic per-name hue.
	let {
		name = null,
		photoURL = null,
		size = 32,
	}: {
		name?: string | null;
		photoURL?: string | null;
		size?: number;
	} = $props();

	const displayName = $derived(name?.trim() || '');
	const initial = $derived(displayName ? displayName.charAt(0).toUpperCase() : '?');

	// Cheap stable string hash → hue, so the same author always gets the same color.
	const hue = $derived.by(() => {
		let h = 0;
		for (let i = 0; i < displayName.length; i++) {
			h = (h * 31 + displayName.charCodeAt(i)) % 360;
		}

		return h;
	});
</script>

{#if photoURL}
	<img
		class="avatar"
		style:--avatar-size="{size}px"
		src={photoURL}
		alt={displayName}
		width={size}
		height={size}
		loading="lazy"
		referrerpolicy="no-referrer"
	/>
{:else}
	<span
		class="avatar avatar--initial"
		style:--avatar-size="{size}px"
		style:--avatar-hue={hue}
		aria-hidden="true"
	>
		{initial}
	</span>
{/if}

<style lang="scss">
	.avatar {
		width: var(--avatar-size);
		height: var(--avatar-size);
		flex-shrink: 0;
		border-radius: 50%;
		object-fit: cover;
		background: var(--bg-muted);

		&--initial {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			background: hsl(var(--avatar-hue), 55%, 45%);
			color: #fff;
			font-size: calc(var(--avatar-size) * 0.45);
			font-weight: 600;
			line-height: 1;
			user-select: none;
		}
	}
</style>
