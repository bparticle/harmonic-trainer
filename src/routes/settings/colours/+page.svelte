<script lang="ts">
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { key as makeKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import {
		clampToGamut,
		contrastRatio,
		contrastSafeInk,
		css,
		isInSrgbGamut,
		oklchToHex,
		type Oklch
	} from '$lib/design/color';
	import {
		DEFAULT_PALETTE,
		GROUND,
		SWATCH_INK_DARK,
		SWATCH_INK_LIGHT,
		derivePalette
	} from '$lib/design/palette';

	/*
	 * Colour editor.
	 *
	 * Authored in OKLCH so the sliders behave: moving lightness does not shift
	 * hue, and moving hue does not shift perceived lightness. The contrast
	 * readout is live because a colour that has drifted out of legibility is not
	 * obvious by eye until it is on a music stand across the room.
	 */

	let { data } = $props();

	// A deliberate editable copy: the sliders own this until it is saved, and the
	// page reloads afterwards, so it should not track the server value.
	// svelte-ignore state_referenced_locally
	let palette = $state<Oklch[]>(data.settings.colorMap.map((c) => ({ ...c })));
	let selected = $state(0);
	let saving = $state(false);
	let problem = $state<string | null>(null);

	const C_MAJOR = makeKey('C');
	const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

	const current = $derived(palette[selected]);
	const inGamut = $derived(isInSrgbGamut(current));
	const inkResult = $derived(contrastSafeInk(current, SWATCH_INK_DARK, SWATCH_INK_LIGHT));
	const groundContrast = $derived(contrastRatio(current, GROUND.base));

	const dirty = $derived(JSON.stringify(palette) !== JSON.stringify(data.settings.colorMap));

	// The live preview writes straight onto the document so the whole page —
	// wheel, swatches, chrome — moves with the sliders.
	$effect(() => {
		for (const [i, colour] of palette.entries()) {
			const { ink } = contrastSafeInk(colour, SWATCH_INK_DARK, SWATCH_INK_LIGHT);
			document.documentElement.style.setProperty(`--pc-${i}`, css(colour));
			document.documentElement.style.setProperty(`--pc-${i}-ink`, css(ink));
		}
	});

	function update(patch: Partial<Oklch>) {
		const next = clampToGamut({ ...palette[selected], ...patch });
		palette[selected] = next;
	}

	function resetToDefaults() {
		palette = derivePalette().map((c) => ({ ...c }));
	}

	function revert() {
		palette = data.settings.colorMap.map((c) => ({ ...c }));
	}

	async function save() {
		saving = true;
		problem = null;
		try {
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ colorMap: palette })
			});
			if (!response.ok) throw new Error(await response.text());
			location.reload();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not save';
			saving = false;
		}
	}

	const noteName = (pc: number) => formatNote(spell(pc, C_MAJOR), { unicode: true });
</script>

<svelte:head><title>Colours · Harmonic Trainer</title></svelte:head>

<main class="mx-auto min-h-dvh max-w-[1300px] px-5 py-6">
	<header class="mb-6 flex items-baseline gap-4">
		<h1 class="font-display text-ink text-lg font-semibold tracking-tight">Pitch colours</h1>
		<a
			href="/settings/wheel"
			class="text-ink-muted hover:text-ink font-mono text-xs transition-colors">calibrate →</a
		>
	</header>

	<div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
		<section class="flex flex-col items-center gap-6">
			<Wheel config={data.settings.wheelConfig} active={[...Array(12).keys()]} size={560} />

			<div class="grid w-full max-w-xl grid-cols-12 gap-1">
				{#each palette as colour, pc (pc)}
					<button
						class="flex aspect-square flex-col items-center justify-center rounded transition-transform"
						class:is-selected={selected === pc}
						style="background: var(--pc-{pc}); color: var(--pc-{pc}-ink)"
						onclick={() => (selected = pc)}
						aria-label="Edit {NAMES[pc]}"
					>
						<span class="font-display text-xs font-semibold">{NAMES[pc]}</span>
					</button>
				{/each}
			</div>
		</section>

		<aside class="flex flex-col gap-7">
			<p class="text-ink-muted text-sm leading-relaxed">
				Match these to your painted wheel and your Keystep. Lightness, chroma and hue move
				independently — nudging one will not drag the others.
			</p>

			<section>
				<div class="mb-3 flex items-baseline justify-between">
					<h2 class="font-display text-2xl font-semibold">{noteName(selected)}</h2>
					<span class="text-ink-dim font-mono text-xs">{oklchToHex(current)}</span>
				</div>

				<div class="flex flex-col gap-4">
					<label class="block">
						<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
							<span>lightness</span><span>{current.l.toFixed(3)}</span>
						</span>
						<input
							type="range"
							min="0.2"
							max="0.98"
							step="0.005"
							value={current.l}
							oninput={(e) => update({ l: Number(e.currentTarget.value) })}
							class="w-full"
						/>
					</label>

					<label class="block">
						<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
							<span>chroma</span><span>{current.c.toFixed(3)}</span>
						</span>
						<input
							type="range"
							min="0"
							max="0.32"
							step="0.002"
							value={current.c}
							oninput={(e) => update({ c: Number(e.currentTarget.value) })}
							class="w-full"
						/>
					</label>

					<label class="block">
						<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
							<span>hue</span><span>{Math.round(current.h)}°</span>
						</span>
						<input
							type="range"
							min="0"
							max="360"
							step="1"
							value={current.h}
							oninput={(e) => update({ h: Number(e.currentTarget.value) })}
							class="w-full"
						/>
					</label>
				</div>
			</section>

			<section class="border-ground-line bg-ground-raised rounded-lg border p-4">
				<h2 class="text-ink-dim mb-3 font-mono text-[0.65rem] tracking-widest uppercase">
					Legibility
				</h2>
				<div
					class="mb-3 flex items-center justify-center rounded py-4"
					style="background: var(--pc-{selected}); color: var(--pc-{selected}-ink)"
				>
					<span class="font-display text-2xl font-semibold">{noteName(selected)}∆</span>
				</div>
				<dl class="flex flex-col gap-1.5 font-mono text-xs">
					<div class="flex justify-between">
						<dt class="text-ink-dim">text on this swatch</dt>
						<dd class:is-poor={inkResult.ratio < 4.5} class="text-ink-muted">
							{inkResult.ratio.toFixed(1)}:1
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-ink-dim">swatch on the ground</dt>
						<dd class:is-poor={groundContrast < 3} class="text-ink-muted">
							{groundContrast.toFixed(1)}:1
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-ink-dim">inside sRGB</dt>
						<dd class:is-poor={!inGamut} class="text-ink-muted">{inGamut ? 'yes' : 'clipped'}</dd>
					</div>
				</dl>
				{#if inkResult.ratio < 4.5}
					<p class="text-ink-dim mt-3 text-[0.7rem] leading-relaxed">
						Below 4.5:1, a chord symbol sitting on this colour will be hard to read across a room.
						Push the lightness further from the middle.
					</p>
				{/if}
			</section>

			<div class="flex flex-wrap items-center gap-2">
				<button
					class="bg-ink text-ground rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-30"
					disabled={!dirty || saving}
					onclick={save}
				>
					{saving ? 'Saving…' : 'Save palette'}
				</button>
				{#if dirty}
					<button
						class="text-ink-dim hover:text-ink px-3 py-2.5 font-mono text-xs transition-colors"
						onclick={revert}>revert</button
					>
				{/if}
				<button
					class="text-ink-dim hover:text-ink ml-auto px-3 py-2.5 font-mono text-xs transition-colors"
					onclick={resetToDefaults}>reset to defaults</button
				>
			</div>

			{#if problem}
				<p class="font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
			{/if}
		</aside>
	</div>
</main>

<style>
	.is-selected {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}

	.is-poor {
		color: var(--pc-0);
	}

	input[type='range'] {
		accent-color: var(--color-ink-muted);
	}
</style>
