<script lang="ts">
	import { formatNote, pitchClass, type Note } from '$lib/music/note';

	/*
	 * One scale, on one octave of a keyboard.
	 *
	 * The question this answers is the one you ask a piano with your eyes before
	 * you ask it with your hands: which black keys are in, and which white keys
	 * are out. So it is drawn as keys rather than as a row of note names — the
	 * shape of "two sharps, and stay off the fourth" is something you recognise
	 * on a keyboard and have to decode from a list.
	 *
	 * Always C to B, never root to root. Every suggestion in the panel is then
	 * drawn on the same twelve keys, which is what makes three of them stacked
	 * comparable at a glance, and what makes any of them match the instrument
	 * sitting in front of you.
	 *
	 * Two weights, the same language the header pills use: a chord tone is
	 * solid, because it is the note you are aiming at, and the rest of the scale
	 * is the same colour held back. Weight rather than hue, because hue is
	 * carrying pitch here as everywhere else in this app and cannot be asked to
	 * carry a second meaning. Keys outside the scale are left as plain piano
	 * keys — there is no third colour, only an absence.
	 */

	let {
		notes,
		chordTones = [],
		label
	}: {
		/** The scale, spelled. */
		notes: Note[];
		/** Pitch classes of the chord this scale is being played over. */
		chordTones?: number[];
		/** For a screen reader, which has no use for the drawing. */
		label: string;
	} = $props();

	const BLACK = new Set([1, 3, 6, 8, 10]);
	const WHITE_W = 40;
	const WHITE_H = 88;
	const BLACK_W = 25;
	const BLACK_H = 52;
	const WIDTH = WHITE_W * 7;

	/*
	 * Pitch class to spelling, taken from the scale itself.
	 *
	 * This is the whole reason the diagram takes notes rather than pitch
	 * classes: the black key between F and G is F♯ in one scale and G♭ in the
	 * next, and saying which is what you came here to find out. A note spelled
	 * C♭ lands on the B key and is still labelled C♭, which is not a mistake —
	 * it is the lesson.
	 */
	const spelling = $derived(new Map(notes.map((note) => [pitchClass(note), note])));
	const chordSet = $derived(new Set(chordTones.map((pc) => ((pc % 12) + 12) % 12)));

	type Key = { pc: number; black: boolean; x: number };

	const keys = $derived.by((): Key[] => {
		const out: Key[] = [];
		let x = 0;
		for (let pc = 0; pc < 12; pc++) {
			const black = BLACK.has(pc);
			// Black keys straddle the gap between the two white keys either side.
			if (black) out.push({ pc, black, x: x - BLACK_W / 2 });
			else {
				out.push({ pc, black, x });
				x += WHITE_W;
			}
		}
		return out;
	});

	const whites = $derived(keys.filter((key) => !key.black));
	const blacks = $derived(keys.filter((key) => key.black));

	const nameOf = (pc: number) => {
		const note = spelling.get(pc);
		return note ? formatNote(note, { unicode: true }) : '';
	};
</script>

<svg
	class="scale-keys no-select"
	viewBox="0 0 {WIDTH} {WHITE_H}"
	role="img"
	aria-label={label}
	preserveAspectRatio="xMidYMid meet"
>
	{#each whites as key (key.pc)}
		{@const inScale = spelling.has(key.pc)}
		{@const isChord = inScale && chordSet.has(key.pc)}
		<g style:--tone="var(--pc-{key.pc})" style:--tone-ink="var(--pc-{key.pc}-ink)">
			<rect
				x={key.x + 1}
				y="0"
				width={WHITE_W - 2}
				height={WHITE_H}
				rx="4"
				class="key key-white"
				class:is-in={inScale}
				class:is-chord={isChord}
			/>
			{#if inScale}
				<text
					x={key.x + WHITE_W / 2}
					y={WHITE_H - 9}
					class="key-name on-white"
					class:on-chord={isChord}
					text-anchor="middle">{nameOf(key.pc)}</text
				>
			{/if}
		</g>
	{/each}

	{#each blacks as key (key.pc)}
		{@const inScale = spelling.has(key.pc)}
		{@const isChord = inScale && chordSet.has(key.pc)}
		<g style:--tone="var(--pc-{key.pc})" style:--tone-ink="var(--pc-{key.pc}-ink)">
			<rect
				x={key.x}
				y="0"
				width={BLACK_W}
				height={BLACK_H}
				rx="3"
				class="key key-black"
				class:is-in={inScale}
				class:is-chord={isChord}
			/>
			{#if inScale}
				<text
					x={key.x + BLACK_W / 2}
					y={BLACK_H - 10}
					class="key-name on-black"
					class:on-chord={isChord}
					text-anchor="middle">{nameOf(key.pc)}</text
				>
			{/if}
		</g>
	{/each}
</svg>

<style>
	.scale-keys {
		display: block;
		width: 100%;
		/* Capped, because this is a diagram and not the instrument. Given a wide
		   column it would otherwise grow to the size of the real keyboard above
		   it and stop reading as an aside to the scale it belongs to. */
		max-width: 21rem;
		height: auto;
	}

	.key {
		stroke-width: 1;
	}

	/*
	 * Out of the scale, the keys are drawn as a piano's — pale and dark — rather
	 * than greyed out. That is what keeps this readable as an instrument at a
	 * glance instead of as a chart of twelve cells, and it means the notes that
	 * are *not* offered still look like somewhere you could put a finger.
	 */
	.key-white {
		fill: var(--color-ink-muted);
		stroke: var(--color-ground);
	}

	.key-black {
		fill: var(--color-ground);
		stroke: var(--color-ground-line);
	}

	/* In the scale: the note's own colour, held back towards the key it sits on
	   so a white key stays light and a black key stays dark. */
	.key-white.is-in {
		fill: color-mix(in oklab, var(--tone) 52%, var(--color-ink-muted));
		stroke: color-mix(in oklab, var(--tone) 70%, var(--color-ground));
	}

	.key-black.is-in {
		fill: color-mix(in oklab, var(--tone) 55%, var(--color-ground));
		stroke: color-mix(in oklab, var(--tone) 75%, var(--color-ground));
	}

	/* A chord tone is solid, on both. This is the note you are aiming at; the
	   rest of the scale is what you pass through on the way. */
	.key.is-chord {
		fill: var(--tone);
		stroke: color-mix(in oklab, var(--tone) 60%, var(--color-ink));
	}

	.key-name {
		font-family: var(--font-mono);
		pointer-events: none;
	}

	/* Dark ink on a pale key, light ink on a dark one, and the swatch's own
	   contrast-safe ink wherever a key is filled solid. */
	.on-white {
		font-size: 12px;
		fill: var(--color-ground);
	}

	.on-black {
		font-size: 11px;
		fill: var(--color-ink-muted);
	}

	.key-name.on-chord {
		fill: var(--tone-ink);
	}
</style>
