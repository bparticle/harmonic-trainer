<script lang="ts">
	import Roundel from '$lib/components/Roundel.svelte';
	import { borrowColumn, type Line, type Network, type Station } from '$lib/session/network';
	import { neighbours, sayInKey, type ProgressionAnchor } from '$lib/curriculum/atlas';
	import { stageByKey, type RungId } from '$lib/curriculum/ladder';
	import { RELATION_LABELS } from '$lib/curriculum/crossing';

	/*
	 * The network.
	 *
	 * Seven lines across, twelve stations down the page's width, and a ragged
	 * edge where the building stopped. This replaced three separate drawings of
	 * the twelve keys — a banner naming one, twelve pips beside every rung, and a
	 * strip of swatches underneath — which between them meant three different
	 * things in one visual language.
	 *
	 * **Hue means pitch, so the stations carry the colour and the lines are drawn
	 * in weight.** A transit diagram normally colours its lines; a line here is a
	 * rung and a rung has no pitch. Inverting the convention keeps the house rule
	 * without a single exception and separates the two axes better than the
	 * convention would have: colour reads vertically, structure reads
	 * horizontally, and every hue on the drawing is a tonic.
	 *
	 * Geometry is `session/network.ts` and the music is `curriculum/atlas.ts`.
	 * This file draws what they return and decides nothing.
	 */

	type Layers = {
		record: boolean;
		today: boolean;
		crossings: boolean;
		progressions: boolean;
	};

	let {
		net,
		departureKey,
		selectedKey,
		pinnedRung,
		layers,
		progression = null,
		callsAt = [],
		heldAt = null,
		onstation,
		online,
		oncell
	}: {
		net: Network;
		/** Where today's run leaves from. Always a station on the network. */
		departureKey: string;
		/** The station being read. The same one, until you press somewhere else. */
		selectedKey: string;
		pinnedRung: RungId;
		layers: Layers;
		/** The progression being drawn, when that layer is on. */
		progression?: ProgressionAnchor | null;
		/** The keys today's questions would touch, ringed on the leading line. */
		callsAt?: string[];
		/**
		 * The one station the run is being held at, when it is being held at one.
		 *
		 * The map answers this rather than a sentence under the board. A service
		 * cut back to a single stop is a thing a transit diagram can simply *show*
		 * — the rest of the network recedes and the line is capped either side of
		 * the station that is left — and showing it costs no words and survives
		 * somebody who reads none.
		 */
		heldAt?: string | null;
		onstation: (key: string) => void;
		online: (rungId: RungId) => void;
		oncell: (key: string, rungId: RungId) => void;
	} = $props();

	/* -- The grid ---------------------------------------------------------
	 *
	 * A viewBox rather than pixels, so the drawing is one shape that scales.
	 * The left column is the route table — the seven line names — and the right
	 * one is how far each has been built. */

	const LABEL_RIGHT = 208;
	const X0 = 230;
	const XSTEP = 76;
	const Y0 = 140;
	const YSTEP = 52;
	const ROUNDEL_Y = 74;
	const LOOP_Y = 18;
	const ARC_BASE = 58;
	const COUNT_RIGHT = 1172;
	const WIDTH = 1180;
	const HEIGHT = 545;

	const xOf = (column: number) => X0 + column * XSTEP;
	const yOf = (index: number) => Y0 + index * YSTEP;

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');
	const tint = (pc: number) => `var(--pc-${pc})`;

	const departure = $derived(net.stations.find((s) => s.key === departureKey) ?? net.stations[6]);

	/*
	 * The overlays are about the station you are reading, not the one you are
	 * leaving from. They are the same station nearly always, and when they are
	 * not — you have pressed an unbuilt station to find out what it would take —
	 * the crossings and the borrowed chords should be that station's.
	 */
	const pinned = $derived(net.stations.find((s) => s.key === selectedKey) ?? departure);
	const leading = $derived(net.lines.find((l) => l.rungId === pinnedRung) ?? net.lines[0]);

	/*
	 * The band above the stations answers one question — where else does this key
	 * connect — so it can only answer it about one thing at a time. With neither
	 * layer on it carries the loop closure instead, which is the only other thing
	 * that belongs up there.
	 */
	const band = $derived(
		layers.crossings ? 'crossings' : layers.progressions ? 'progressions' : 'loop'
	);

	/** An arc over the roundels. Taller the further it goes, so labels never stack. */
	function arc(fromColumn: number, toColumn: number, lift = 0) {
		const x1 = xOf(fromColumn);
		const x2 = xOf(toColumn);
		const stops = Math.abs(toColumn - fromColumn);
		const bow = Math.min(44, 4 + stops * 10 + lift);
		return {
			d: `M ${x1} ${ARC_BASE} Q ${(x1 + x2) / 2} ${ARC_BASE - 2 * bow} ${x2} ${ARC_BASE}`,
			x: (x1 + x2) / 2,
			y: ARC_BASE - bow - 5
		};
	}

	/*
	 * The near four, where they actually are. The dominant and the subdominant
	 * are both one stop, so without a lift their arcs would share a height and
	 * their labels would sit on top of each other.
	 */
	const LIFT: Record<string, number> = { dominant: 0, subdominant: 10, parallel: 4 };

	const crossings = $derived.by(() => {
		const stage = stageByKey(pinned.key);
		if (!stage) return [];
		return neighbours(stage)
			.filter((n) => n.relation !== 'relative')
			.map((n) => {
				const column = net.stations.find((s) => s.key === n.stage.key)?.column ?? 0;
				return {
					...n,
					...arc(pinned.column, column, LIFT[n.relation] ?? 0),
					label: RELATION_LABELS[n.relation].replace(/^the /, '')
				};
			});
	});

	/*
	 * Where a progression's chords are borrowed from, said in the key the
	 * departure is actually in. The anchors are worked out in C; a label that did
	 * not move with the station would be the drawing telling a small lie in the
	 * one place it makes its strongest claim.
	 */
	const borrows = $derived.by(() => {
		if (!progression) return [];
		return progression.borrows
			.filter((borrow) => borrow.from !== null)
			.map((borrow) => {
				const column = borrowColumn(borrow.from!.accidentals, pinned.accidentals);
				return {
					symbol: glyph(sayInKey(borrow.symbol, pinned.accidentals)),
					...arc(pinned.column, column)
				};
			});
	});

	/** Which stations today's questions would reach, on the line that leads them. */
	const calling = $derived(
		layers.today ? callsAt.filter((key) => leading?.keys.includes(key)) : []
	);

	const held = $derived(heldAt ? (net.stations.find((s) => s.key === heldAt) ?? null) : null);

	/**
	 * How long a station waits before it recedes.
	 *
	 * The far ends go first and the fade travels inwards, because that is what
	 * cutting a service back to one stop looks like: the ends close and the
	 * closure walks towards what is left. Nought at the far terminus and longest
	 * beside the station being held.
	 *
	 * Zero when nothing is held, so letting the network back is one movement
	 * rather than an unwinding — the run is not being cut back, it is being
	 * restored, and those are different events.
	 */
	const REACH = 22;
	const recedeDelay = (column: number) => {
		if (!held) return 0;
		const furthest = Math.max(held.column, net.ends.sharp - held.column);
		return (furthest - Math.abs(column - held.column)) * REACH;
	};

	const isOpenCell = (station: Station, line: Line) => line.index < station.lines;

	const lineNote = (line: Line) => {
		if (line.stops === 0) return '—';
		return `${line.stops}/12`;
	};
</script>

<svg
	class="map"
	class:is-held={held !== null}
	viewBox="0 0 {WIDTH} {HEIGHT}"
	role="img"
	aria-label="The ladder as a network: {net.lines.filter((l) => l.stops > 0)
		.length} lines open across {net.lines[0].stops} of twelve keys"
>
	<!-- The loop closure, when nothing else needs the band.
	     G♭ is six flats and B is five sharps, and one more sharp than B is F♯ —
	     the same station as G♭. The last stop the curriculum opens is the one
	     that closes the circle, and this is the only place that can be said. -->
	{#if band === 'loop'}
		{@const bx = xOf(net.ends.sharp)}
		{@const gx = xOf(net.ends.flat)}
		<path
			class="hair"
			d="M {bx} {ROUNDEL_Y - 22} L {bx} {LOOP_Y} L {bx - 190} {LOOP_Y}"
			fill="none"
		/>
		<path
			class="hair"
			d="M {gx} {ROUNDEL_Y - 22} L {gx} {LOOP_Y} L {gx + 190} {LOOP_Y}"
			fill="none"
		/>
		<text class="loop-note" x={(bx + gx) / 2} y={LOOP_Y + 4} text-anchor="middle">
			one more sharp than B is F♯ — the same station as G♭
		</text>
	{/if}

	{#if band === 'crossings'}
		{#each crossings as crossing (crossing.relation)}
			<path class="span" d={crossing.d} fill="none" />
			<text class="span-label" x={crossing.x} y={crossing.y} text-anchor="middle"
				>{crossing.label}</text
			>
		{/each}
	{/if}

	{#if band === 'progressions'}
		{#each borrows as borrow (borrow.symbol)}
			<path class="span is-borrowed" d={borrow.d} fill="none" />
			<text class="span-label" x={borrow.x} y={borrow.y} text-anchor="middle">{borrow.symbol}</text>
		{/each}
	{/if}

	<!-- The lines. Ink and weight only: a rung is not a pitch. -->
	{#each net.lines as line (line.rungId)}
		{@const y = yOf(line.index)}
		{@const isLead = line.rungId === pinnedRung}
		<text
			class="line-name"
			class:is-lead={isLead}
			class:is-shut={line.stops === 0}
			x={LABEL_RIGHT}
			y={y + 4}
			text-anchor="end"
		>
			{line.stops === 0 && net.opensNext?.rungId === line.rungId
				? `${line.label} — opens next`
				: line.label}
		</text>

		{#if line.from !== null && line.to !== null}
			<line
				class="track"
				class:is-lead={isLead}
				x1={xOf(line.from)}
				y1={y}
				x2={xOf(line.to)}
				y2={y}
			/>
		{/if}

		<!-- What one more stop would add, pointing the way the ladder would go. -->
		{#if line.next && line.from !== null && line.to !== null}
			<line
				class="stub"
				x1={line.next.column > line.to ? xOf(line.to) : xOf(line.from)}
				y1={y}
				x2={xOf(line.next.column)}
				y2={y}
			/>
			<circle
				class="ghost-stop"
				cx={xOf(line.next.column)}
				cy={y}
				r="5.5"
				style:--tint={tint(line.next.pc)}
			/>
		{/if}

		<!-- The line that would open next, as a stub at C. -->
		{#if line.stops === 0 && net.opensNext?.rungId === line.rungId}
			<line class="stub" x1={xOf(6) - 26} y1={y} x2={xOf(6) + 26} y2={y} />
		{/if}

		<text class="line-count" x={COUNT_RIGHT} y={y + 4} text-anchor="end">{lineNote(line)}</text>

		<!-- A generous row-height hit area, so the line is pressable anywhere. -->
		<rect
			class="hit"
			x="4"
			y={y - 20}
			width={WIDTH - 8}
			height="40"
			role="button"
			tabindex="0"
			aria-label="Lead with {line.label}"
			aria-pressed={isLead}
			onclick={() => online(line.rungId)}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					online(line.rungId);
				}
			}}
		/>
	{/each}

	<!-- The stations. Everything coloured on this drawing is one of these. -->
	{#each net.stations as station (station.key)}
		{@const x = xOf(station.column)}
		{@const warm = layers.record ? station.fill : 0}

		<!-- One group per station, so a station recedes as the one thing it is
		     rather than as a spine, some stops and a roundel going separately. -->
		<g
			class="station"
			class:is-receded={held !== null && station.key !== held.key}
			style:transition-delay="{recedeDelay(station.column)}ms"
		>
			{#if station.onNetwork}
				<line
					class="spine"
					x1={x}
					y1={ROUNDEL_Y + 40}
					x2={x}
					y2={yOf(Math.max(0, station.lines - 1))}
					style:--tint={tint(station.pc)}
				/>
			{/if}

			<!-- The open stops, drawn. Not pressable themselves: the hit circles below
		     cover every crossing at one size, open or not. -->
			{#each net.lines.slice(0, station.lines) as line (line.rungId)}
				<circle class="stop" cx={x} cy={yOf(line.index)} r="4.6" style:--tint={tint(station.pc)} />
			{/each}

			<!--
			Every crossing of a line and a station, pressable.

			**Only the open ones used to be.** A crossing with nothing drawn on it
			had no target of its own, so a press there fell through to the line's
			full-width row and pinned the line while leaving the key alone — and if
			that line was already leading, the press did nothing whatsoever. Which
			is the same fault `Line.next` was written to fix, one level out: a place
			on the diagram that looks like a thing to press, and is not.

			Pressing an unopened crossing is a perfectly good question — *what would
			it take to work on the home chord in F* — and the panel below answers it,
			with the control that opens it where the ladder can reach it. The cards
			are made on the way out, so it is also somewhere a train can leave from.
		-->
			{#each net.lines as line (line.rungId)}
				{@const open = line.index < station.lines}
				<circle
					class="cell-hit"
					class:is-shut={!open}
					cx={x}
					cy={yOf(line.index)}
					r="17"
					role="button"
					tabindex="-1"
					aria-label="{glyph(station.key)}, {line.label}{open ? '' : ' — not open yet'}"
					onclick={(event) => {
						event.stopPropagation();
						oncell(station.key, line.rungId);
					}}
					onkeydown={(event) => {
						if (event.key !== 'Enter' && event.key !== ' ') return;
						event.preventDefault();
						oncell(station.key, line.rungId);
					}}
				/>
			{/each}

			<g
				class="roundel"
				role="button"
				tabindex="0"
				aria-label="{glyph(station.key)} major with {glyph(station.relativeMinor)}{station.onNetwork
					? `, ${station.lines} of ${net.lines.length} lines`
					: ', not on the network yet'}"
				aria-pressed={station.key === selectedKey}
				onclick={() => onstation(station.key)}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onstation(station.key);
					}
				}}
			>
				<Roundel
					name={station.key}
					pc={station.pc}
					fill={warm}
					built={station.onNetwork}
					{x}
					y={ROUNDEL_Y}
					r={15}
				/>

				<text
					class="station-minor"
					class:is-relative={band === 'crossings' && station.key === selectedKey}
					{x}
					y={ROUNDEL_Y + 32}
					text-anchor="middle"
				>
					{glyph(station.relativeMinor)}{band === 'crossings' && station.key === selectedKey
						? ' · relative'
						: ''}
				</text>
			</g>
		</g>
	{/each}

	<!--
		The line, capped either side of the station it is being held at.

		A buffer stop: the transit diagram's own mark for *the service ends here*,
		and the only thing on this drawing that says the run will not go anywhere
		else. It closes in from outside rather than growing from the roundel,
		because the movement is a network being cut back to one stop.
	-->
	{#if held}
		{@const hx = xOf(held.column)}
		<!-- Outside the departure ring at r=22, and inside the half-step to the
		     next station at 38, which is the whole of the room there is. -->
		<g class="terminus">
			<path class="buffer" d="M {hx - 26} {ROUNDEL_Y} H {hx - 33}" />
			<path class="buffer" d="M {hx - 33} {ROUNDEL_Y - 7} V {ROUNDEL_Y + 7}" />
			<path class="buffer" d="M {hx + 26} {ROUNDEL_Y} H {hx + 33}" />
			<path class="buffer" d="M {hx + 33} {ROUNDEL_Y - 7} V {ROUNDEL_Y + 7}" />
		</g>
	{/if}

	<!-- Today's run: where it leaves from, and what it calls at on the leading
	     line. Ink and not colour, because a departure is not a pitch. -->
	{#if layers.today && departure.onNetwork}
		<circle class="departs" cx={xOf(departure.column)} cy={ROUNDEL_Y} r="22" />
		{#if band === 'loop'}
			<text class="departs-flag" x={xOf(departure.column)} y={ROUNDEL_Y - 30} text-anchor="middle"
				>DEPARTS</text
			>
		{/if}
		{#each calling as key (key)}
			{@const station = net.stations.find((s) => s.key === key)}
			{#if station && leading && isOpenCell(station, leading)}
				<circle class="calls" cx={xOf(station.column)} cy={yOf(leading.index)} r="8.5" />
			{/if}
		{/each}
	{/if}

	{#if selectedKey !== departureKey}
		<circle class="reading" cx={xOf(pinned.column)} cy={ROUNDEL_Y} r="21" />
		<text class="reading-flag" x={xOf(pinned.column)} y={ROUNDEL_Y - 28} text-anchor="middle"
			>READING</text
		>
	{/if}

	<!-- Where the chosen progression opens: filled if it is open in this key. -->
	{#if band === 'progressions' && progression?.lineIndex !== null && progression?.lineIndex !== undefined}
		{@const y = yOf(progression.lineIndex)}
		{@const x = xOf(pinned.column)}
		<rect
			class="opens"
			class:is-open={progression.lineIndex < pinned.lines}
			x={x - 7}
			y={y - 7}
			width="14"
			height="14"
			transform="rotate(45 {x} {y})"
		/>
	{/if}
</svg>

<style>
	.map {
		display: block;
		width: 100%;
		min-width: 780px;
		height: auto;
	}

	/* --- Lines: ink and weight, never hue ------------------------------ */

	.track {
		stroke: var(--color-ground-line);
		stroke-width: 3.5;
		stroke-linecap: round;
	}

	.track.is-lead {
		stroke: var(--color-ink-muted);
		stroke-width: 5;
	}

	.stub {
		stroke: var(--color-ground-line);
		stroke-width: 3;
		stroke-dasharray: 2 7;
		stroke-linecap: round;
	}

	.ghost-stop {
		fill: var(--color-ground);
		stroke: var(--tint);
		stroke-width: 1.6;
		stroke-dasharray: 2 2.5;
		opacity: 0.85;
	}

	.hair {
		stroke: var(--color-ground-line);
		stroke-width: 1.5;
		stroke-dasharray: 2 5;
	}

	.line-name {
		font-family: var(--font-mono);
		font-size: 12.5px;
		fill: var(--color-ink-muted);
	}

	.line-name.is-shut {
		fill: var(--color-ground-line);
	}

	/* Last, so a line that leads the queue still reads as the lead even when it
	   has not opened yet — which is exactly what a progression anchored below the
	   frontier looks like. */
	.line-name.is-lead {
		fill: var(--color-ink);
		font-weight: 600;
	}

	.line-count {
		font-family: var(--font-mono);
		font-size: 11.5px;
		fill: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	/* --- Stations: the only coloured things on the drawing -------------- */

	.spine {
		stroke: var(--tint);
		stroke-width: 6;
		stroke-linecap: round;
		opacity: 0.9;
	}

	.stop {
		fill: var(--tint);
		stroke: var(--color-ground-raised);
		stroke-width: 2;
		pointer-events: none;
	}

	/*
	 * One hit area per crossing, the same size whether or not anything is drawn
	 * there. Transparent rather than `none`, because `none` is not paintable and
	 * a shape that is not painted is not pressed either.
	 *
	 * The shut ones show a dashed ring on hover. That is the whole of the answer
	 * to *how would I know I could press this*: the diagram says so under the
	 * cursor, in the same dashes it already uses for a station the ladder has not
	 * reached.
	 */
	.cell-hit {
		fill: transparent;
		cursor: pointer;
	}

	/*
	 * No focus ring on a crossing. It is `tabindex="-1"` and unreachable by
	 * keyboard — the roundel and the line's own row are what tab to, and pressing
	 * one of each reaches the same cell — so the ring a click leaves behind marks
	 * nothing a keyboard user can act on. At a hit radius of seventeen it is a
	 * large square drawn over the diagram for no reason.
	 */
	.cell-hit:focus,
	.cell-hit:focus-visible {
		outline: none;
	}

	.cell-hit.is-shut:hover {
		stroke: var(--color-ink-dim);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}

	.station-minor {
		font-family: var(--font-mono);
		font-size: 10px;
		fill: var(--color-ink-dim);
	}

	.station-minor.is-relative {
		fill: var(--color-ink);
	}

	/* --- Overlays ------------------------------------------------------- */

	.span {
		stroke: var(--color-ink-dim);
		stroke-width: 1.6;
	}

	.span.is-borrowed {
		stroke-dasharray: 3 4;
	}

	.span-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.06em;
		fill: var(--color-ink-muted);
	}

	.loop-note {
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.08em;
		fill: var(--color-ink-dim);
	}

	.departs {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 2;
	}

	/* Reading a station is not leaving from one, so it is drawn a step quieter. */
	.reading {
		fill: none;
		stroke: var(--color-ink-dim);
		stroke-width: 1.5;
		stroke-dasharray: 4 4;
	}

	.reading-flag {
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.14em;
		fill: var(--color-ink-dim);
	}

	.departs-flag {
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.14em;
		fill: var(--color-ink);
	}

	.calls {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 1.6;
		opacity: 0.85;
	}

	.opens {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 1.8;
	}

	.opens.is-open {
		fill: var(--color-ink);
	}

	/* --- Held at one station -------------------------------------------- */

	/*
	 * The network receding, and the line capped where the run is being kept.
	 *
	 * Motion that explains a state change and nothing else, which is the only
	 * kind this app allows itself. The stations do not disappear — pressing one
	 * is still how you go somewhere else, and a control that vanished when a
	 * switch was thrown would be a worse answer than the sentence this replaced.
	 * They stand back.
	 */
	.station {
		transition: opacity 300ms var(--ease-wheel);
	}

	.station.is-receded {
		opacity: 0.24;
	}

	/* The rails go quiet too, but a step less far: the network is still there,
	   the run simply is not using it. */
	.map.is-held :is(.track, .stub, .ghost-stop, .hair, .loop-note, .line-count) {
		opacity: 0.4;
		transition: opacity 300ms var(--ease-wheel);
	}

	.buffer {
		fill: none;
		stroke: var(--color-ink);
		stroke-width: 2.4;
		stroke-linecap: round;
	}

	.terminus {
		transform-box: fill-box;
		transform-origin: center;
		animation: close-in 320ms var(--ease-wheel) both;
	}

	@keyframes close-in {
		from {
			opacity: 0;
			transform: scaleX(1.7);
		}
		to {
			opacity: 1;
			transform: scaleX(1);
		}
	}

	/*
	 * The global reduced-motion rule cuts every duration to nothing and leaves
	 * delays alone, so without this the map would still stagger its way through
	 * a third of a second for somebody who asked it not to move at all.
	 */
	@media (prefers-reduced-motion: reduce) {
		.station {
			transition-delay: 0ms !important;
		}
	}

	/* --- Interaction ---------------------------------------------------- */

	.hit {
		fill: transparent;
		cursor: pointer;
	}

	.roundel {
		cursor: pointer;
	}

	.hit:focus-visible,
	.roundel:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}
</style>
