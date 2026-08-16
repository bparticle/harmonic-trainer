<script module lang="ts">
	/**
	 * The imperative half of the fireworks.
	 *
	 * Everything here is fired *at* a moment — a note found, a chord landed, a
	 * beat gone by — and none of it is state the page should have to hold. So the
	 * component hands out this handle on mount rather than being driven by props
	 * that the page would then have to remember to unset.
	 */
	export type FireworksApi = {
		/** A chord tone found, at the element it was found on. */
		spark: (at: Element | null | undefined, pc: number, power?: number) => void;
		/** A whole chord landed. Bigger, and once per chord rather than once per note. */
		land: (at: Element | null | undefined, pc: number, power?: number) => void;
		/** One beat gone by. `strength` is 1 on a downbeat. */
		pulse: (strength: number) => void;
		/** A few words, briefly, in the middle of the screen. */
		say: (text: string, pc: number) => void;
		/** The end of a good run: confetti in every colour the tune used. */
		finale: (pitchClasses: number[], text: string) => void;
		/** Take it all off the screen at once. */
		clear: () => void;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { oklchToRgb, type Oklch } from '$lib/design/color';
	import { DEFAULT_PALETTE } from '$lib/design/palette';
	import {
		confettiFall,
		fade,
		landBurst,
		sparkBurst,
		step,
		type Particle
	} from '$lib/effects/sparkle';

	/*
	 * The fireworks.
	 *
	 * An optional layer of noise over a play-along: sparks where a chord tone
	 * landed, a shower where a whole chord did, and a glow around the edges of
	 * the screen that burns brighter the longer a streak runs. It is over the top
	 * on purpose, which is exactly why it is a switch — the rest of this app is
	 * built to stay out of the way of the music, and this is the one place that
	 * rule is suspended by request.
	 *
	 * Three constraints shape it:
	 *
	 * 1. **Colour is never invented.** Every particle carries a pitch class and
	 *    looks its colour up in the same palette the wheel, the keyboard and the
	 *    chart use. A spark that picked its own hue would be the first thing in
	 *    the app to lie about which note it belongs to.
	 * 2. **Nothing here can touch the audio.** It runs on the frame clock and
	 *    stops dead when there is nothing to draw, so a backgrounded tab costs
	 *    nothing at all.
	 * 3. **Nothing goes red.** There is no effect for a missed chord, because
	 *    this page does not punish — see the tone rules in DECISIONS. A dropped
	 *    streak simply stops glowing.
	 */

	let {
		enabled = true,
		palette = DEFAULT_PALETTE,
		pc = null,
		intensity = 0,
		onready
	}: {
		enabled?: boolean;
		/** The twelve pitch colours, as edited. Particles are drawn from these. */
		palette?: Oklch[];
		/** The chord sounding now, for the aura. Null when nothing is playing. */
		pc?: number | null;
		/** 0–1, from the streak tier. How hard the aura burns. */
		intensity?: number;
		onready?: (api: FireworksApi) => void;
	} = $props();

	/** Past this the frame budget matters more than the extra sparks. */
	const CEILING = 900;

	let canvas = $state<HTMLCanvasElement | null>(null);
	let auraEl = $state<HTMLDivElement | null>(null);
	let motionOK = $state(true);

	/** The switch and the accessibility preference, together. */
	const live = $derived(enabled && motionOK);

	let particles: Particle[] = [];
	let context: CanvasRenderingContext2D | null = null;
	let frame = 0;
	let lastFrameAt = 0;
	let width = 0;
	let height = 0;

	/** The palette as 8-bit sRGB, so a per-particle draw is a string join and no maths. */
	const rgb = $derived(palette.map(oklchToRgb));

	let nextCalloutId = 0;
	let callouts = $state<Array<{ id: number; text: string; pc: number }>>([]);

	/*
	 * How bright the edges glow.
	 *
	 * A floor while anything is sounding at all, so the screen is visibly *on*
	 * during a run, plus whatever the streak has earned on top.
	 */
	const auraBase = $derived(live && pc !== null ? 0.34 + 0.62 * intensity : 0);

	onMount(() => {
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		motionOK = !reduced.matches;
		const onPreference = () => {
			motionOK = !reduced.matches;
			if (!motionOK) clear();
		};
		reduced.addEventListener('change', onPreference);

		window.addEventListener('resize', resize);
		resize();

		onready?.({ spark, land, pulse, say, finale, clear });

		return () => {
			reduced.removeEventListener('change', onPreference);
			window.removeEventListener('resize', resize);
			if (frame) cancelAnimationFrame(frame);
			frame = 0;
		};
	});

	// The canvas is only in the DOM while the layer is on, so its context and its
	// size are picked up whenever it comes back rather than once at mount.
	$effect(() => {
		if (!canvas) {
			context = null;
			return;
		}
		context = canvas.getContext('2d');
		resize();
	});

	// Switching it off mid-run should clear the screen, not freeze whatever was
	// in the air at the time.
	$effect(() => {
		if (!live) clear();
	});

	function resize() {
		width = window.innerWidth;
		height = window.innerHeight;
		if (!canvas || !context) return;
		// Two is as far as the extra pixels are worth paying for on a burst of
		// soft-edged dots; a 3x phone would otherwise draw nine times the area.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	/** Where on screen an effect belongs, or the middle of the screen if it has gone. */
	function centreOf(target: Element | null | undefined): { x: number; y: number } {
		if (!target) return { x: width / 2, y: height / 2 };
		const box = target.getBoundingClientRect();
		return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
	}

	function add(born: Particle[]) {
		particles = particles.concat(born);
		// Oldest first, since those are the ones already fading out.
		if (particles.length > CEILING) particles = particles.slice(particles.length - CEILING);
		if (!frame) frame = requestAnimationFrame(tick);
	}

	function tick(now: number) {
		const dt = lastFrameAt ? (now - lastFrameAt) / 1000 : 1 / 60;
		lastFrameAt = now;
		particles = step(particles, dt);
		render();

		if (particles.length > 0) {
			frame = requestAnimationFrame(tick);
		} else {
			frame = 0;
			lastFrameAt = 0;
		}
	}

	function render() {
		if (!context) return;
		context.clearRect(0, 0, width, height);

		for (const particle of particles) {
			const alpha = fade(particle);
			const colour = rgb[particle.pc] ?? rgb[0];
			if (!colour) continue;
			const { r, g, b } = colour;

			if (particle.kind === 'confetti') {
				drawConfetti(context, particle, `rgba(${r},${g},${b},${alpha})`);
				continue;
			}

			// Additive for anything meant to read as light. This is what makes two
			// overlapping sparks brighter than one instead of merely denser.
			context.globalCompositeOperation = 'lighter';

			if (particle.kind === 'spark') drawSpark(context, particle, r, g, b, alpha);
			else if (particle.kind === 'star') drawStar(context, particle, r, g, b, alpha);
			else drawRing(context, particle, r, g, b, alpha);

			context.globalCompositeOperation = 'source-over';
		}
	}

	/** A trail in the note's colour with a hot core, which is what makes it read as a spark. */
	function drawSpark(
		ctx: CanvasRenderingContext2D,
		p: Particle,
		r: number,
		g: number,
		b: number,
		alpha: number
	) {
		ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * 0.7})`;
		ctx.lineWidth = p.size;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(p.x, p.y);
		ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
		ctx.stroke();

		ctx.fillStyle = `rgba(255,255,255,${alpha * alpha * 0.85})`;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
		ctx.fill();
	}

	function drawStar(
		ctx: CanvasRenderingContext2D,
		p: Particle,
		r: number,
		g: number,
		b: number,
		alpha: number
	) {
		// A soft bloom under the shape, so a star carries light rather than just
		// being a lit outline.
		ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.16})`;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size * 1.9, 0, Math.PI * 2);
		ctx.fill();

		ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
		ctx.beginPath();
		for (let i = 0; i < 8; i++) {
			const angle = p.spin + (i * Math.PI) / 4;
			// Alternating long and very short arms: the four-pointed sparkle, not
			// a stubby eight-pointed cog.
			const radius = i % 2 === 0 ? p.size : p.size * 0.2;
			const x = p.x + Math.cos(angle) * radius;
			const y = p.y + Math.sin(angle) * radius;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.closePath();
		ctx.fill();
	}

	function drawRing(
		ctx: CanvasRenderingContext2D,
		p: Particle,
		r: number,
		g: number,
		b: number,
		alpha: number
	) {
		ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * alpha * 0.75})`;
		ctx.lineWidth = 1 + 4 * alpha;
		ctx.beginPath();
		ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
		ctx.stroke();
	}

	/** Paper, not light: flat colour, and tumbling by squashing rather than spinning. */
	function drawConfetti(ctx: CanvasRenderingContext2D, p: Particle, fill: string) {
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(p.spin * 0.35);
		ctx.scale(1, Math.cos(p.spin));
		ctx.fillStyle = fill;
		ctx.fillRect(-p.size / 2, -p.size / 3, p.size, (p.size * 2) / 3);
		ctx.restore();
	}

	let beat: Animation | null = null;

	function pulse(strength: number) {
		if (!live || !auraEl) return;
		// Cancelled rather than layered: at 300bpm the beats arrive faster than a
		// pulse decays, and stacked animations drift out of time with the music.
		beat?.cancel();
		const peak = Math.min(1, auraBase + 0.16 + 0.3 * strength);
		beat = auraEl.animate(
			[
				{ opacity: String(peak), transform: `scale(${1 + 0.025 * strength})` },
				{ opacity: String(auraBase), transform: 'scale(1)' }
			],
			{ duration: 140 + 260 * strength, easing: 'cubic-bezier(0.15, 0.9, 0.3, 1)' }
		);
	}

	function spark(at: Element | null | undefined, note: number, power = 0.5) {
		if (!live) return;
		const { x, y } = centreOf(at);
		add(sparkBurst({ x, y, pc: note, power }));
	}

	function land(at: Element | null | undefined, note: number, power = 1) {
		if (!live) return;
		const { x, y } = centreOf(at);
		add(landBurst({ x, y, pc: note, power }));
	}

	function say(text: string, note: number) {
		if (!live) return;
		const id = nextCalloutId++;
		// Three at once is already a pile-up; the fourth would be covering the
		// first, which is how a callout stops being readable.
		callouts = [...callouts, { id, text, pc: note }].slice(-3);
		setTimeout(() => (callouts = callouts.filter((entry) => entry.id !== id)), 1300);
	}

	function finale(pitchClasses: number[], text: string) {
		if (!live) return;
		add(confettiFall(width, pitchClasses));
		say(text, pitchClasses[0] ?? 0);
	}

	function clear() {
		particles = [];
		callouts = [];
		beat?.cancel();
		if (frame) cancelAnimationFrame(frame);
		frame = 0;
		lastFrameAt = 0;
		context?.clearRect(0, 0, width, height);
	}
</script>

{#if live}
	<!--
		The glow sits *behind* the page rather than over it. Every panel on this
		screen has an opaque background, so what shows through is the margins and
		the gutters — an edge-lit room rather than a colour wash over the chart
		you are trying to read.
	-->
	<div
		class="aura"
		bind:this={auraEl}
		style:--glow={pc === null ? 'transparent' : `var(--pc-${pc})`}
		style:opacity={auraBase}
		aria-hidden="true"
	></div>

	<canvas class="sparks" bind:this={canvas} aria-hidden="true"></canvas>

	<!-- Nothing here is announced: it is all a second telling of what the score
	     strip already says in words. -->
	<div class="callouts" aria-hidden="true">
		{#each callouts as entry (entry.id)}
			<strong class="callout" style:--glow="var(--pc-{entry.pc})">{entry.text}</strong>
		{/each}
	</div>
{/if}

<style>
	/*
	 * The glow sits behind the page, not over it.
	 *
	 * Blending it on top with `mix-blend-mode: screen` reaches more of the
	 * screen and was tried and rejected: it lands on the chart as well as the
	 * margins, and washing a second colour over bars that are already tinted by
	 * their own root muddles the one thing on this page that has to stay exact.
	 *
	 * Behind means every opaque panel masks it, so what actually shows is the
	 * gutters, the page margins and the space under the chart — the room lit
	 * from the edges rather than a filter over the work. Less of it, and all of
	 * it in places where nothing is being read.
	 */
	.aura {
		position: fixed;
		/* Overhung so the gradients' soft ends fall outside the viewport rather
		   than showing an edge where they stop. */
		inset: -12%;
		z-index: -1;
		pointer-events: none;
		background:
			radial-gradient(
				55% 42% at 50% 100%,
				color-mix(in oklab, var(--glow) 88%, transparent),
				transparent 72%
			),
			radial-gradient(
				42% 34% at 2% 14%,
				color-mix(in oklab, var(--glow) 68%, transparent),
				transparent 74%
			),
			radial-gradient(
				42% 34% at 98% 14%,
				color-mix(in oklab, var(--glow) 68%, transparent),
				transparent 74%
			);
		transition: opacity 300ms ease;
		will-change: opacity, transform;
	}

	.sparks {
		position: fixed;
		inset: 0;
		z-index: 30;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	/*
	 * Callouts sit under the header's z-index rather than over it: the navigation
	 * and the transport stay clickable through a celebration, which matters most
	 * exactly when the screen is busiest.
	 */
	.callouts {
		position: fixed;
		inset: 0 0 auto;
		top: 22vh;
		z-index: 35;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		pointer-events: none;
	}

	.callout {
		display: block;
		color: var(--glow);
		font-family: var(--font-display);
		font-size: clamp(2.4rem, 9vw, 5rem);
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		white-space: nowrap;
		/* Two shadows: a tight dark one so it survives landing on a pale panel,
		   and a wide coloured one for the bloom. */
		text-shadow:
			0 2px 10px color-mix(in oklab, black 70%, transparent),
			0 0 34px color-mix(in oklab, var(--glow) 65%, transparent);
		animation: callout 1300ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}

	@keyframes callout {
		0% {
			opacity: 0;
			transform: scale(0.5) rotate(-4deg);
		}
		14% {
			opacity: 1;
			/* Overshoot, then settle. A stamp landing, not a label appearing. */
			transform: scale(1.14) rotate(1.5deg);
		}
		28% {
			transform: scale(1) rotate(0deg);
		}
		70% {
			opacity: 1;
			transform: scale(1) translateY(-0.4rem);
		}
		100% {
			opacity: 0;
			transform: scale(1.05) translateY(-2.5rem);
		}
	}
</style>
