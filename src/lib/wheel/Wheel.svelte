<script lang="ts">
	import { formatNote, pitchClass } from '$lib/music/note';
	import { key as makeKey, type Key } from '$lib/music/key';
	import { spell } from '$lib/music/spell';
	import type { WheelConfig } from '$lib/settings';
	import {
		arcPath,
		cellSectorPath,
		cellCentre,
		distinctRings,
		isDuplicateRing,
		pitchClassAt,
		ringRadii,
		shapePolygonPath,
		type Cell,
		type Highlight,
		type WheelGeometry
	} from './geometry';
	import {
		VelocityTracker,
		isAtRest,
		normaliseAngle,
		pointerAngle,
		step,
		stepsForAngle,
		type RotationState
	} from './rotation.svelte';

	/*
	 * The harmonic wheel.
	 *
	 * Every cell's pitch class comes from geometry.ts, every highlighted shape is
	 * derived from an interval set, and rotation is a transform on the whole
	 * group — which is why transposing is literally turning the thing.
	 */

	let {
		config,
		context = makeKey('C'),
		/** Pitch classes filled with their own colour. */
		active = [],
		/** Extra shapes drawn over the wheel. */
		highlights = [],
		/** Pitch classes ringed as currently sounding — wired to MIDI in M3. */
		lit = [],
		/** Arcs between two positions, for modulation distance and brightness. */
		arcs = [],
		size = 640,
		rings = undefined,
		interactive = true,
		showDuplicateRing = true,
		onrotate,
		onselect
	}: {
		config: WheelConfig;
		context?: Key;
		active?: number[];
		highlights?: Highlight[];
		lit?: number[];
		arcs?: Array<{ from: number; to: number; ring?: number; label?: string; muted?: boolean }>;
		size?: number;
		rings?: number;
		interactive?: boolean;
		showDuplicateRing?: boolean;
		onrotate?: (steps: number) => void;
		onselect?: (cell: Cell, pitchClass: number) => void;
	} = $props();

	const VIEW = 700;
	const geometry: WheelGeometry = { outerRadius: 330, ringWidth: 52 };

	const ringCount = $derived(rings ?? config.rings);
	const distinct = $derived(distinctRings(config));

	const activeSet = $derived(new Set(active.map((pc) => ((pc % 12) + 12) % 12)));
	const litSet = $derived(new Set(lit.map((pc) => ((pc % 12) + 12) % 12)));

	let rotation = $state<RotationState>({ angle: 0, velocity: 0, dragging: false });
	let frame = 0;
	let element: SVGSVGElement | undefined = $state();
	const tracker = new VelocityTracker();
	let grabAngle = 0;
	let grabRotation = 0;

	let reducedMotion = $state(false);
	$effect(() => {
		const query = window.matchMedia('(prefers-reduced-motion: reduce)');
		reducedMotion = query.matches;
		const listen = (e: MediaQueryListEvent) => (reducedMotion = e.matches);
		query.addEventListener('change', listen);
		return () => query.removeEventListener('change', listen);
	});

	function animate() {
		rotation = step(rotation, reducedMotion);
		if (isAtRest(rotation)) {
			frame = 0;
			onrotate?.(stepsForAngle(rotation.angle));
			return;
		}
		frame = requestAnimationFrame(animate);
	}

	function startAnimation() {
		if (frame) cancelAnimationFrame(frame);
		frame = requestAnimationFrame(animate);
	}

	$effect(() => () => {
		if (frame) cancelAnimationFrame(frame);
	});

	function centreOf() {
		const box = element!.getBoundingClientRect();
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	}

	function onpointerdown(event: PointerEvent) {
		if (!interactive || !element) return;
		const centre = centreOf();
		grabAngle = pointerAngle(event.clientX, event.clientY, centre.x, centre.y);
		grabRotation = rotation.angle;
		tracker.clear();
		tracker.add(grabAngle, event.timeStamp);
		rotation = { ...rotation, dragging: true, velocity: 0 };
		element.setPointerCapture(event.pointerId);
	}

	function onpointermove(event: PointerEvent) {
		if (!rotation.dragging || !element) return;
		const centre = centreOf();
		const angle = pointerAngle(event.clientX, event.clientY, centre.x, centre.y);
		tracker.add(angle, event.timeStamp);
		rotation = { ...rotation, angle: normaliseAngle(grabRotation + (angle - grabAngle)) };
	}

	function onpointerup(event: PointerEvent) {
		if (!rotation.dragging || !element) return;
		element.releasePointerCapture(event.pointerId);
		rotation = { ...rotation, dragging: false, velocity: tracker.velocity() };
		tracker.clear();
		startAnimation();
	}

	/** Keyboard rotation, one detent at a time. */
	function onkeydown(event: KeyboardEvent) {
		if (!interactive) return;
		const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!direction) return;
		event.preventDefault();
		rotation = { angle: normaliseAngle(rotation.angle + direction * 30), velocity: 0, dragging: false };
		onrotate?.(stepsForAngle(rotation.angle));
	}

	type RenderCell = Cell & { pc: number; name: string; duplicate: boolean };

	const cells = $derived.by(() => {
		const out: RenderCell[] = [];
		for (let ring = 0; ring < ringCount; ring++) {
			if (!showDuplicateRing && isDuplicateRing(ring, config)) continue;
			for (let position = 0; position < 12; position++) {
				const pc = pitchClassAt({ ring, position }, config);
				out.push({
					ring,
					position,
					pc,
					name: formatNote(spell(pc, context), { unicode: true }),
					duplicate: isDuplicateRing(ring, config)
				});
			}
		}
		return out;
	});

	const highlightPaths = $derived(
		highlights.map((h) => ({
			...h,
			polygon: h.outline === false ? '' : shapePolygonPath(h.cells, geometry),
			sectors: h.cells.map((cell) => cellSectorPath(cell, geometry))
		}))
	);

	/** Counter-rotate labels so they stay upright as the wheel turns. */
	const labelRotation = $derived(-rotation.angle);
</script>

<!--
	svelte-check cannot narrow the dynamic `role`, but the two travel together:
	the wheel is only focusable when it is also a slider.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svg
	bind:this={element}
	class="wheel no-select"
	class:is-dragging={rotation.dragging}
	class:is-interactive={interactive}
	viewBox="{-VIEW / 2} {-VIEW / 2} {VIEW} {VIEW}"
	width={size}
	height={size}
	role={interactive ? 'slider' : 'img'}
	aria-label="Harmonic wheel"
	aria-valuenow={interactive ? stepsForAngle(rotation.angle) : undefined}
	aria-valuemin={interactive ? 0 : undefined}
	aria-valuemax={interactive ? 11 : undefined}
	tabindex={interactive ? 0 : -1}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	onpointercancel={onpointerup}
	{onkeydown}
>
	<!-- Everything inside turns together, exactly like the physical object. -->
	<g transform="rotate({rotation.angle})">
		{#each cells as cell (`${cell.ring}-${cell.position}`)}
			{@const centre = cellCentre(cell, geometry)}
			{@const isActive = activeSet.has(cell.pc)}
			{@const isLit = litSet.has(cell.pc)}
			<g class="cell" class:is-duplicate={cell.duplicate}>
				<path
					d={cellSectorPath(cell, geometry)}
					fill="var(--pc-{cell.pc})"
					class="cell-fill"
					opacity={isActive ? 0.95 : cell.duplicate ? 0.1 : 0.18}
					onclick={() => onselect?.({ ring: cell.ring, position: cell.position }, cell.pc)}
					onkeydown={(e) =>
						e.key === 'Enter' && onselect?.({ ring: cell.ring, position: cell.position }, cell.pc)}
					role="button"
					tabindex="-1"
					aria-label={cell.name}
				/>
				{#if isLit}
					<path d={cellSectorPath(cell, geometry, 0.006, 0.5)} class="cell-lit" />
				{/if}
				<text
					x={centre.x}
					y={centre.y}
					transform="rotate({labelRotation} {centre.x} {centre.y})"
					class="cell-label"
					fill={isActive ? `var(--pc-${cell.pc}-ink)` : 'var(--color-ink-muted)'}
					opacity={cell.duplicate && !isActive ? 0.45 : 1}
					text-anchor="middle"
					dominant-baseline="central">{cell.name}</text
				>
			</g>
		{/each}

		{#each highlightPaths as highlight, i (i)}
			<g class="highlight" style:--strength={highlight.strength ?? 1}>
				{#each highlight.sectors as sector, j (j)}
					<path d={sector} class="highlight-sector" />
				{/each}
				{#if highlight.polygon}
					<path d={highlight.polygon} class="highlight-outline" />
				{/if}
			</g>
		{/each}

		{#each arcs as arc, i (i)}
			<path
				d={arcPath(arc.from, arc.to, ringRadii(arc.ring ?? 0, geometry).outer + 16)}
				class="arc"
				class:is-muted={arc.muted}
			/>
		{/each}
	</g>

	<!-- The index mark does not turn: it is the fixed point you read against. -->
	<g class="index">
		<path
			d="M 0 {-geometry.outerRadius - 30} l 9 -15 l -18 0 Z"
			fill="var(--color-ink-muted)"
		/>
	</g>
</svg>

<style>
	.wheel {
		display: block;
		max-width: 100%;
		height: auto;
		touch-action: none;
		outline: none;
	}

	.wheel.is-interactive {
		cursor: grab;
	}

	.wheel.is-dragging {
		cursor: grabbing;
	}

	.wheel:focus-visible {
		outline: 2px solid var(--color-ink-dim);
		outline-offset: 4px;
		border-radius: 50%;
	}

	.cell-fill {
		/* Motion is meaning: a cell lighting up is a note joining the shape, so it
		   fades rather than cutting. */
		transition: opacity 220ms var(--ease-wheel);
		cursor: pointer;
	}

	.cell-lit {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 2.5;
		pointer-events: none;
	}

	.cell-label {
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 600;
		pointer-events: none;
		transition: fill 220ms var(--ease-wheel);
	}

	.highlight {
		pointer-events: none;
	}

	.highlight-sector {
		fill: var(--color-ink);
		opacity: calc(0.06 * var(--strength, 1));
	}

	.highlight-outline {
		fill: var(--color-ink);
		fill-opacity: calc(0.05 * var(--strength, 1));
		stroke: var(--color-ink);
		stroke-opacity: calc(0.55 * var(--strength, 1));
		stroke-width: 2;
		stroke-linejoin: round;
		transition: d 320ms var(--ease-wheel);
	}

	.arc {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 3;
		stroke-linecap: round;
		pointer-events: none;
	}

	.arc.is-muted {
		stroke: var(--color-ground-line);
	}

	@media (prefers-reduced-motion: reduce) {
		.cell-fill,
		.cell-label,
		.highlight-outline {
			transition: none;
		}
	}
</style>
