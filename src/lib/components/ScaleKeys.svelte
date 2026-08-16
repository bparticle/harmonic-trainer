<script lang="ts">
	import { formatNote, pitchClass, type Note } from '$lib/music/note';
	import { romanDegrees } from '$lib/music/scales';

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
	 *
	 * Each key in the scale also carries its degree as a Roman numeral, which is
	 * the one thing on the drawing that does not move when the scale is
	 * transposed: I is wherever the scale starts, and the run of numerals is the
	 * mode's own shape, the same on every root. Uppercase throughout, because a
	 * lowercase numeral means a minor chord everywhere else in this app and no
	 * chord is being claimed here — see `formatRomanDegree`.
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
	/*
	 * Eight units taller than it needs to be for one label, because it now
	 * carries two. The white key's usable strip is only what the black keys
	 * leave below them, and squeezing a numeral and a note name into 36 units of
	 * it put the numeral three units under the black keys' ends — close enough
	 * to read as a collision rather than as a line of type.
	 */
	const WHITE_H = 96;
	const BLACK_W = 25;
	const BLACK_H = 57;
	const WIDTH = WHITE_W * 7;

	/* Both labels hang from the end of whichever key they are on, at the same
	   two offsets, so the numerals form one band across the black keys and
	   another across the white. */
	const NAME_OFFSET = 10;
	const ROMAN_OFFSET = 26;

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

	/* Degrees come from the scale rather than from the chord or the key: what a
	   note is doing *in this scale* is the question the drawing is answering. */
	const numerals = $derived.by(() => {
		const written = romanDegrees(notes);
		return new Map(notes.map((note, i) => [pitchClass(note), written[i]]));
	});

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

	const romanOf = (pc: number) => numerals.get(pc) ?? '';
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
		<g
			style:--tone="var(--pc-{key.pc})"
			style:--tone-deep="var(--pc-{key.pc}-deep)"
			style:--tone-ink="var(--pc-{key.pc}-ink)"
		>
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
					y={WHITE_H - ROMAN_OFFSET}
					class="key-roman on-white"
					class:on-chord={isChord}
					text-anchor="middle">{romanOf(key.pc)}</text
				>
				<text
					x={key.x + WHITE_W / 2}
					y={WHITE_H - NAME_OFFSET}
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
		<g
			style:--tone="var(--pc-{key.pc})"
			style:--tone-deep="var(--pc-{key.pc}-deep)"
			style:--tone-ink="var(--pc-{key.pc}-ink)"
		>
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
					y={BLACK_H - ROMAN_OFFSET}
					class="key-roman on-black"
					class:on-chord={isChord}
					text-anchor="middle">{romanOf(key.pc)}</text
				>
				<text
					x={key.x + BLACK_W / 2}
					y={BLACK_H - NAME_OFFSET}
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

	/* One structural outline on every key, in the ground, so the separation
	   between keys never tints the fill it sits next to. */
	.key {
		stroke: var(--color-ground);
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
	}

	.key-black {
		fill: var(--color-ground);
	}

	/*
	 * In the scale: the note's own colour, dimmed.
	 *
	 * *Dimmed*, not diluted, and the difference is the whole of what went wrong
	 * first time round. The original mixed each swatch towards the key it sat on
	 * — a light grey under the white keys, the dark ground under the black ones
	 * — which did two things wrong at once. It roughly halved the chroma, so
	 * every held-back note read as muddy beside the chart and the keyboard above
	 * it, both of which draw the same twelve colours at full strength. And
	 * because the two mixes pulled in opposite directions, a single pitch class
	 * wore two different colours depending on which key it happened to land on.
	 *
	 * `--pc-N-deep` is the swatch with its lightness turned down and its hue
	 * held exactly, gamut-clamped in the palette module rather than here — see
	 * `deepen`. Doing it in CSS with relative colour syntax was the shorter
	 * route and walked the reds and the yellow straight out of sRGB, where a
	 * browser clipping the channels would have shifted the hue.
	 */
	.key.is-in {
		fill: var(--tone-deep);
	}

	/* A chord tone is the swatch itself, untouched. This is the note you are
	   aiming at; the rest of the scale is what you pass through on the way. */
	.key.is-chord {
		fill: var(--tone);
	}

	/*
	 * A label only ever sits on a coloured key, so there are two cases: the
	 * dimmed fill, which is dark enough for plain ink whatever the hue, and the
	 * swatch itself, which brings the contrast-safe ink the palette computed for
	 * it. The two sizes are the keys' widths, not their colours.
	 */
	.key-name,
	.key-roman {
		font-family: var(--font-mono);
		fill: var(--color-ink);
		pointer-events: none;
	}

	.key-name.on-white {
		font-size: 12px;
	}

	.key-name.on-black {
		font-size: 11px;
	}

	/*
	 * The numeral annotates the note name rather than competing with it, and the
	 * whole of that hierarchy is size and position: two sizes smaller, and a
	 * line above. It is deliberately *not* dimmed.
	 *
	 * Held back at three quarters opacity it measured 2.65:1 against the palest
	 * key it can land on, where the note names manage 3.49:1 — and this is a
	 * diagram read at arm's length from a music stand, at ten pixels. A second
	 * label nobody can read from where they are sitting is not restraint.
	 *
	 * A black key is 25 units wide and that is what sets the smaller size:
	 * `♭VII` is the longest a degree can be, four monospaced glyphs, and it has
	 * to sit inside one with room to spare. It measures 20.2.
	 */
	.key-roman {
		letter-spacing: 0.03em;
	}

	.key-roman.on-white {
		font-size: 10px;
	}

	.key-roman.on-black {
		font-size: 8.5px;
	}

	.key-name.on-chord,
	.key-roman.on-chord {
		fill: var(--tone-ink);
	}
</style>
