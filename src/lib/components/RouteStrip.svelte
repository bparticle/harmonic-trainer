<script lang="ts">
	import Roundel from '$lib/components/Roundel.svelte';

	/*
	 * One row of the network, for the task you are actually inside.
	 *
	 * The workout page could say what run it belonged to — `Task 2 of 4 · from C ·
	 * the relative minor` — and then said nothing whatever about where any
	 * individual question came from except a caption in the far corner. So the
	 * one screen where the keys are actually being played was the one screen the
	 * map had never reached, and *which key am I in* had to be worked out from the
	 * chord symbol.
	 *
	 * This is the map's own vocabulary at the size of a caption: a line named on
	 * the left, its stops drawn as the same roundels the network draws, and the
	 * one being served ringed. It is deliberately a *row* and not a second
	 * diagram — the network is on the home page and drawing it twice would be the
	 * fault that whole page was built to end.
	 *
	 * **Nothing here is a control.** A workout's queues are card ids, fixed when
	 * it was composed; pressing a stop could not change where the next question
	 * comes from, so nothing offers to.
	 */

	let {
		/** The line: what this question is about, in the words the material carries. */
		line,
		/** The stops, as stations, in the order the questions reach them. */
		stops,
		/** The station being served right now. */
		here = null,
		/**
		 * Draw the stops without saying which they are.
		 *
		 * For the key question, whose entire subject is which station this is. The
		 * caption in the corner already refuses to name it and the wheel already
		 * refuses to draw it; a strip of named roundels would hand over the answer
		 * more plainly than either.
		 */
		anonymous = false
	}: {
		line: string;
		stops: Array<{ key: string; pc: number; fill?: number; built?: boolean }>;
		here?: string | null;
		anonymous?: boolean;
	} = $props();

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');

	const label = $derived(
		anonymous
			? `${line} — somewhere on the network`
			: `${line}, calling at ${stops.map((stop) => glyph(stop.key)).join(', ')}${
					here ? `, now at ${glyph(here)}` : ''
				}`
	);
</script>

<div class="route" aria-label={label}>
	<span class="line-name">{line}</span>

	<ol class="stops">
		{#each stops as stop, i (stop.key)}
			<li class="stop" class:is-here={stop.key === here}>
				<Roundel
					inline
					size={2.2}
					name={stop.key}
					pc={stop.pc}
					fill={stop.fill ?? 0}
					built={stop.built ?? true}
					here={!anonymous && stop.key === here}
					linkLeft={i > 0}
					linkRight={i < stops.length - 1}
					{anonymous}
					title={anonymous ? 'somewhere on the network' : glyph(stop.key)}
				/>
			</li>
		{/each}
	</ol>
</div>

<style>
	.route {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.45rem 0.8rem;
	}

	/* A line is a rung and a rung has no pitch, so it is ink and weight — the
	   same inversion the network itself is drawn under. */
	.line-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.02em;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	/*
	 * No gap: the track is drawn inside each mark and the marks have to touch for
	 * it to join up. The spacing between stops is the roundel's own margin inside
	 * its box, so it scales with the mark.
	 */
	.stops {
		display: flex;
		align-items: center;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.stop {
		display: flex;
		align-items: center;
		line-height: 0;
	}
</style>
