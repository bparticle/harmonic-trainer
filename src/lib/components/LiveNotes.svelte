<script lang="ts">
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { key as makeKey, type Key } from '$lib/music/key';
	import { midi } from '$lib/midi/shared.svelte';
	import { classify } from '$lib/practice/match';
	import { target } from '$lib/practice/target.svelte';

	/*
	 * What is sounding, on every screen.
	 *
	 * Most pages have no use for the notes, and that is the point: the keyboard
	 * should feel connected everywhere, not only where something is being
	 * marked. A dead-feeling instrument on four screens out of six makes the
	 * whole app feel unreliable even when it is working.
	 *
	 * When something *has* named a chord to play — a backing track, so far —
	 * each pill also says where that note sits against it. This row was already
	 * being used that way, by eye, against the colours on the chart below it;
	 * the colours have always agreed, so all that was missing was the app
	 * saying so.
	 */

	let { context = makeKey('C'), max = 6 }: { context?: Key; max?: number } = $props();

	const notes = $derived([...new Set(midi.live.map((n) => ((n % 12) + 12) % 12))].slice(0, max));

	// Nothing asking for a chord means no marking at all, which is every screen
	// except a play-along and every moment of that one before you press play.
	const kindOf = (pc: number) => (target.current ? classify(pc, target.current) : null);

	const SPOKEN: Record<string, string> = {
		chord: 'chord tone',
		colour: 'in key',
		outside: 'outside the key'
	};
</script>

<div class="live-notes" aria-live="off" aria-label="Notes currently sounding">
	{#each notes as pc (pc)}
		{@const kind = kindOf(pc)}
		<span
			class="pill"
			class:is-colour={kind === 'colour'}
			class:is-outside={kind === 'outside'}
			style="--pc: var(--pc-{pc}); --pc-ink: var(--pc-{pc}-ink)"
			title={kind ? SPOKEN[kind] : undefined}
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
		border: 1px solid transparent;
		background: var(--pc);
		color: var(--pc-ink);
		font-family: var(--font-display);
		font-size: 0.8rem;
		font-weight: 600;
		/* Appearing should be instant; leaving can be gentle. */
		animation: pop 90ms var(--ease-wheel);
		transition:
			background 120ms ease,
			color 120ms ease;
	}

	/*
	 * Three states, by how filled in the pill is.
	 *
	 * A chord tone is solid — the default, and the one you are aiming for, so it
	 * is the one that needs no decoration. In the key but outside the chord is
	 * the same colour held back. Outside the key is the outline only.
	 *
	 * Weight rather than hue, because hue is already carrying pitch everywhere
	 * in this app and cannot be asked to carry a second meaning. Nothing goes
	 * red: an outside note is a blue note as often as it is a wrong one, and the
	 * app has no way to tell which — so it reports where the note sits and lets
	 * the person playing decide whether they meant it.
	 */
	.pill.is-colour {
		background: color-mix(in oklab, var(--pc) 34%, var(--color-ground));
		color: var(--color-ink);
		border-color: color-mix(in oklab, var(--pc) 55%, transparent);
	}

	.pill.is-outside {
		background: transparent;
		color: color-mix(in oklab, var(--pc) 72%, var(--color-ink));
		border-color: color-mix(in oklab, var(--pc) 60%, transparent);
		border-style: dashed;
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

	@media (max-width: 639px) {
		.pill:nth-child(n + 3) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.pill {
			animation: none;
		}
	}
</style>
