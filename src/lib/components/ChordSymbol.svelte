<script lang="ts">
	import type { AbstractChord } from '$lib/music/chord';
	import { chordSymbolLabel, chordSymbolParts, type SymbolPart } from '$lib/music/symbol';
	import Glyph from './Glyph.svelte';

	/*
	 * A chord symbol, set properly.
	 *
	 * Accidentals and quality marks come from Glyph.svelte as vectors; extensions
	 * and alterations are raised and set smaller, the way a chart writes them.
	 * The whole thing carries a spoken label so a screen reader says "E flat
	 * minor seven" rather than spelling out punctuation.
	 */

	let {
		chord,
		size = 'inherit',
		class: className = ''
	}: {
		chord: AbstractChord;
		/** Any CSS font-size. The glyphs scale with it. */
		size?: string;
		class?: string;
	} = $props();

	const parts = $derived(chordSymbolParts(chord));
	const label = $derived(chordSymbolLabel(chord));
</script>

{#snippet renderParts(list: SymbolPart[], scale: number)}
	{#each list as part, i (i)}
		{#if part.kind === 'text'}<span>{part.value}</span>
		{:else if part.kind === 'glyph'}<Glyph
				glyph={part.value}
				size={scale * 0.72}
				class="chord-glyph"
			/>
		{:else if part.kind === 'slash'}<span class="chord-slash">/</span>
		{:else if part.kind === 'super'}<sup class="chord-super"
				>{@render renderParts(part.parts, scale * 0.62)}</sup
			>
		{/if}
	{/each}
{/snippet}

<!--
	The visual symbol is hidden from assistive tech and a spoken form supplied
	alongside it. `aria-label` on a span is not reliably announced, and there is
	no ARIA role for "this is a word made of vectors".
-->
<span
	class="chord-symbol no-select {className}"
	style:font-size={size === 'inherit' ? undefined : size}
>
	<span class="sr-only">{label}</span>
	<span class="chord-visual" aria-hidden="true">{@render renderParts(parts, 1)}</span>
</span>

<style>
	.chord-symbol,
	.chord-visual {
		display: inline-flex;
		align-items: baseline;
		font-family: var(--font-display);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1;
		white-space: nowrap;
	}

	/* Accidentals want a hair of air after them, none before. */
	.chord-symbol :global(.chord-glyph) {
		margin-left: 0.06em;
		margin-right: 0.02em;
		align-self: baseline;
	}

	.chord-super {
		font-size: 0.62em;
		/* `sup` is aligned by the browser against the parent's baseline, which
		   drifts once the parent is a flex container; position it explicitly. */
		vertical-align: baseline;
		position: relative;
		top: -0.42em;
		display: inline-flex;
		align-items: baseline;
		letter-spacing: 0;
	}

	.chord-slash {
		margin: 0 0.06em;
		font-weight: 400;
		opacity: 0.6;
	}
</style>
