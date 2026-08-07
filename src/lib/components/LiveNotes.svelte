<script lang="ts">
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { key as makeKey, type Key } from '$lib/music/key';
	import { midi } from '$lib/midi/shared.svelte';

	/*
	 * What is sounding, on every screen.
	 *
	 * Most pages have no use for the notes, and that is the point: the keyboard
	 * should feel connected everywhere, not only where something is being
	 * marked. A dead-feeling instrument on four screens out of six makes the
	 * whole app feel unreliable even when it is working.
	 */

	let { context = makeKey('C'), max = 6 }: { context?: Key; max?: number } = $props();

	const notes = $derived([...new Set(midi.live.map((n) => ((n % 12) + 12) % 12))].slice(0, max));
</script>

<div class="live-notes" aria-live="off" aria-label="Notes currently sounding">
	{#each notes as pc (pc)}
		<span class="pill" style="background: var(--pc-{pc}); color: var(--pc-{pc}-ink)"
			>{formatNote(spell(pc, context), { unicode: true })}</span
		>
	{:else}
		<span class="resting" aria-hidden="true"></span>
	{/each}
</div>

<style>
	.live-notes {
		display: flex;
		align-items: center;
		gap: 3px;
		min-width: 2.5rem;
		height: 1.6rem;
	}

	.pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.7rem;
		height: 1.6rem;
		padding: 0 0.35rem;
		border-radius: 5px;
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 600;
		/* Appearing should be instant; leaving can be gentle. */
		animation: pop 90ms var(--ease-wheel);
	}

	/* A faint bar when nothing is held, so the row does not collapse and the
	   header does not jump every time a chord is released. */
	.resting {
		width: 2.5rem;
		height: 3px;
		border-radius: 2px;
		background: var(--color-ground-line);
	}

	@keyframes pop {
		from {
			opacity: 0.4;
			transform: scale(0.9);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pill {
			animation: none;
		}
	}
</style>
