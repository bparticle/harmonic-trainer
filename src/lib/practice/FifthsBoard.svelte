<script module lang="ts">
	import type { MajorKey } from './fifths';

	export type StationView = {
		/** Names drawn on the station. Empty during a question, so nothing gives it away. */
		labels: MajorKey[];
		/** 0–1: how much of the station's ring is coloured in. Absent during play. */
		fill?: number;
		/** In play, not yet shown: dashed until its introduction is tapped. */
		waiting?: boolean;
		/** Nothing here yet. Drawn small, and only between rounds. */
		locked?: boolean;
		/** Where the next key will arrive. */
		next?: boolean;
		/** Appended to the station's accessible name. */
		detail?: string;
	};
</script>

<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { angleOf, mod12, pitchClassOfCof } from '$lib/wheel/geometry';
	import { keysAt, signatureGlyph } from './fifths';

	/*
	 * One circle, and the whole game happens on it.
	 *
	 * The question sits in the middle and every answer is on or inside the
	 * ring. The first version put the prompt and the answer buttons in a column
	 * beside the circle and switched the stations off whenever the answer was a
	 * button, so the thing being looked at stopped responding and the hand had
	 * to go and find out where the answer was this time.
	 *
	 * The twelve stations are always buttons and never leave the DOM. Between
	 * rounds a named one plays its key; during a question that is answered on
	 * the rim they are the answers; otherwise they are marked disabled but keep
	 * their place in the tab order, so keyboard focus survives a change of
	 * question instead of falling back to the top of the page.
	 */

	let {
		stations,
		armed = false,
		listen = false,
		aim = null,
		marked,
		impact,
		fresh,
		hub,
		onaim,
		onfire
	}: {
		stations: StationView[];
		/** The rim is the answer to the current question. */
		armed?: boolean;
		/** Between rounds: a named station can be tapped to hear it. */
		listen?: boolean;
		aim?: number | null;
		/** A station the question is about. */
		marked?: number;
		impact?: { firedAt: number | null; target: MajorKey; hit: boolean };
		/** Stations whose keys moved this round, drawn with a one-off pulse. */
		fresh?: Set<number>;
		hub?: Snippet;
		onaim: (position: number) => void;
		onfire: (position: number) => void;
	} = $props();

	const STATIONS = Array.from({ length: 12 }, (_, position) => ({
		position,
		pc: pitchClassOfCof(position),
		x: 50 + 39 * Math.cos(angleOf(position)),
		y: 50 + 39 * Math.sin(angleOf(position))
	}));
	const buttons = $state<HTMLButtonElement[]>([]);

	/** What the pointer at the edge of the hub is showing. */
	const pointing = $derived(
		impact ? (impact.firedAt ?? impact.target.position) : (marked ?? (armed ? aim : null))
	);

	/*
	 * The pointer turns the short way round. Rotating straight to `position *
	 * 30` sent it backwards through the whole circle between 11 and 12 o'clock.
	 */
	let bearing = $state(0);
	$effect(() => {
		if (pointing === null) return;
		const current = untrack(() => bearing);
		const delta = ((((pointing * 30 - current) % 360) + 540) % 360) - 180;
		bearing = current + delta;
	});

	const focusable = $derived(aim ?? marked ?? 0);

	function rove(event: KeyboardEvent, position: number) {
		const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (!direction) return;
		event.preventDefault();
		buttons[mod12(position + direction)]?.focus();
	}

	/** A mouse click should not move keyboard focus to wherever the mouse was. */
	function keepFocus(event: PointerEvent) {
		if (event.pointerType === 'mouse') event.preventDefault();
	}
</script>

{#snippet face(keys: MajorKey[])}
	{#if keys.length}
		{#each keys as key (key.name)}
			<span class="station-key" class:paired={keys.length > 1}>
				<span>{key.name}</span><span class="signature">{signatureGlyph(key.signature)}</span>
			</span>
		{/each}
	{:else}
		<span class="dot"></span>
	{/if}
{/snippet}

<div class="board no-select" role="group" aria-label="Circle of fifths, with C at 12 o’clock">
	<div class="rim" aria-hidden="true"></div>
	<div class="track" aria-hidden="true"></div>
	{#each STATIONS as { position }}
		<span class="tick" style:--angle="{position * 30}deg" aria-hidden="true"></span>
	{/each}
	<span class="noon" aria-hidden="true">12</span>

	{#if pointing !== null}
		<div class="pointer" style:--bearing="{bearing}deg" aria-hidden="true"></div>
	{/if}
	{#if impact && impact.firedAt !== null}
		<div
			class="shot"
			class:miss={!impact.hit}
			style:--bearing="{impact.firedAt * 30}deg"
			aria-hidden="true"
		>
			<div class="pulse"></div>
		</div>
	{/if}

	<div class="hub">{@render hub?.()}</div>

	{#each STATIONS as { position, pc, x, y } (position)}
		{@const view = stations[position]}
		{@const revealed = impact?.target.position === position ? impact.target : undefined}
		{@const missed = !!impact && !impact.hit && impact.firedAt === position}
		<!-- The station tapped instead says what lives there, in ink: "that was C"
		     is the useful half of a miss. Never in its own colour, which would
		     read as a second right answer. -->
		{@const keys = revealed ? [revealed] : missed ? keysAt(position) : view.labels}
		{@const live = armed ? !impact : listen && keys.length > 0}
		<div class="station" style:left="{x}%" style:top="{y}%" style:--pitch="var(--pc-{pc})">
			<button
				type="button"
				class="target"
				class:named={keys.length > 0 && !missed}
				class:live
				class:aimed={armed && !impact && aim === position}
				class:marked={marked === position}
				class:missed
				class:impact={!!revealed}
				class:waiting={view.waiting && !revealed}
				class:locked={view.locked}
				class:next={view.next}
				class:mastery={view.fill !== undefined}
				class:fresh={fresh?.has(position)}
				style:--fill={view.fill ?? 0}
				data-station={position}
				tabindex={position === focusable ? 0 : -1}
				aria-label="{position || 12} o’clock{keys.length
					? `, ${keys.map((key) => `${key.name} major`).join(' or ')}`
					: ''}{view.detail ? `, ${view.detail}` : ''}"
				aria-disabled={!live}
				bind:this={buttons[position]}
				onpointerdown={keepFocus}
				onpointerenter={() => armed && onaim(position)}
				onfocus={() => onaim(position)}
				onkeydown={(event) => rove(event, position)}
				onclick={() => live && onfire(position)}>{@render face(keys)}</button
			>
		</div>
	{/each}
</div>

<style>
	.board {
		position: relative;
		isolation: isolate;
		width: 100%;
		aspect-ratio: 1;
		container-type: inline-size;
	}

	.rim,
	.track {
		position: absolute;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
	}

	.rim {
		inset: 2%;
		background: var(--color-ground-raised);
	}

	/* Through the middle of the stations: the line they are stops on. */
	.track {
		inset: 11%;
		border-style: dashed;
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

	/*
	 * The hub is the screen. It sits inside the ring, clear of the stations,
	 * and holds the question, the four choices when there are four, and the
	 * answer once it is given.
	 */
	.hub {
		position: absolute;
		inset: 22%;
		z-index: 1;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1.6cqi;
		padding: 4cqi;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
		background: var(--color-ground);
		text-align: center;
	}

	/* A notch at the edge of the hub, aimed at the station in question. */
	.pointer {
		position: absolute;
		inset: 0;
		z-index: 2;
		transform: rotate(var(--bearing));
		transition: transform 170ms var(--ease-wheel);
		pointer-events: none;
	}

	.pointer::before {
		position: absolute;
		top: 22%;
		left: 50%;
		border-color: transparent transparent var(--color-ink-muted);
		border-style: solid;
		border-width: 0 1.5cqi 2.2cqi;
		transform: translate(-50%, -100%);
		content: '';
	}

	.shot {
		position: absolute;
		inset: 0;
		z-index: 2;
		transform: rotate(var(--bearing));
		color: var(--color-ink);
		pointer-events: none;
	}

	.shot.miss {
		color: var(--color-ink-dim);
	}

	.pulse {
		position: absolute;
		top: 12%;
		left: calc(50% - 2px);
		width: 4px;
		height: 7%;
		border-radius: 2px;
		background: currentColor;
		animation: fire 170ms var(--ease-wheel) both;
	}

	@keyframes fire {
		0% {
			transform: translateY(110%);
			opacity: 0;
		}
		20% {
			opacity: 1;
		}
		70% {
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
		z-index: 3;
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
		touch-action: manipulation;
		transition:
			transform 140ms var(--ease-wheel),
			background-color 140ms var(--ease-wheel),
			border-color 140ms var(--ease-wheel);
	}

	.target[aria-disabled='true'] {
		cursor: default;
	}

	.target.live {
		cursor: pointer;
	}

	.target.live:is(:hover, .aimed, :focus-visible) {
		border-color: var(--color-ink);
		background: var(--color-ground-line);
		transform: scale(1.06);
	}

	.dot {
		width: 0.34em;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--color-ink-dim);
	}

	.named {
		border-color: var(--pitch);
		background: color-mix(in oklch, var(--pitch) 14%, var(--color-ground));
	}

	.named.live:is(:hover, .aimed, :focus-visible) {
		border-color: var(--pitch);
		background: color-mix(in oklch, var(--pitch) 26%, var(--color-ground));
	}

	.station-key {
		display: grid;
		justify-items: center;
		gap: 0.12em;
	}

	.station-key.paired {
		grid-template-columns: auto auto;
		align-items: baseline;
		gap: 0.13em;
		font-size: 0.74em;
	}

	.station-key.paired + .station-key.paired {
		margin-top: 0.2em;
	}

	.signature {
		color: var(--color-ink-muted);
		font: 0.63em var(--font-mono);
	}

	.marked {
		outline: 1px dashed var(--color-ink);
		outline-offset: 4px;
	}

	.marked .dot {
		background: var(--color-ink);
	}

	.marked.named {
		outline: 2px solid var(--pitch);
	}

	/* The station that was tapped instead. Ink, dashed — nothing goes red. */
	.missed {
		border: 1px dashed var(--color-ink-muted);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		transform: scale(0.94);
	}

	.waiting {
		border-style: dashed;
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
	}

	.locked {
		border: 1px dashed var(--color-ink-dim);
		background: var(--color-ground-raised);
		opacity: 0.6;
		transform: scale(0.5);
	}

	.locked .dot {
		background: var(--color-ink-dim);
	}

	.locked.next {
		border-color: var(--color-ink-muted);
		opacity: 1;
		transform: scale(0.62);
	}

	.impact {
		transform: scale(1.08);
	}

	.impact::after {
		position: absolute;
		inset: -5%;
		border: 2px solid var(--pitch);
		border-radius: inherit;
		animation: impact 260ms 60ms var(--ease-wheel) both;
		content: '';
	}

	@keyframes impact {
		from {
			opacity: 1;
			transform: scale(1);
		}
		to {
			opacity: 0;
			transform: scale(1.7);
		}
	}

	/*
	 * Mastery: a ring round the station, coloured in by strength. The circle
	 * filling with colour is the progress, so there is no separate meter.
	 */
	.mastery::before {
		position: absolute;
		inset: -13%;
		border-radius: 50%;
		background: conic-gradient(var(--pitch) calc(var(--fill) * 360deg), var(--color-ground-line) 0);
		-webkit-mask: radial-gradient(
			farthest-side,
			transparent calc(100% - 3px),
			#000 calc(100% - 2.5px)
		);
		mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2.5px));
		content: '';
		pointer-events: none;
	}

	.locked.mastery::before {
		display: none;
	}

	.fresh::before {
		animation: fresh 700ms 200ms var(--ease-wheel) both;
	}

	@keyframes fresh {
		from {
			transform: scale(1.45);
			opacity: 0;
		}
	}
</style>
