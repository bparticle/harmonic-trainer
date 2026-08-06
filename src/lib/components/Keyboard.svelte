<script lang="ts">
	/*
	 * On-screen keyboard.
	 *
	 * Two jobs: showing what is being played, and standing in for a piano when
	 * there is no Web MIDI — which is every browser on an iPad, and Safari
	 * everywhere. It emits the same note-on and note-off events the hardware
	 * does, so nothing downstream can tell the difference.
	 *
	 * Coloured by pitch class, like everything else, so a chord shape reads the
	 * same here as it does on the wheel.
	 */

	let {
		/** Lowest MIDI note shown. C2 = 36. */
		from = 36,
		/** Number of keys. The Keystep's 32 by default. */
		count = 32,
		/** Notes currently sounding. */
		lit = [],
		interactive = true,
		showLabels = true,
		onnoteon,
		onnoteoff
	}: {
		from?: number;
		count?: number;
		lit?: number[];
		interactive?: boolean;
		showLabels?: boolean;
		onnoteon?: (note: number) => void;
		onnoteoff?: (note: number) => void;
	} = $props();

	const BLACK = new Set([1, 3, 6, 8, 10]);
	const WHITE_WIDTH = 40;
	const BLACK_WIDTH = 24;
	const WHITE_HEIGHT = 190;
	const BLACK_HEIGHT = 118;

	const litSet = $derived(new Set(lit));
	let pressed = $state<Set<number>>(new Set());

	type KeyInfo = { note: number; pc: number; black: boolean; x: number };

	const keys = $derived.by(() => {
		const out: KeyInfo[] = [];
		let x = 0;
		for (let i = 0; i < count; i++) {
			const note = from + i;
			const pc = ((note % 12) + 12) % 12;
			const black = BLACK.has(pc);
			if (black) {
				// Black keys straddle the gap between the two white keys either side.
				out.push({ note, pc, black, x: x - BLACK_WIDTH / 2 });
			} else {
				out.push({ note, pc, black, x });
				x += WHITE_WIDTH;
			}
		}
		return out;
	});

	const width = $derived(keys.filter((k) => !k.black).length * WHITE_WIDTH);
	const whites = $derived(keys.filter((k) => !k.black));
	const blacks = $derived(keys.filter((k) => k.black));

	const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
	const labelFor = (note: number) =>
		`${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;

	function press(note: number) {
		if (!interactive || pressed.has(note)) return;
		pressed = new Set(pressed).add(note);
		onnoteon?.(note);
	}

	function release(note: number) {
		if (!pressed.has(note)) return;
		const next = new Set(pressed);
		next.delete(note);
		pressed = next;
		onnoteoff?.(note);
	}

	function releaseAll() {
		for (const note of pressed) onnoteoff?.(note);
		pressed = new Set();
	}
</script>

<svelte:window onpointerup={releaseAll} onblur={releaseAll} />

<svg
	class="keyboard no-select"
	viewBox="0 0 {width} {WHITE_HEIGHT}"
	role="group"
	aria-label="On-screen keyboard"
>
	{#each whites as key (key.note)}
		{@const isLit = litSet.has(key.note) || pressed.has(key.note)}
		<g>
			<rect
				x={key.x + 1}
				y="0"
				width={WHITE_WIDTH - 2}
				height={WHITE_HEIGHT}
				rx="4"
				class="key key-white"
				class:is-lit={isLit}
				fill={isLit ? `var(--pc-${key.pc})` : 'var(--color-ink-muted)'}
				onpointerdown={() => press(key.note)}
				onpointerenter={(e) => e.buttons === 1 && press(key.note)}
				onpointerup={() => release(key.note)}
				onpointerleave={() => release(key.note)}
				role="button"
				tabindex="-1"
				aria-label={labelFor(key.note)}
			/>
			{#if showLabels && key.pc === 0}
				<text
					x={key.x + WHITE_WIDTH / 2}
					y={WHITE_HEIGHT - 12}
					class="key-label"
					fill={isLit ? `var(--pc-${key.pc}-ink)` : 'var(--color-ground)'}
					text-anchor="middle">{labelFor(key.note)}</text
				>
			{/if}
		</g>
	{/each}

	{#each blacks as key (key.note)}
		{@const isLit = litSet.has(key.note) || pressed.has(key.note)}
		<rect
			x={key.x}
			y="0"
			width={BLACK_WIDTH}
			height={BLACK_HEIGHT}
			rx="3"
			class="key key-black"
			class:is-lit={isLit}
			fill={isLit ? `var(--pc-${key.pc})` : 'var(--color-ground)'}
			onpointerdown={() => press(key.note)}
			onpointerenter={(e) => e.buttons === 1 && press(key.note)}
			onpointerup={() => release(key.note)}
			onpointerleave={() => release(key.note)}
			role="button"
			tabindex="-1"
			aria-label={labelFor(key.note)}
		/>
	{/each}
</svg>

<style>
	.keyboard {
		display: block;
		width: 100%;
		height: auto;
		touch-action: none;
	}

	.key {
		transition: fill 90ms linear;
	}

	.key-white {
		stroke: var(--color-ground);
		stroke-width: 1;
	}

	.key-black {
		stroke: var(--color-ground-line);
		stroke-width: 1;
	}

	.key-label {
		font-family: var(--font-mono);
		font-size: 11px;
		pointer-events: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.key {
			transition: none;
		}
	}
</style>
