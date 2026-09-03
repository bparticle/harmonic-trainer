<script lang="ts">
	/*
	 * A station, drawn.
	 *
	 * One key, one roundel, one set of marks — extracted from `NetworkMap` so that
	 * every place in the app that draws a key draws *this*. That is the same
	 * argument the network itself was built on, one level out: the twelve keys
	 * used to be drawn three times within a screen of each other in three
	 * different visual languages, and the fix was to have one drawing of them.
	 * The fix stops working the moment the board, the workout and the profile go
	 * back to inventing their own swatch.
	 *
	 * The rules it carries, so no caller has to remember them:
	 *
	 *   - **Hue means pitch.** The only colour is the tonic's, and it arrives as
	 *     `--pc-N` from the palette the account actually owns.
	 *   - **A ring is a key that exists; what is inside it is what the record
	 *     holds.** Empty ring, opened and never played. Filled core, played.
	 *   - **Dashed is "nothing here yet"**, everywhere in this app.
	 *
	 * Two modes, one drawing. Inside a larger diagram it is a `<g>` translated to
	 * where the caller wants it; on its own it wraps itself in an `<svg>` sized in
	 * `em`, so it can sit in a line of text at the size of the text around it.
	 */

	let {
		name,
		pc,
		/** How full to draw it, 0–1. What the record holds here. */
		fill = 0,
		/** On the network. False draws the dashed ring the map uses for "not reached". */
		built = true,
		/** Ringed as the place the run leaves from. Ink, because a departure is not a pitch. */
		departs = false,
		/**
		 * Ringed as a stop this run actually calls at, and is calling at now.
		 *
		 * The map's `calls` mark: a solid ink ring, a size down from the departure
		 * ring around it. Not the dashed `READING` one, which means a station you
		 * are looking at and not going to — the opposite claim.
		 */
		here = false,
		/** Say nothing about which key this is: the station whose name is the answer. */
		anonymous = false,
		/**
		 * Track running out of the roundel to the next stop along.
		 *
		 * **Inside the mark, in the mark's own units**, which is the whole of why
		 * it is here rather than drawn behind a row of these in CSS. A line behind
		 * them passed straight through the transparent middle of every roundel and
		 * struck out the letter inside it — the mark reads as a station and the
		 * line read as a pen through the name.
		 *
		 * Drawn from the ring outwards to the edge of the box, so two boxes set
		 * side by side join into one continuous track that the roundels interrupt,
		 * at any size, with no measurement in a stylesheet to keep in step.
		 */
		linkLeft = false,
		linkRight = false,
		/**
		 * Standalone, in `rem`.
		 *
		 * Deliberately not `em`. These sit inside mono captions at 0.7rem as often
		 * as inside a headline, and a mark that inherited its size from the caption
		 * came out at a third of the intended one — with its own name inside it,
		 * illegible. A station is the same size wherever it is drawn.
		 */
		inline = false,
		size = 2.4,
		/** Where to put it, when it is one mark inside a bigger drawing. */
		x = 0,
		y = 0,
		r = 15,
		title = ''
	}: {
		name: string;
		pc: number;
		fill?: number;
		built?: boolean;
		departs?: boolean;
		here?: boolean;
		anonymous?: boolean;
		linkLeft?: boolean;
		linkRight?: boolean;
		inline?: boolean;
		size?: number;
		x?: number;
		y?: number;
		r?: number;
		title?: string;
	} = $props();

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');

	/* The outermost mark decides the box: a departure ring sits outside the
	 * roundel at r + 7 and carries a 2-wide stroke, so the box is cut to exactly
	 * that and no wider. Every unit past it is the drawing shrinking itself. */
	const BOX = 23;
	const tint = $derived(`var(--pc-${pc})`);
	const ink = $derived(fill > 0.45 ? `var(--pc-${pc}-ink)` : 'var(--color-ink)');
</script>

{#snippet marks()}
	<!-- First, so the roundel is drawn over the ends of its own track. -->
	{#if linkLeft}<line class="link" x1={-BOX} y1="0" x2={-r + 2} y2="0" />{/if}
	{#if linkRight}<line class="link" x1={r - 2} y1="0" x2={BOX} y2="0" />{/if}

	{#if departs}
		<circle class="departs" cx="0" cy="0" r={r + 7} />
	{:else if here}
		<circle class="here" cx="0" cy="0" r={r + 5} />
	{/if}

	{#if anonymous}
		<!-- Somewhere on the network, and which one is the question. -->
		<circle class="ring is-unknown" cx="0" cy="0" {r} />
		<text class="name is-unknown" x="0" y={r * 0.34} text-anchor="middle">?</text>
	{:else}
		<!--
			Two independent facts, drawn as two marks.

			**The ring says whether the ladder has been here; what is inside says
			what the record holds.** They used to be exclusive — an unreached
			station drew its dashed ring and nothing else — which quietly threw the
			record away at exactly the keys where it is most interesting. A player
			with four hundred chords in A and no rung open there is somebody who has
			been playing ahead of the curriculum, and the drawing said *nothing here*.
		-->
		{#if fill > 0}
			<circle class="halo" cx="0" cy="0" r={r + 1} style:--tint={tint} />
			<circle class="core" cx="0" cy="0" r={r * 0.4 + r * 0.6 * fill} style:--tint={tint} />
		{/if}
		<circle
			class="ring"
			class:is-unbuilt={!built}
			class:is-empty={fill <= 0}
			cx="0"
			cy="0"
			{r}
			style:--tint={tint}
		/>
		<text
			class="name"
			class:is-shut={!built && fill <= 0}
			x="0"
			y={r * 0.34}
			text-anchor="middle"
			style:--ink={ink}
			style:font-size="{r * (glyph(name).length > 1 ? 0.86 : 1)}px">{glyph(name)}</text
		>
	{/if}
{/snippet}

{#if inline}
	<svg
		class="roundel-inline"
		viewBox="{-BOX} {-BOX} {BOX * 2} {BOX * 2}"
		width="{size}rem"
		height="{size}rem"
		role="img"
		aria-label={title || `${glyph(name)}`}
	>
		{@render marks()}
	</svg>
{:else}
	<g transform="translate({x} {y})">
		{#if title}<title>{title}</title>{/if}
		{@render marks()}
	</g>
{/if}

<style>
	.roundel-inline {
		display: inline-block;
		overflow: visible;
		vertical-align: middle;
		flex: none;
	}

	/* A line is a rung and a rung has no pitch, so the track is ink and weight —
	   the same inversion the network itself is drawn under. */
	.link {
		stroke: var(--color-ink-muted);
		stroke-width: 3.2;
		stroke-linecap: butt;
	}

	.halo {
		fill: var(--tint);
		opacity: 0.22;
	}

	.core {
		fill: var(--tint);
		transition: r 300ms var(--ease-wheel);
	}

	.ring {
		fill: none;
		stroke: var(--tint);
		stroke-width: 2.5;
	}

	/* Opened and never played is an invitation, so it keeps full-strength
	   colour and simply has nothing inside it yet. */
	.ring.is-empty {
		fill: var(--color-ground);
		stroke-width: 3;
	}

	/* The ladder has not reached it. Dashed is how this app has always drawn
	   "nothing here", and it is quiet on purpose: twelve of these at full
	   strength would be a wall of things not done. */
	.ring.is-unbuilt {
		stroke-dasharray: 3 3;
		opacity: 0.75;
	}

	/* Unreached and unplayed: hollow, so nothing shows through the dashes. A
	   station with a record keeps its core and only the ring goes dashed. */
	.ring.is-unbuilt.is-empty {
		fill: var(--color-ground);
		stroke-width: 2.5;
	}

	/* No hue at all: the whole question is which pitch this is. */
	.ring.is-unknown {
		fill: var(--color-ground);
		stroke: var(--color-ground-line);
		stroke-width: 2.5;
	}

	.name {
		font-family: var(--font-display);
		font-weight: 600;
		letter-spacing: -0.02em;
		fill: var(--ink);
	}

	.name.is-shut {
		fill: var(--color-ink-dim);
	}

	.name.is-unknown {
		fill: var(--color-ink-dim);
	}

	.departs {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 2;
	}

	/* Called at, and called at now — the map's own `calls` ring, a size down
	   from the departure ring and a little quieter. */
	.here {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 1.6;
		opacity: 0.85;
	}
</style>
