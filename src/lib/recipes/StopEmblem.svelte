<script lang="ts">
	import { pitchClass } from '$lib/music/note';
	import type { Emblem } from './line';
	import { CLOCKWISE } from './line';
	import { parseNote } from '$lib/music/note';

	/*
	 * A stop's badge: what it teaches, drawn small, on C.
	 *
	 * The same track-and-ticks drawing as the recipe card at the size of an
	 * icon, so the map already shows each shape before you have ridden to it —
	 * and the hollow dot is the note that stop is going to ask you about.
	 */

	let { emblem }: { emblem: Emblem } = $props();

	const CELL = 9;
	const PAD = 7;
	const WIDTH = PAD * 2 + 12 * CELL;
	const WHEEL = CLOCKWISE.map((name) => pitchClass(parseNote(name)));
</script>

{#if emblem.kind === 'shape'}
	<svg class="emblem" viewBox="0 0 {WIDTH} 24" aria-hidden="true">
		<line class="track" x1={PAD} y1="12" x2={WIDTH - PAD} y2="12" />
		{#each Array.from({ length: 13 }, (_, i) => i) as cell (cell)}
			<line class="tick" x1={PAD + cell * CELL} y1="8.5" x2={PAD + cell * CELL} y2="15.5" />
		{/each}
		{#each emblem.tones as tone, i (i)}
			<circle
				class="dot"
				class:is-open={emblem.open.includes(i)}
				cx={PAD + tone.offset * CELL}
				cy="12"
				r="5.4"
				style:--tint="var(--pc-{pitchClass(tone.note)})"
			/>
		{/each}
	</svg>
{:else}
	<svg class="emblem is-wheel" viewBox="-14 -14 28 28" aria-hidden="true">
		{#each WHEEL as pc, i (i)}
			{@const a = (i * Math.PI) / 6}
			<circle
				class="dot"
				class:is-open={emblem.direction === 0}
				cx={10 * Math.sin(a)}
				cy={-10 * Math.cos(a)}
				r="2.3"
				style:--tint="var(--pc-{pc})"
			/>
		{/each}
		{#if emblem.direction !== 0}
			<path
				class="way"
				d={emblem.direction === 1 ? 'M -3.5 -3 A 5 5 0 1 1 -3.5 3' : 'M 3.5 -3 A 5 5 0 1 0 3.5 3'}
			/>
		{/if}
	</svg>
{/if}

<style>
	.emblem {
		display: block;
		width: 100%;
		height: auto;
	}

	.emblem.is-wheel {
		width: auto;
		height: 100%;
	}

	.track {
		stroke: var(--color-ink-dim);
		stroke-width: 1.4;
	}

	.tick {
		stroke: var(--color-ground-line);
		stroke-width: 1;
	}

	.dot {
		fill: var(--tint);
		stroke: var(--tint);
		stroke-width: 1.4;
	}

	.dot.is-open {
		fill: var(--color-ground);
	}

	.way {
		fill: none;
		stroke: var(--color-ink-dim);
		stroke-width: 1.2;
		stroke-linecap: round;
	}
</style>
