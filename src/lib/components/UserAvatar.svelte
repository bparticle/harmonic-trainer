<script lang="ts">
	import { avatarTraits } from '$lib/design/avatar';

	let { name, size = 32 }: { name: string; size?: number } = $props();
	const traits = $derived(avatarTraits(name));

	const note = (pitchClass: number) => `var(--pc-${pitchClass})`;
	const deep = (pitchClass: number) => `var(--pc-${pitchClass}-deep)`;
</script>

<!--
	A chromatic portrait: four pitch colours and one geometric voice, all picked
	from the name. It is decorative because the adjacent text carries the person's
	identity more accessibly than an abstract image can.
-->
<svg
	class="chromatic-avatar"
	viewBox="0 0 48 48"
	style={`width:${size}px;height:${size}px`}
	aria-hidden="true"
>
	<rect width="48" height="48" fill={deep(traits.field)} />
	<circle cx={traits.orbitX} cy={traits.orbitY} r={19 * traits.scale} fill={note(traits.orbit)} />

	<g
		transform={`rotate(${traits.rotation} 24 24) ${traits.flip ? 'translate(48 0) scale(-1 1)' : ''}`}
	>
		<rect x="-6" y="20" width="60" height="9" rx="1.5" fill={note(traits.mark)} />
		<rect x="-6" y="24" width="60" height="2" fill="var(--color-ground)" />
	</g>

	{#if traits.variant === 0}
		<path d="M24 8 39 24 24 40 9 24Z" fill={note(traits.spark)} />
		<path d="M24 17 31 24 24 31 17 24Z" fill="var(--color-ground-raised)" />
	{:else if traits.variant === 1}
		<path d="M24 7 41 38H7Z" fill={note(traits.spark)} />
		<circle cx="24" cy="26" r="6" fill="var(--color-ground-raised)" />
	{:else if traits.variant === 2}
		<circle cx="19" cy="24" r="11" fill={note(traits.spark)} />
		<circle cx="31" cy="24" r="8" fill="var(--color-ground-raised)" />
		<circle cx="31" cy="24" r="3" fill={note(traits.field)} />
	{:else}
		<path d="M10 12h17v8h11v16H21v-8H10Z" fill={note(traits.spark)} />
		<rect x="19" y="18" width="10" height="12" fill="var(--color-ground-raised)" />
	{/if}

	<circle cx="38" cy="10" r="3" fill={note(traits.field)} />
</svg>

<style>
	.chromatic-avatar {
		display: block;
		flex: none;
		overflow: hidden;
		border-radius: 50%;
		box-shadow:
			inset 0 0 0 1px var(--color-ground-line),
			0 0 0 1px var(--color-ground);
	}
</style>
