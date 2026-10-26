<script module lang="ts">
	/** One ingredient as the card draws it. */
	export type CardTone = {
		/** Its place in the chord, root first. A morph slides the tone that keeps its place. */
		slot: number;
		offset: number;
		degree: string;
		pc: number;
		/** Empty when the name would give the answer away. */
		name: string;
		/** Sounding; still to find; or not on the card at all yet. */
		look: 'on' | 'open' | 'hidden';
	};
</script>

<script lang="ts">
	import Roundel from '$lib/components/Roundel.svelte';

	/*
	 * A recipe, drawn as a line on the map.
	 *
	 * Every key is a stop: the small ticks along the track are the twelve keys
	 * of an octave, in order, black and white alike. The chord's own notes are
	 * the interchanges, drawn as the same roundel the network draws a key with,
	 * in the note's own colour. So a major triad reads the way a journey does:
	 * board at the root, ride four stops, change, ride three.
	 *
	 * The shape is the part that never changes from one root to the next, and
	 * this drawing is built so that is what you see first. Move to another root
	 * and every colour changes; the spacing does not move by a single tick.
	 *
	 * The thirteenth tick is the root again, an octave up — drawn dashed, in
	 * the root's colour, because it is where the sevenths are measured back
	 * from: one stop short of it is the major seventh, two is the flat one.
	 */

	let {
		tones,
		rootPc,
		/** Where the moving tone was before a morph, drawn as a dashed ghost. */
		ghost = null,
		label = ''
	}: {
		tones: CardTone[];
		rootPc: number;
		ghost?: { offset: number; pc: number } | null;
		label?: string;
	} = $props();

	const CELL = 44;
	const PAD = 28;
	const SPAN = 12;
	const TRACK = 74;
	const R = 16;
	const WIDTH = PAD * 2 + SPAN * CELL;
	const HEIGHT = 128;

	const xOf = (offset: number) => PAD + offset * CELL;
	const visible = $derived(
		tones.filter((tone) => tone.look !== 'hidden').sort((a, b) => a.offset - b.offset)
	);

	/** The leaps between neighbouring stations, counted. */
	const legs = $derived(
		visible.slice(1).map((tone, i) => {
			const prev = visible[i];
			const keys = tone.offset - prev.offset;
			const x0 = xOf(prev.offset) + R - 3;
			const x1 = xOf(tone.offset) - R + 3;
			const apex = TRACK - R - 14 - Math.min(16, keys * 2.5);
			return {
				id: `${prev.slot}-${tone.slot}`,
				keys,
				d: `M ${x0} ${TRACK - 8} Q ${(x0 + x1) / 2} ${2 * apex - (TRACK - 8)} ${x1} ${TRACK - 8}`,
				x: (x0 + x1) / 2,
				y: apex - 6,
				open: tone.look === 'open' || prev.look === 'open'
			};
		})
	);
</script>

<svg class="recipe-card no-select" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label={label}>
	<!-- The track and its stops: one tick per key. -->
	<line class="track" x1={xOf(0)} y1={TRACK} x2={xOf(SPAN)} y2={TRACK} />
	{#each Array.from({ length: SPAN + 1 }, (_, i) => i) as cell (cell)}
		<line class="tick" x1={xOf(cell)} y1={TRACK - 7} x2={xOf(cell)} y2={TRACK + 7} />
	{/each}

	<!-- The root again, an octave up. -->
	<circle class="octave" cx={xOf(SPAN)} cy={TRACK} r={R - 5} style:--tint="var(--pc-{rootPc})" />

	{#each legs as leg (leg.id)}
		<g class="leg" class:is-open={leg.open}>
			<path d={leg.d} />
			<text x={leg.x} y={leg.y} text-anchor="middle">{leg.keys}</text>
		</g>
	{/each}

	{#if ghost}
		<circle
			class="ghost"
			cx={xOf(ghost.offset)}
			cy={TRACK}
			r={R - 4}
			style:--tint="var(--pc-{ghost.pc})"
		/>
	{/if}

	{#each tones as tone (tone.slot)}
		<g
			class="tone"
			class:is-hidden={tone.look === 'hidden'}
			class:is-open={tone.look === 'open'}
			style:transform="translate({xOf(tone.offset)}px, {TRACK}px)"
			data-tone={tone.slot}
		>
			<Roundel r={R} name={tone.name} pc={tone.pc} fill={tone.look === 'on' ? 1 : 0} />
			<text class="degree" y={R + 24} text-anchor="middle">{tone.degree}</text>
		</g>
	{/each}
</svg>

<style>
	.recipe-card {
		display: block;
		width: 100%;
		height: auto;
		overflow: visible;
	}

	.track {
		stroke: var(--color-ink-dim);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.tick {
		stroke: var(--color-ground-line);
		stroke-width: 2;
	}

	.octave {
		fill: var(--color-ground);
		stroke: var(--tint);
		stroke-width: 1.6;
		stroke-dasharray: 3 3;
		opacity: 0.55;
	}

	.ghost {
		fill: none;
		stroke: var(--tint);
		stroke-width: 2;
		stroke-dasharray: 3 4;
		opacity: 0.7;
	}

	.leg path {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 2;
	}

	.leg.is-open path {
		stroke: var(--color-ink-dim);
		stroke-dasharray: 4 4;
	}

	.leg text {
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 500;
		fill: var(--color-ink);
	}

	.leg.is-open text {
		fill: var(--color-ink-muted);
	}

	.tone {
		transition:
			transform 520ms var(--ease-wheel),
			opacity 260ms ease;
	}

	.tone.is-hidden {
		opacity: 0;
	}

	.tone.is-open {
		animation: beckon 1.8s ease-in-out infinite;
	}

	.degree {
		font-family: var(--font-mono);
		font-size: 14px;
		fill: var(--color-ink-muted);
	}

	@keyframes beckon {
		50% {
			opacity: 0.6;
		}
	}
</style>
