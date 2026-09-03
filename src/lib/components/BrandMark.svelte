<script lang="ts">
	/*
	 * The Roundel — the brand mark.
	 *
	 * A ring with a bar across it, the transit-roundel shape. `pitch` makes the
	 * ring the circle of fifths: twelve stations, C at noon, each in its tonic's
	 * colour from the palette the account owns. Where the bar meets the ring the
	 * two stations sit *on top of* it, each with a hairline gap in the ground
	 * colour so a light one still reads on the bar. Nothing is hidden, and nothing
	 * sits at the centre.
	 *
	 * `flat` is the same shape in one colour — `currentColor`, so it takes the ink
	 * of whatever it sits in. It is the form that holds below about 28px: the app
	 * header, a browser tab, the favicon.
	 *
	 * This is not `Roundel.svelte`. That draws one key as a station on the map;
	 * this draws the whole network's mark. They are the same figure at two scales,
	 * on purpose.
	 */

	let {
		variant = 'flat',
		size = 24,
		title = ''
	}: {
		variant?: 'flat' | 'pitch';
		/** Rendered width and height — a number of pixels, or any CSS length. */
		size?: number | string;
		/** An accessible name. Empty (the default) marks the mark decorative, for
		 *  when it sits beside the wordmark and would only repeat it. */
		title?: string;
	} = $props();

	/*
	 * Circle of fifths, C at noon, clockwise, on a ring of radius 34 in the
	 * hundred-unit box. The bar spans y 42–58, so it meets the ring at the two
	 * stations on the horizontal — A on the right, E♭ on the left.
	 */
	const STATIONS = [
		{ pc: 0, cx: 50, cy: 16 },
		{ pc: 7, cx: 67, cy: 20.56 },
		{ pc: 2, cx: 79.44, cy: 33 },
		{ pc: 9, cx: 84, cy: 50 },
		{ pc: 4, cx: 79.44, cy: 67 },
		{ pc: 11, cx: 67, cy: 79.44 },
		{ pc: 6, cx: 50, cy: 84 },
		{ pc: 1, cx: 33, cy: 79.44 },
		{ pc: 8, cx: 20.56, cy: 67 },
		{ pc: 3, cx: 16, cy: 50 },
		{ pc: 10, cx: 20.56, cy: 33 },
		{ pc: 5, cx: 33, cy: 20.56 }
	];
</script>

<svg
	class="brand-mark"
	viewBox="0 0 100 100"
	width={size}
	height={size}
	role={title ? 'img' : undefined}
	aria-label={title || undefined}
	aria-hidden={title ? undefined : 'true'}
>
	{#if variant === 'pitch'}
		<circle
			cx="50"
			cy="50"
			r="34"
			fill="none"
			stroke="var(--color-ground-line)"
			stroke-width="1.4"
		/>
		<rect x="3" y="42" width="94" height="16" fill="var(--color-ink)" />
		<g stroke="var(--color-ground)" stroke-width="1.5">
			{#each STATIONS as station (station.pc)}
				<circle cx={station.cx} cy={station.cy} r="4.6" style="fill: var(--pc-{station.pc})" />
			{/each}
		</g>
	{:else}
		<circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" stroke-width="10" />
		<rect x="3" y="40" width="94" height="20" fill="currentColor" />
	{/if}
</svg>

<style>
	.brand-mark {
		display: block;
		flex: none;
		overflow: visible;
	}
</style>
