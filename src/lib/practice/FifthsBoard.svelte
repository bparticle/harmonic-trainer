<script lang="ts">
	import { angleOf, mod12, pitchClassOfCof } from '$lib/wheel/geometry';
	import type { MajorKey } from './fifths';

	let {
		open,
		briefing = [],
		armed = false,
		marked,
		impact,
		onfire
	}: {
		open: Set<number>;
		briefing?: MajorKey[];
		armed?: boolean;
		marked?: number;
		impact?: { firedAt: number; target: MajorKey; hit: boolean };
		onfire: (position: number) => void;
	} = $props();

	const STATIONS = Array.from({ length: 12 }, (_, position) => ({
		position,
		pc: pitchClassOfCof(position),
		x: 50 + 39 * Math.cos(angleOf(position)),
		y: 50 + 39 * Math.sin(angleOf(position))
	}));
	const buttons = $state<HTMLButtonElement[]>([]);
	let aim = $state<number | null>(null);
	const bearing = $derived((impact?.firedAt ?? aim ?? 0) * 30);

	function moveAim(event: KeyboardEvent, position: number) {
		const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (!direction) return;
		event.preventDefault();
		let next = mod12(position + direction);
		while (!open.has(next)) next = mod12(next + direction);
		buttons[next]?.focus();
	}
</script>

<div
	class="board no-select"
	role="group"
	aria-label="Circle of fifths, with C at 12 o’clock"
	style:--bearing="{bearing}deg"
>
	<div class="rim" aria-hidden="true"></div>
	<div class="track" aria-hidden="true"></div>
	<div class="inner-track" aria-hidden="true"></div>
	<div class="axis axis-horizontal" aria-hidden="true"></div>
	<div class="axis axis-vertical" aria-hidden="true"></div>
	{#each STATIONS as { position }}
		<span class="tick" style:--angle="{position * 30}deg" aria-hidden="true"></span>
	{/each}
	<span class="noon" aria-hidden="true">12</span>
	<div class="launcher" aria-hidden="true">
		<div class="barrel"></div>
		<div class="hub"></div>
	</div>
	{#if impact}
		<div class="shot" class:miss={!impact.hit} aria-hidden="true">
			<div class="pulse-track"><div class="pulse"></div></div>
		</div>
	{/if}
	{#each STATIONS as { position, pc, x, y } (position)}
		{@const keys = briefing.filter((key) => key.position === position)}
		{@const revealed = impact?.target.position === position}
		{@const missed = impact && !impact.hit && impact.firedAt === position}
		{@const clock = position || 12}
		<div class="station" style:left="{x}%" style:top="{y}%" style:--pitch="var(--pc-{pc})">
			{#if armed && open.has(position)}
				<button
					type="button"
					class="target"
					aria-label="Fire at {clock} o’clock"
					bind:this={buttons[position]}
					onpointerenter={() => (aim = position)}
					onpointerleave={() => (aim = null)}
					onfocus={() => (aim = position)}
					onblur={() => (aim = null)}
					onkeydown={(event) => moveAim(event, position)}
					onclick={() => onfire(position)}
					><span class="crosshair" aria-hidden="true"></span></button
				>
			{:else}
				<div
					class="target rest"
					class:open={open.has(position)}
					class:named={keys.length > 0 || revealed}
					class:marked={marked === position}
					class:missed={missed && !revealed}
					class:impact={revealed}
					aria-label={marked === position ? `Marked position at ${clock} o’clock` : undefined}
					role={marked === position ? 'img' : undefined}
					aria-hidden={marked !== position}
				>
					{#if revealed}
						{impact.target.name}
					{:else if keys.length}
						{#each keys as key (key.name)}<span>{key.name}</span>{/each}
					{:else if missed}
						×
					{:else}
						<span class="crosshair" aria-hidden="true"></span>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
</div>

<style>
	.board {
		--miss: oklch(0.76 0.12 28);
		position: relative;
		isolation: isolate;
		width: 100%;
		aspect-ratio: 1;
		container-type: inline-size;
	}

	.rim,
	.track,
	.inner-track {
		position: absolute;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
	}

	.rim {
		inset: 2%;
		background: var(--color-ground-raised);
	}

	.track {
		inset: 11%;
		border-style: dashed;
	}

	.inner-track {
		inset: 23%;
	}

	.axis {
		position: absolute;
		color: var(--color-ground-line);
	}

	.axis-horizontal {
		inset: 50% 11% auto;
		border-top: 1px solid;
	}

	.axis-vertical {
		inset: 11% auto 11% 50%;
		border-left: 1px solid;
	}

	.tick {
		position: absolute;
		inset: 3% 50% 50% auto;
		width: 1px;
		transform: rotate(var(--angle));
		transform-origin: bottom center;
	}

	.tick::before {
		display: block;
		height: 4%;
		background: var(--color-ink-dim);
		content: '';
	}

	.noon {
		position: absolute;
		top: 1%;
		left: 50%;
		padding-inline: 0.45em;
		transform: translate(-50%, -35%);
		background: var(--color-ground);
		color: var(--color-ink-muted);
		font: 0.7rem var(--font-mono);
	}

	.launcher {
		position: absolute;
		inset: 42%;
		transform: rotate(var(--bearing));
	}

	.barrel {
		position: absolute;
		inset: -32% 34% 46%;
		border: 1px solid var(--color-ink-dim);
		border-top: 3px solid var(--color-ink-muted);
		border-radius: 3px 3px 0 0;
		background: var(--color-ground-overlay);
	}

	.hub {
		position: absolute;
		inset: 10%;
		border: 1px solid var(--color-ink-muted);
		border-radius: 50%;
		background: var(--color-ground-overlay);
	}

	.hub::after {
		position: absolute;
		inset: 29%;
		border: 1px solid var(--color-ink-dim);
		border-radius: 50%;
		background: var(--color-ground);
		content: '';
	}

	.shot {
		position: absolute;
		inset: 11% 0 50%;
		transform: rotate(var(--bearing));
		transform-origin: bottom center;
		pointer-events: none;
		color: var(--color-ink);
	}

	.shot.miss {
		color: var(--miss);
	}

	.pulse-track {
		position: absolute;
		inset: 0;
		animation: fire 330ms var(--ease-wheel) both;
	}

	.pulse {
		position: absolute;
		top: 3%;
		left: calc(50% - 2px);
		width: 4px;
		height: 12%;
		border-radius: 2px;
		background: currentColor;
	}

	@keyframes fire {
		0% {
			transform: translateY(72%);
			opacity: 0;
		}
		15% {
			opacity: 1;
		}
		72% {
			transform: translateY(0);
			opacity: 1;
		}
		100% {
			transform: translateY(0);
			opacity: 0;
		}
	}

	.station {
		position: absolute;
		width: 14%;
		min-width: 2.75rem;
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
	}

	.target {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
		place-content: center;
		justify-items: center;
		border: 1px solid var(--color-ink-dim);
		border-radius: 50%;
		background: var(--color-ground-overlay);
		color: var(--color-ink);
		font-size: clamp(0.86rem, 4.3cqi, 1.65rem);
		font-weight: 650;
		line-height: 0.96;
	}

	button.target {
		cursor: crosshair;
		touch-action: manipulation;
	}

	button.target:is(:hover, :focus-visible) {
		border-color: var(--color-ink);
		background: var(--color-ground-line);
	}

	.rest:not(.open, .named, .marked, .missed) {
		border: 1px dashed var(--color-ground-line);
		background: var(--color-ground-raised);
		transform: scale(0.54);
	}

	.crosshair {
		width: 0.34em;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--color-ink-dim);
	}

	.rest:not(.open, .marked) .crosshair {
		background: var(--color-ground-line);
	}

	.marked {
		border-color: var(--color-ink);
		outline: 1px dashed var(--color-ink);
		outline-offset: 4px;
	}

	.marked .crosshair {
		background: var(--color-ink);
	}

	.named {
		border-color: var(--pitch);
		background: color-mix(in oklch, var(--pitch) 13%, var(--color-ground));
	}

	.missed {
		border-color: var(--miss);
		color: var(--miss);
	}

	.impact::after {
		position: absolute;
		inset: -5%;
		border: 1px solid var(--pitch);
		border-radius: inherit;
		animation: impact 480ms 205ms var(--ease-wheel) both;
		content: '';
	}

	@keyframes impact {
		from {
			opacity: 1;
			transform: scale(1);
		}
		to {
			opacity: 0;
			transform: scale(1.55);
		}
	}
</style>
