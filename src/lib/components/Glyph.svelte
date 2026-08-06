<script lang="ts">
	import type { Glyph } from '$lib/music/symbol';

	/*
	 * Musical accidentals and quality marks as vectors.
	 *
	 * Drawn rather than typed because ♭ ♯ ∆ ø ° are absent from most display
	 * faces, and a fallback glyph at chord-symbol size is glaring. Drawing them
	 * also means their weight and proportion can be tuned to sit with the
	 * typeface instead of against it.
	 *
	 * Every path is authored in a 100-unit em box with the baseline at y=100,
	 * so `size` behaves like a font size and the glyphs align on the baseline.
	 */

	let {
		glyph,
		size = 1,
		class: className = ''
	}: { glyph: Glyph; size?: number; class?: string } = $props();

	// Stroke-built glyphs keep their weight when scaled, which is what lets one
	// definition serve both a 14rem practice display and a 12px legend.
	const PATHS: Record<Glyph, { d: string; stroke: number; fill: boolean; width: number }> = {
		// A flat: upright stem with a bowl hanging off its foot.
		flat: {
			d: 'M22 8 L22 92 M22 62 C34 48 58 52 58 68 C58 82 40 90 22 92',
			stroke: 10,
			fill: false,
			width: 62
		},
		// A sharp: two uprights crossed by two rising bars.
		sharp: {
			d: 'M26 18 L26 88 M54 12 L54 82 M10 44 L70 34 M10 66 L70 56',
			stroke: 9,
			fill: false,
			width: 80
		},
		doubleFlat: {
			d: 'M14 8 L14 92 M14 62 C24 50 44 54 44 68 C44 80 30 88 14 92 M52 8 L52 92 M52 62 C62 50 82 54 82 68 C82 80 68 88 52 92',
			stroke: 9,
			fill: false,
			width: 96
		},
		doubleSharp: {
			d: 'M16 34 L64 82 M64 34 L16 82',
			stroke: 13,
			fill: false,
			width: 80
		},
		// Major seventh: an open triangle, set to cap height.
		triangle: {
			d: 'M40 22 L72 82 L8 82 Z',
			stroke: 9,
			fill: false,
			width: 80
		},
		// Half diminished: a circle through which a stroke passes.
		halfDim: {
			d: 'M40 30 m -26 0 a 26 26 0 1 0 52 0 a 26 26 0 1 0 -52 0 M6 62 L74 -2',
			stroke: 9,
			fill: false,
			width: 80
		},
		// Diminished: a small ring riding high, like a degree sign.
		dim: {
			d: 'M34 26 m -18 0 a 18 18 0 1 0 36 0 a 18 18 0 1 0 -36 0',
			stroke: 9,
			fill: false,
			width: 68
		},
		plus: {
			d: 'M36 12 L36 66 M9 39 L63 39',
			stroke: 9,
			fill: false,
			width: 72
		}
	};

	const spec = $derived(PATHS[glyph]);
</script>

<svg
	class={className}
	viewBox="0 0 {spec.width} 100"
	width="{(spec.width / 100) * size}em"
	height="{size}em"
	style="vertical-align: baseline; overflow: visible;"
	aria-hidden="true"
	focusable="false"
>
	<path
		d={spec.d}
		fill={spec.fill ? 'currentColor' : 'none'}
		stroke="currentColor"
		stroke-width={spec.stroke}
		stroke-linecap="round"
		stroke-linejoin="round"
	/>
</svg>
