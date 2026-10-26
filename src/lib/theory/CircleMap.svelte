<script lang="ts">
	import { CIRCLE, pcOf, circleRoute, type RoundSpec } from './catalog';
	let {
		direction = 'clockwise',
		step = -1,
		reveal = true,
		compact = false
	}: {
		direction?: RoundSpec['direction'];
		step?: number;
		reveal?: boolean;
		compact?: boolean;
	} = $props();
	const route = $derived(circleRoute(direction));
	const visited = $derived(new Set(route.slice(0, step + 1).map(pcOf)));
	const current = $derived(step >= 0 ? pcOf(route[Math.min(step, 12)]) : -1);
	const positions = CIRCLE.map((note, i) => ({
		pc: pcOf(note),
		x: 210 + Math.sin((i / 12) * Math.PI * 2) * 162,
		y: 210 - Math.cos((i / 12) * Math.PI * 2) * 162
	}));
</script>

<svg
	class:compact
	viewBox="0 0 420 420"
	role="img"
	aria-label={reveal
		? `Circle of fifths, ${direction === 'clockwise' ? 'clockwise' : 'counter-clockwise'} from C`
		: `Memory map: ${Math.max(0, Math.min(step + 1, 12))} of 12 stations found`}
>
	<circle cx="210" cy="210" r="162" class="track" />
	{#each positions as station, i}
		{@const next = positions[(i + 1) % 12]}
		{#if visited.has(station.pc) && visited.has(next.pc)}
			<line x1={station.x} y1={station.y} x2={next.x} y2={next.y} class="travelled" />
		{/if}
	{/each}
	<text x="210" y="190" class="direction">{direction === 'clockwise' ? '↻' : '↺'}</text>
	<text x="210" y="236" class="centre"
		>{step >= 12 ? 'HOME AGAIN' : step >= 0 ? `${Math.min(step + 1, 12)} / 12` : 'ALL ROADS'}</text
	>
	<text x="210" y="259" class="caption">{step >= 0 ? 'stations connected' : 'lead back to C'}</text>
	{#each positions as station}
		{@const known = reveal || visited.has(station.pc) || station.pc === 0}
		{@const name = route.find((note) => pcOf(note) === station.pc) ?? '?'}
		<g style:--station={`var(--pc-${station.pc})`} class:visited={visited.has(station.pc)}>
			{#if current === station.pc}<circle
					cx={station.x}
					cy={station.y}
					r="26"
					class="arrival"
				/>{/if}
			<circle cx={station.x} cy={station.y} r="21" class="stop" class:known />
			<text
				x={station.x}
				y={station.y + 6}
				class="name"
				style:fill={known ? `var(--pc-${station.pc}-ink)` : 'var(--color-ink-muted)'}
				>{known ? name : '·'}</text
			>
		</g>
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		max-width: 450px;
		margin: auto;
		overflow: visible;
	}
	.track {
		fill: none;
		stroke: var(--color-ground-line);
		stroke-width: 2;
	}
	.travelled {
		stroke: var(--color-ink-muted);
		stroke-width: 3;
	}
	.stop {
		fill: var(--color-ground-raised);
		stroke: var(--color-ground-line);
		stroke-width: 2;
	}
	.stop.known {
		fill: var(--station);
		stroke: var(--station);
	}
	.visited .stop {
		stroke: var(--color-ink);
		stroke-width: 2;
	}
	.arrival {
		fill: none;
		stroke: var(--station);
		stroke-width: 2;
		animation: arrive 400ms ease-out;
	}
	.name {
		text-anchor: middle;
		font-size: 17px;
		font-weight: 650;
	}
	.direction,
	.centre,
	.caption {
		text-anchor: middle;
		fill: var(--color-ink);
	}
	.direction {
		font-size: 58px;
	}
	.centre {
		font: 500 16px var(--font-mono);
		letter-spacing: 2px;
	}
	.caption {
		font-size: 13px;
		fill: var(--color-ink-muted);
	}
	@keyframes arrive {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
