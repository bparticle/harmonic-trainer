<script lang="ts">
	import { formatNote } from '$lib/music/note';
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
		wheelNoteName,
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
		/** Pitch classes filled with their own colour. */
		active = [],
		/**
		 * Degree label per pitch class — `I`, `ii`, `♭VII`. Shown under the note
		 * name on active cells, so the shape can be learned as a pattern of
		 * degrees rather than a set of letters that changes with every key.
		 */
		degrees = undefined,
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
		active?: number[];
		degrees?: Map<number, string>;
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

	/*
	 * Figure and ground.
	 *
	 * When a key is showing, the notes in it go to full colour and everything
	 * else drops right back, so the seven-note shape reads as one object at a
	 * glance rather than as a busy ring you have to decode. Learning the pattern
	 * is the whole purpose of the thing, and it cannot compete with eleven other
	 * saturated cells.
	 *
	 * When nothing is selected there is no figure, so contrast would only make
	 * the wheel look switched off — everything sits at a readable middle
	 * instead.
	 */
	const hasFigure = $derived(activeSet.size > 0 && activeSet.size < 12);

	function fillOpacity(pc: number, duplicate: boolean): number {
		// A note actually sounding is never dimmed away, even when it is outside
		// the key — playing something the key does not contain is exactly the
		// moment you want to see where it landed.
		if (litSet.has(pc)) return duplicate ? 0.6 : 0.96;
		if (!hasFigure) return duplicate ? 0.28 : 0.5;
		if (activeSet.has(pc)) return duplicate ? 0.5 : 0.96;
		return duplicate ? 0.05 : 0.09;
	}

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
		rotation = {
			angle: normaliseAngle(rotation.angle + direction * 30),
			velocity: 0,
			dragging: false
		};
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
					// Painted on, not re-spelled per key — see wheelNoteName.
					name: formatNote(wheelNoteName(pc), { unicode: true }),
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
			{@const degree = isActive ? degrees?.get(cell.pc) : undefined}
			{@const ink = isActive ? `var(--pc-${cell.pc}-ink)` : 'var(--color-ink-muted)'}
			<g class="cell" class:is-duplicate={cell.duplicate}>
				<path
					d={cellSectorPath(cell, geometry)}
					fill="var(--pc-{cell.pc})"
					class="cell-fill"
					opacity={fillOpacity(cell.pc, cell.duplicate)}
					onclick={() => onselect?.({ ring: cell.ring, position: cell.position }, cell.pc)}
					aria-hidden="true"
				/>
				{#if isLit}
					<path d={cellSectorPath(cell, geometry, 0.006, 0.5)} class="cell-lit" />
				{/if}
				<g transform="rotate({labelRotation} {centre.x} {centre.y})">
					<text
						x={centre.x}
						y={centre.y + (degree ? -7 : 0)}
						class="cell-label"
						fill={ink}
						opacity={hasFigure && !isActive ? 0.5 : cell.duplicate && !isActive ? 0.45 : 1}
						text-anchor="middle"
						dominant-baseline="central">{cell.name}</text
					>
					{#if degree}
						<!-- The degree is the thing worth memorising: it is the same in
							     all twelve keys, and the letter is not. -->
						<text
							x={centre.x}
							y={centre.y + 10}
							class="cell-degree"
							fill={ink}
							text-anchor="middle"
							dominant-baseline="central">{degree}</text
						>
					{/if}
				</g>
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
		<path d="M 0 {-geometry.outerRadius - 30} l 9 -15 l -18 0 Z" fill="var(--color-ink-muted)" />
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
		font-size: 18px;
		font-weight: 600;
		pointer-events: none;
		transition:
			fill 220ms var(--ease-wheel),
			opacity 220ms var(--ease-wheel);
	}

	.cell-degree {
		font-family: var(--font-mono);
		font-size: 11px;
		font-weight: 500;
		letter-spacing: 0.04em;
		opacity: 0.82;
		pointer-events: none;
	}

	.highlight {
		pointer-events: none;
	}

	/*
	 * A shape you are meant to remember has to be a shape you can see.
	 *
	 * Both of these were multiplied straight by strength, and the practice
	 * pages draw the key's scale at 0.4 — which arrived as a stroke at 0.22
	 * opacity over a 2.4% fill. Technically present, and invisible in a lit
	 * room. Even a chord at full strength only ever tinted its cells by six
	 * percent.
	 *
	 * The contour carries the emphasis now and the fill deliberately does not.
	 * The cells underneath are wearing the twelve pitch colours, and hue means
	 * pitch everywhere in this app, so ink laid thickly over them would grey
	 * out the one thing they are there to say. An outline costs the palette
	 * nothing and is what the eye actually remembers a shape by.
	 *
	 * A base plus a scaled term rather than a bare multiply, so the quiet end
	 * rises far enough to read while the loud end stays clearly louder. The
	 * scale at 0.4 and a chord at 0.9 are a context and a subject, and they
	 * have to remain tellable apart — that separation is the reason the
	 * strengths exist at all.
	 */
	.highlight-sector {
		fill: var(--color-ink);
		opacity: calc(0.04 + 0.08 * var(--strength, 1));
	}

	.highlight-outline {
		fill: var(--color-ink);
		fill-opacity: calc(0.03 + 0.05 * var(--strength, 1));
		stroke: var(--color-ink);
		stroke-opacity: calc(0.3 + 0.62 * var(--strength, 1));
		stroke-width: calc(2 + 1.1 * var(--strength, 1));
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
