<script lang="ts">
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { formatKey, key as makeKey, type Mode } from '$lib/music/key';
	import { formatNote, pitchClass } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { chordPitchClasses, type AbstractChord } from '$lib/music/chord';
	import {
		brightnessAxis,
		chordCells,
		keyOverlay,
		modulationOverlay,
		neighbourOverlays,
		outerPosition
	} from '$lib/wheel/overlays';
	import type { Highlight, WheelGeometry } from '$lib/wheel/geometry';

	let { data } = $props();

	const GEOMETRY: WheelGeometry = { outerRadius: 330, ringWidth: 52 };
	const config = $derived(data.settings.wheelConfig);

	const TONICS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
	const PITCH_CLASSES = Array.from({ length: 12 }, (_, pc) => pc);

	type OverlayMode = 'key' | 'chord' | 'brightness' | 'modulation';

	let tonic = $state(0);
	let mode = $state<Mode>('ionian');
	let overlay = $state<OverlayMode>('key');
	let selectedChordIndex = $state(0);
	let exploredChord = $state<AbstractChord | null>(null);
	let maxChanged = $state(1);
	let targetTonic = $state(7);
	let targetMode = $state<Mode>('ionian');
	let litPitchClasses = $state<number[]>([]);

	// Tonics are chosen as pitch classes but must be *spelled* before they become
	// a key, or Eb major would arrive as D# major and drag the wrong scale with it.
	const C_MAJOR = makeKey('C');
	const currentKey = $derived(makeKey(spell(tonic, C_MAJOR), mode));
	const targetKey = $derived(makeKey(spell(targetTonic, C_MAJOR), targetMode));

	const keyView = $derived(keyOverlay(currentKey, config, GEOMETRY));
	const selectedChord = $derived<AbstractChord>(
		exploredChord ?? keyView.chords[selectedChordIndex]?.chord ?? keyView.chords[0].chord
	);
	const neighbourList = $derived(
		overlay === 'chord'
			? neighbourOverlays(selectedChord, currentKey, config, GEOMETRY, maxChanged)
			: []
	);
	const brightness = $derived(brightnessAxis(currentKey, config));
	const modulation = $derived(modulationOverlay(currentKey, targetKey, config, GEOMETRY));

	let hoveredNeighbour = $state<number | null>(null);

	const highlights = $derived.by((): Highlight[] => {
		if (overlay === 'key') {
			return [{ cells: keyView.scaleCells, strength: 1, outline: true }];
		}
		if (overlay === 'chord') {
			const base: Highlight[] = [
				{ cells: chordCells(selectedChord, config, GEOMETRY), strength: 1 }
			];
			if (hoveredNeighbour !== null && neighbourList[hoveredNeighbour]) {
				base.push({ cells: neighbourList[hoveredNeighbour].cells, strength: 0.55 });
			}
			return base;
		}
		if (overlay === 'brightness') {
			return [{ cells: keyView.scaleCells, strength: 1, outline: true }];
		}
		return [
			{ cells: keyView.scaleCells, strength: 0.7, outline: true },
			{ cells: modulation.sharedCells, strength: 1, outline: false }
		];
	});

	const activePitchClasses = $derived.by(() => {
		if (overlay === 'chord') return chordPitchClasses(selectedChord);
		if (overlay === 'modulation') return modulation.sharedPitchClasses;
		return keyView.pitchClasses;
	});

	/**
	 * What to write on the lit cells.
	 *
	 * In chord mode the useful label is the chord tone — root, 3rd, 5th, 7th —
	 * because that is what makes one voicing comparable to another. Everywhere
	 * else it is the scale degree.
	 */
	const CHORD_TONES = ['R', '3', '5', '7', '9', '11', '13'];

	const wheelDegrees = $derived.by(() => {
		if (overlay === 'chord') {
			return new Map(
				chordPitchClasses(selectedChord).map((pc, i) => [pc, CHORD_TONES[i] ?? String(i)])
			);
		}
		if (overlay === 'modulation') return undefined;
		return keyView.degrees;
	});

	const arcs = $derived.by(() => {
		if (overlay === 'modulation') {
			return [
				{
					from: outerPosition(pitchClass(currentKey.tonic), config),
					to: outerPosition(pitchClass(targetKey.tonic), config),
					ring: 0
				}
			];
		}
		if (overlay === 'brightness') {
			const block = brightness.find((b) => b.current)?.block;
			return block ? [{ from: block.start, to: block.end, ring: 0 }] : [];
		}
		return [];
	});

	const noteName = (pc: number) => formatNote(spell(pc, currentKey), { unicode: true });
</script>

<svelte:head><title>Explore · Harmonic Trainer</title></svelte:head>

<main class="mx-auto min-h-dvh max-w-[1500px] px-5 py-6">
	<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
		<!-- The wheel is the hero. -->
		<section class="flex flex-col items-center gap-5">
			<Wheel
				{config}
				active={activePitchClasses}
				degrees={wheelDegrees}
				{highlights}
				{arcs}
				lit={litPitchClasses}
				size={660}
				onselect={(_cell, pc) =>
					(litPitchClasses = litPitchClasses.includes(pc)
						? litPitchClasses.filter((p) => p !== pc)
						: [...litPitchClasses, pc])}
			/>
			<div
				class="grid w-full max-w-lg grid-cols-6 gap-1 sm:grid-cols-12"
				aria-label="Light notes on the wheel"
			>
				{#each PITCH_CLASSES as pc (pc)}
					<button
						type="button"
						class="border-ground-line min-h-11 rounded-md border font-display text-sm font-semibold"
						class:is-selected={litPitchClasses.includes(pc)}
						style:background={litPitchClasses.includes(pc) ? `var(--pc-${pc})` : undefined}
						style:color={litPitchClasses.includes(pc) ? `var(--pc-${pc}-ink)` : undefined}
						aria-pressed={litPitchClasses.includes(pc)}
						onclick={() =>
							(litPitchClasses = litPitchClasses.includes(pc)
								? litPitchClasses.filter((p) => p !== pc)
								: [...litPitchClasses, pc])}>{noteName(pc)}</button
					>
				{/each}
			</div>
			<p class="text-ink-dim max-w-lg text-center font-mono text-xs leading-relaxed">
				Drag to turn. Every ring inward is a minor third, so a spoke spells a diminished seventh and
				the fifth ring repeats the first. Click a cell to light it.
				{#if litPitchClasses.length}
					<button
						class="text-ink-muted hover:text-ink ml-2 underline underline-offset-2"
						onclick={() => (litPitchClasses = [])}>clear</button
					>
				{/if}
			</p>
		</section>

		<!-- Explore mode: dense, information-rich, for sitting and studying. -->
		<aside class="flex flex-col gap-6">
			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">Key</h2>
				<div class="grid grid-cols-6 gap-1">
					{#each TONICS as pc (pc)}
						<button
							class="border-ground-line hover:border-ink-dim rounded border px-1 py-2 font-display text-sm font-semibold transition-colors"
							class:is-selected={tonic === pc}
							style:--swatch="var(--pc-{pc})"
							onclick={() => (tonic = pc)}>{noteName(pc)}</button
						>
					{/each}
				</div>
				<div class="mt-2 flex gap-1">
					{#each [['ionian', 'major'], ['aeolian', 'minor']] as [value, label] (value)}
						<button
							class="border-ground-line hover:border-ink-dim flex-1 rounded border px-2 py-1.5 font-mono text-xs transition-colors"
							class:is-selected={mode === value}
							onclick={() => (mode = value as Mode)}>{label}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					Overlay
				</h2>
				<div class="grid grid-cols-2 gap-1">
					{#each [['key', 'key + chords'], ['chord', 'chord + neighbours'], ['brightness', 'brightness'], ['modulation', 'modulation']] as [value, label] (value)}
						<button
							class="border-ground-line hover:border-ink-dim rounded border px-2 py-1.5 font-mono text-xs transition-colors"
							class:is-selected={overlay === value}
							onclick={() => (overlay = value as OverlayMode)}>{label}</button
						>
					{/each}
				</div>
			</section>

			{#if overlay === 'key' || overlay === 'chord'}
				<section>
					<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
						Diatonic sevenths in {formatKey(currentKey, true)}
					</h2>
					<ul class="flex flex-col gap-0.5">
						{#each keyView.chords as entry, i (entry.symbol)}
							<li>
								<button
									class="border-ground-line/0 hover:bg-ground-raised flex w-full items-baseline justify-between rounded border px-2 py-1.5 text-left transition-colors"
									class:is-selected={overlay === 'chord' &&
										exploredChord === null &&
										selectedChordIndex === i}
									onclick={() => {
										selectedChordIndex = i;
										exploredChord = null;
										overlay = 'chord';
									}}
								>
									<ChordSymbol chord={entry.chord} size="1.15rem" />
									<span class="text-ink-dim font-mono text-xs">{entry.roman}</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if overlay === 'chord'}
				<section>
					<div class="mb-2 flex items-baseline justify-between">
						<h2 class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
							Neighbours
						</h2>
						<div class="flex gap-1">
							{#each [1, 2] as n (n)}
								<button
									class="border-ground-line hover:border-ink-dim rounded border px-2 py-0.5 font-mono text-[0.65rem] transition-colors"
									class:is-selected={maxChanged === n}
									onclick={() => (maxChanged = n)}>{n} note{n > 1 ? 's' : ''}</button
								>
							{/each}
						</div>
					</div>
					<p class="text-ink-dim mb-2 font-mono text-[0.7rem] leading-relaxed">
						Reachable from <ChordSymbol chord={selectedChord} size="0.8rem" /> by changing at most
						{maxChanged} note{maxChanged > 1 ? 's' : ''}, nearest voice leading first.
					</p>
					<ul class="flex max-h-72 flex-col gap-0.5 overflow-y-auto pr-1">
						{#each neighbourList as neighbour, i (neighbour.symbol)}
							<li>
								<button
									class="hover:bg-ground-raised flex w-full items-baseline justify-between gap-2 rounded px-2 py-1 text-left transition-colors"
									onclick={() => {
										exploredChord = neighbour.chord;
										hoveredNeighbour = null;
									}}
									onmouseenter={() => (hoveredNeighbour = i)}
									onmouseleave={() => (hoveredNeighbour = null)}
									onfocus={() => (hoveredNeighbour = i)}
									onblur={() => (hoveredNeighbour = null)}
								>
									<ChordSymbol chord={neighbour.chord} size="1rem" />
									<span class="text-ink-dim font-mono text-[0.7rem] whitespace-nowrap">
										{neighbour.changed} note · {neighbour.distance} semitone{neighbour.distance ===
										1
											? ''
											: 's'}
									</span>
								</button>
							</li>
						{:else}
							<li class="text-ink-dim font-mono text-xs">Nothing that close.</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if overlay === 'brightness'}
				<section>
					<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
						Brightness
					</h2>
					<p class="text-ink-dim mb-3 font-mono text-[0.7rem] leading-relaxed">
						Each step down flattens exactly one more degree, and slides the seven-note block one
						place anticlockwise.
					</p>
					<ul class="flex flex-col gap-0.5">
						{#each brightness as step (step.mode)}
							<li>
								<button
									class="hover:bg-ground-raised flex w-full items-baseline justify-between rounded px-2 py-1.5 text-left transition-colors"
									class:is-selected={step.current}
									onclick={() => (mode = step.mode)}
								>
									<span class="font-display text-sm capitalize">{step.mode}</span>
									<span class="text-ink-dim font-mono text-[0.7rem]">
										{step.rank === 0 ? 'brightest' : step.rank === 6 ? 'darkest' : `−${step.rank}`}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if overlay === 'modulation'}
				<section>
					<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
						Modulate to
					</h2>
					<div class="grid grid-cols-6 gap-1">
						{#each TONICS as pc (pc)}
							<button
								class="border-ground-line hover:border-ink-dim rounded border px-1 py-2 font-display text-sm font-semibold transition-colors"
								class:is-selected={targetTonic === pc}
								onclick={() => (targetTonic = pc)}>{noteName(pc)}</button
							>
						{/each}
					</div>
					<div class="mt-2 flex gap-1">
						{#each [['ionian', 'major'], ['aeolian', 'minor']] as [value, label] (value)}
							<button
								class="border-ground-line hover:border-ink-dim flex-1 rounded border px-2 py-1.5 font-mono text-xs transition-colors"
								class:is-selected={targetMode === value}
								onclick={() => (targetMode = value as Mode)}>{label}</button
							>
						{/each}
					</div>

					<p class="text-ink-muted mt-4 text-sm leading-relaxed">{modulation.summary}</p>

					<div class="mt-4">
						<h3 class="text-ink-dim mb-1 font-mono text-[0.65rem] tracking-widest uppercase">
							Shared notes
						</h3>
						<div class="flex flex-wrap gap-1">
							{#each modulation.sharedPitchClasses as pc (pc)}
								<span
									class="rounded px-2 py-0.5 font-display text-sm font-semibold"
									style="background: var(--pc-{pc}); color: var(--pc-{pc}-ink)">{noteName(pc)}</span
								>
							{/each}
						</div>
					</div>

					{#if modulation.pivots.length}
						<div class="mt-4">
							<h3 class="text-ink-dim mb-1 font-mono text-[0.65rem] tracking-widest uppercase">
								Pivot chords
							</h3>
							<ul class="flex flex-col gap-0.5">
								{#each modulation.pivots as pivot (pivot.symbol)}
									<li class="flex items-baseline justify-between px-2 py-1 font-mono text-xs">
										<span class="text-ink-muted font-display text-sm">{pivot.symbol}</span>
										<span class="text-ink-dim">{pivot.romanInFrom} → {pivot.romanInTo}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/if}
		</aside>
	</div>
</main>

<style>
	.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}
</style>
