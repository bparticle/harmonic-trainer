<script module lang="ts">
	/**
	 * A counted distance from one key to another, drawn as a leap over the keys
	 * in between with a stepping stone on every key it passes.
	 *
	 *   - `solid`: both ends are sounding. The distance is a fact.
	 *   - `ghost`: where to go. Dashed, because that is how this app draws
	 *     somewhere you have not been yet.
	 *   - `stray`: where a note actually landed, counted from the root, so a
	 *     wrong key teaches the distance it *was* instead of just being wrong.
	 */
	export type Arc = {
		id: string;
		from: number;
		to: number;
		look: 'solid' | 'ghost' | 'stray';
		/** Stepping stones lit so far, for a demonstration counting its way across. */
		lit?: number;
	};

	/**
	 * A key with a station on it: the note's name in its own colour, filled when
	 * it is sounding and a ring when it is still to find. A stray is drawn in
	 * ink, dashed: where a note landed, not a note the shape is asking for.
	 */
	export type Mark = {
		note: number;
		pc: number;
		name: string;
		look: 'on' | 'open' | 'stray';
	};
</script>

<script lang="ts">
	import Roundel from '$lib/components/Roundel.svelte';
	import { keyCentre, keyLayout } from '$lib/components/Keyboard.svelte';

	/*
	 * The band of air above the on-screen keyboard, where distances are drawn.
	 *
	 * Laid out on the keyboard's own grid and set directly above it at the same
	 * width, so every arc lands on the key it means. The keys themselves are not
	 * drawn over: a colour on a key already means *this note is sounding*, and an
	 * arc across them would be a second thing written on top of the first.
	 *
	 * Arcs are ink. A distance has no pitch, so it gets weight and never a hue;
	 * the colour is all in the stations at either end.
	 */

	let {
		from,
		count,
		arcs = [],
		marks = []
	}: { from: number; count: number; arcs?: Arc[]; marks?: Mark[] } = $props();

	const HEIGHT = 104;
	/** Where the stations sit: the bottom of the band, just above the keys. */
	const BASE = HEIGHT - 13;
	const R = 11;
	/*
	 * A black key's station sits higher than a white key's, the way the keys
	 * themselves do. Neighbours are only half a white key apart, so on one row
	 * C and C♯ would sit on top of each other — and C to C♯ is the first thing
	 * this band is ever asked to draw.
	 */
	const LIFT = 21;

	const layout = $derived(keyLayout(from, count));
	const byNote = $derived(new Map(layout.keys.map((key) => [key.note, key])));
	const xOf = (note: number) => {
		const key = byNote.get(note);
		return key ? keyCentre(key) : null;
	};
	const yOf = (note: number) => BASE - (byNote.get(note)?.black ? LIFT : 0);

	/** Higher for longer leaps, so arcs drawn side by side stack instead of crossing. */
	const rise = (keys: number) => Math.min(52, 12 + keys * 4);

	type Drawn = Arc & {
		path: string;
		stones: Array<{ x: number; y: number }>;
		label: { x: number; y: number; text: string };
	};

	const drawn = $derived(
		arcs.flatMap((arc): Drawn[] => {
			const x0 = xOf(arc.from);
			const x1 = xOf(arc.to);
			if (x0 === null || x1 === null || arc.from === arc.to) return [];
			const keys = Math.abs(arc.to - arc.from);
			// Leave from the top of one station and land on the top of the other.
			const y0 = yOf(arc.from) - R + 1;
			const y1 = yOf(arc.to) - R + 1;
			const apex = Math.min(y0, y1) - rise(keys);
			// A quadratic's midpoint is halfway between its ends' midpoint and its
			// control point, so this puts the top of the curve exactly at `apex`.
			const cy = 2 * apex - (y0 + y1) / 2;
			const cx = (x0 + x1) / 2;
			const at = (x: number) => {
				const t = (x - x0) / (x1 - x0);
				return (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
			};
			const step = arc.to > arc.from ? 1 : -1;
			const stones: Array<{ x: number; y: number }> = [];
			// One stone per key counted, the landing included: the stones are the count.
			for (let n = arc.from + step; n !== arc.to; n += step) {
				const x = xOf(n);
				if (x !== null) stones.push({ x, y: at(x) });
			}
			stones.push({ x: x1, y: y1 });
			return [
				{
					...arc,
					path: `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`,
					stones,
					label: { x: cx, y: apex - 10, text: String(keys) }
				}
			];
		})
	);
</script>

<svg
	class="hop-band no-select"
	viewBox="0 0 {layout.width} {HEIGHT}"
	aria-hidden="true"
	preserveAspectRatio="xMidYMax meet"
>
	{#each drawn as arc (arc.id)}
		<g class="arc is-{arc.look}">
			<path d={arc.path} />
			{#each arc.stones as stone, i (i)}
				<circle
					class="stone"
					class:is-lit={arc.lit === undefined || i < arc.lit}
					cx={stone.x}
					cy={stone.y}
					r="2.6"
				/>
			{/each}
			{#if arc.lit === undefined || arc.lit >= arc.stones.length}
				<g class="count" transform="translate({arc.label.x} {arc.label.y})">
					<rect x="-10" y="-9" width="20" height="16" rx="8" />
					<text y="3.5" text-anchor="middle">{arc.label.text}</text>
				</g>
			{/if}
		</g>
	{/each}

	{#each marks as mark (`${mark.note}|${mark.look}`)}
		{@const x = xOf(mark.note)}
		{#if x !== null}
			<g class="mark is-{mark.look}">
				{#if mark.look === 'stray'}
					<!-- Where a note landed that is not in the shape. Ink, not its
					     colour: this is a distance being counted, and a hue here
					     would read as a verdict on the note. -->
					<circle class="stray-ring" cx={x} cy={yOf(mark.note)} r={R} />
					<text class="stray-name" {x} y={yOf(mark.note) + R * 0.34} text-anchor="middle"
						>{mark.name}</text
					>
				{:else}
					<Roundel
						{x}
						y={yOf(mark.note)}
						r={R}
						name={mark.name}
						pc={mark.pc}
						fill={mark.look === 'on' ? 1 : 0}
					/>
				{/if}
			</g>
		{/if}
	{/each}
</svg>

<style>
	.hop-band {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.arc path {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 2.4;
		stroke-linecap: round;
	}

	.arc.is-ghost path {
		stroke: var(--color-ink-dim);
		stroke-dasharray: 5 5;
	}

	.arc.is-stray path {
		stroke: var(--color-ink-dim);
		stroke-dasharray: 2 5;
	}

	.stone {
		fill: var(--color-ground-line);
		transition: fill 120ms linear;
	}

	.stone.is-lit {
		fill: var(--color-ink);
	}

	.arc.is-ghost .stone.is-lit,
	.arc.is-stray .stone.is-lit {
		fill: var(--color-ink-dim);
	}

	.count rect {
		fill: var(--color-ground-raised);
		stroke: var(--color-ink-muted);
		stroke-width: 1.4;
	}

	.arc.is-ghost .count rect,
	.arc.is-stray .count rect {
		stroke: var(--color-ink-dim);
		stroke-dasharray: 3 3;
	}

	.count text {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		fill: var(--color-ink);
	}

	.arc.is-stray .count text {
		fill: var(--color-ink-muted);
	}

	.mark {
		animation: arrive 260ms var(--ease-wheel);
		transform-box: fill-box;
		transform-origin: center;
	}

	.stray-ring {
		fill: var(--color-ground);
		stroke: var(--color-ink-dim);
		stroke-width: 2;
		stroke-dasharray: 3 3;
	}

	.stray-name {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 9px;
		fill: var(--color-ink-muted);
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.85);
		}
	}
</style>
