<script module lang="ts">
	export type Station = {
		pc: number;
		/** As this trip spells it: F♯ on the way up, G♭ on the way down. */
		name: string;
		look: 'visited' | 'here' | 'unknown';
	};
</script>

<script lang="ts">
	import Roundel from '$lib/components/Roundel.svelte';

	/*
	 * The circle line.
	 *
	 * Twelve stations in fifths order, C at the top. None of them is named until
	 * you have been there: the circle of fifths is not handed over as a picture
	 * to memorise, it is what appears when you keep counting the same seven keys
	 * — and the track is drawn behind you, one leg at a time, until it closes.
	 *
	 * The track is ink, like every line on the network. The stations wear their
	 * own colours, so a finished trip is the colour wheel, assembled by hand.
	 */

	let {
		stations,
		legs,
		direction,
		count = null,
		label
	}: {
		/** All twelve, in clockwise fifths order from C. */
		stations: Station[];
		/** Legs already travelled, as pairs of positions. */
		legs: Array<[number, number]>;
		direction: 1 | -1;
		/** Half steps to count for the next hop, when the trip is still telling you. */
		count?: number | null;
		label: string;
	} = $props();

	const RADIUS = 112;
	const R = 19;
	const point = (i: number) => {
		const angle = (i * Math.PI) / 6;
		return { x: RADIUS * Math.sin(angle), y: -RADIUS * Math.cos(angle) };
	};

	const legPath = ([a, b]: [number, number]) => {
		const p = point(a);
		const q = point(b);
		// Clockwise when b is the next station round; the other way otherwise.
		const sweep = (b - a + 12) % 12 === 1 ? 1 : 0;
		return `M ${p.x} ${p.y} A ${RADIUS} ${RADIUS} 0 0 ${sweep} ${q.x} ${q.y}`;
	};

	/* A short arc of arrow inside the ring, pointing the way the trip goes. */
	const ARROW_R = 62;
	const arrow = $derived.by(() => {
		const start = direction === 1 ? -50 : 50;
		const end = direction === 1 ? 50 : -50;
		const at = (deg: number) => {
			const a = (deg * Math.PI) / 180;
			return { x: ARROW_R * Math.sin(a), y: -ARROW_R * Math.cos(a) };
		};
		const p = at(start);
		const q = at(end);
		const sweep = direction === 1 ? 1 : 0;
		// The head: two short strokes back from the end, along and across the arc.
		const tangent = (end * Math.PI) / 180;
		const back = { x: -Math.cos(tangent) * direction, y: -Math.sin(tangent) * direction };
		const out = { x: Math.sin(tangent), y: -Math.cos(tangent) };
		const h1 = { x: q.x + back.x * 9 + out.x * 6, y: q.y + back.y * 9 + out.y * 6 };
		const h2 = { x: q.x + back.x * 9 - out.x * 6, y: q.y + back.y * 9 - out.y * 6 };
		return {
			arc: `M ${p.x} ${p.y} A ${ARROW_R} ${ARROW_R} 0 0 ${sweep} ${q.x} ${q.y}`,
			head: `M ${h1.x} ${h1.y} L ${q.x} ${q.y} L ${h2.x} ${h2.y}`
		};
	});
</script>

<svg class="circle-track no-select" viewBox="-150 -150 300 300" role="img" aria-label={label}>
	<circle class="bed" r={RADIUS} />
	{#each legs as leg (`${leg[0]}-${leg[1]}`)}
		<path class="leg" d={legPath(leg)} />
	{/each}

	<g class="way">
		<path d={arrow.arc} />
		<path d={arrow.head} />
	</g>

	{#if count !== null}
		<text class="count" y="10" text-anchor="middle">{count}</text>
		<text class="count-unit" y="32" text-anchor="middle">half steps up</text>
	{/if}

	{#each stations as station, i (i)}
		{@const p = point(i)}
		<g data-station={i}>
			<Roundel
				x={p.x}
				y={p.y}
				r={R}
				name={station.name}
				pc={station.pc}
				fill={station.look === 'unknown' ? 0 : 1}
				here={station.look === 'here'}
				anonymous={station.look === 'unknown'}
			/>
		</g>
	{/each}
</svg>

<style>
	.circle-track {
		display: block;
		width: 100%;
		height: auto;
		max-height: 100%;
		overflow: visible;
	}

	.bed {
		fill: none;
		stroke: var(--color-ground-line);
		stroke-width: 2;
		stroke-dasharray: 2 6;
	}

	.leg {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 5;
		stroke-linecap: round;
		animation: draw 600ms var(--ease-wheel);
		stroke-dasharray: 200;
	}

	@keyframes draw {
		from {
			stroke-dashoffset: 200;
		}
		to {
			stroke-dashoffset: 0;
		}
	}

	.way path {
		fill: none;
		stroke: var(--color-ink-dim);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.count {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 44px;
		fill: var(--color-ink);
	}

	.count-unit {
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.04em;
		fill: var(--color-ink-muted);
	}
</style>
