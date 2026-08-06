<script lang="ts">
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { key as makeKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { distinctRings, radialInterval, spoke } from '$lib/wheel/geometry';
	import type { WheelConfig } from '$lib/settings';

	/*
	 * Wheel calibration.
	 *
	 * The physical wheel was built by hand, so the screen has to be made to match
	 * it rather than the other way round. Everything on this page is a live
	 * preview: turn the dials until the two agree, then save.
	 */

	let { data } = $props();

	// A deliberate editable copy: the sliders own this until it is saved, and the
	// page reloads afterwards, so it should not track the server value.
	// svelte-ignore state_referenced_locally
	let config = $state<WheelConfig>({ ...data.settings.wheelConfig });
	let saving = $state(false);
	let saved = $state(false);
	let problem = $state<string | null>(null);

	const C_MAJOR = makeKey('C');
	const NOTES = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

	const distinct = $derived(distinctRings(config));
	const radial = $derived(radialInterval(config));
	const spokeNotes = $derived(
		spoke(0, config).map((pc) => formatNote(spell(pc, C_MAJOR), { unicode: true }))
	);

	const INTERVAL_NAMES: Record<number, string> = {
		0: 'unison',
		1: 'minor 2nd',
		2: 'major 2nd',
		3: 'minor 3rd',
		4: 'major 3rd',
		5: 'perfect 4th',
		6: 'tritone',
		7: 'perfect 5th',
		8: 'minor 6th',
		9: 'major 6th',
		10: 'minor 7th',
		11: 'major 7th'
	};

	/*
	 * How many distinct rings there are fixes what a spoke spells, whichever way
	 * the rings turn: reversing the direction stacks the same chord downward
	 * instead of up, so C–E♭–G♭–A and C–A–F♯–E♭ are both diminished sevenths.
	 */
	const spokeDescription = $derived(
		{
			1: 'a single note repeated',
			2: 'a tritone',
			3: 'an augmented triad',
			4: 'a diminished seventh',
			6: 'a whole-tone scale',
			12: 'the whole chromatic scale'
		}[distinct] ?? `${distinct} notes`
	);

	const dirty = $derived(
		JSON.stringify(config) !== JSON.stringify(data.settings.wheelConfig)
	);

	async function save() {
		saving = true;
		problem = null;
		try {
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ wheelConfig: config })
			});
			if (!response.ok) throw new Error(await response.text());
			saved = true;
			setTimeout(() => (saved = false), 2000);
			// Re-render the rest of the app against the new calibration.
			location.reload();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not save';
		} finally {
			saving = false;
		}
	}

	function reset() {
		config = { ...data.settings.wheelConfig };
	}
</script>

<svelte:head><title>Calibrate · Harmonic Trainer</title></svelte:head>

<main class="mx-auto min-h-dvh max-w-[1300px] px-5 py-6">
	<header class="mb-6 flex items-baseline justify-between">
		<div class="flex items-baseline gap-4">
			<a href="/explore" class="font-display text-ink text-lg font-semibold tracking-tight">
				Harmonic
			</a>
			<span class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">calibrate</span>
		</div>
		<a
			href="/settings/colours"
			class="text-ink-dim hover:text-ink font-mono text-[0.65rem] tracking-widest uppercase transition-colors"
			>colours</a
		>
	</header>

	<div class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
		<section class="flex justify-center">
			<Wheel {config} context={C_MAJOR} active={[]} size={620} />
		</section>

		<aside class="flex flex-col gap-7">
			<p class="text-ink-muted text-sm leading-relaxed">
				Hold your wheel next to the screen and adjust until they agree. Nothing here changes the
				music — only how it is laid out.
			</p>

			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					Note at twelve o’clock
				</h2>
				<div class="grid grid-cols-6 gap-1">
					{#each NOTES as name (name)}
						<button
							class="border-ground-line hover:border-ink-dim font-display rounded border px-1 py-2 text-sm font-semibold transition-colors"
							class:is-selected={config.startNote === name}
							onclick={() => (config = { ...config, startNote: name })}
						>
							{name.replace('b', '♭').replace('#', '♯')}
						</button>
					{/each}
				</div>
			</section>

			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					Which way the rings turn
				</h2>
				<div class="flex gap-1">
					{#each [[1, 'clockwise inward'], [-1, 'anticlockwise inward']] as [value, label] (value)}
						<button
							class="border-ground-line hover:border-ink-dim flex-1 rounded border px-2 py-2 font-mono text-xs transition-colors"
							class:is-selected={config.offsetDirection === value}
							onclick={() => (config = { ...config, offsetDirection: value as 1 | -1 })}
							>{label}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<div class="mb-2 flex items-baseline justify-between">
					<h2 class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
						Rings
					</h2>
					<span class="text-ink-muted font-mono text-xs">{config.rings}</span>
				</div>
				<input
					type="range"
					min="1"
					max="8"
					step="1"
					bind:value={config.rings}
					class="w-full"
					aria-label="Number of rings"
				/>
			</section>

			<section>
				<div class="mb-2 flex items-baseline justify-between">
					<h2 class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
						Offset per ring
					</h2>
					<span class="text-ink-muted font-mono text-xs">
						{config.ringOffsetSteps} fifths · {config.ringOffsetSteps * 30}°
					</span>
				</div>
				<input
					type="range"
					min="0"
					max="11"
					step="1"
					bind:value={config.ringOffsetSteps}
					class="w-full"
					aria-label="Circle-of-fifths steps offset per ring"
				/>
			</section>

			<!-- The consequence of the settings, stated as musical fact. -->
			<section class="border-ground-line bg-ground-raised rounded-lg border p-4">
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					What that gives you
				</h2>
				<dl class="flex flex-col gap-2 font-mono text-xs">
					<div class="flex justify-between gap-4">
						<dt class="text-ink-dim">one ring inward</dt>
						<dd class="text-ink-muted">{INTERVAL_NAMES[radial]} up</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-ink-dim">a radial spoke</dt>
						<dd class="text-ink-muted">{spokeDescription}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-ink-dim">spoke at twelve</dt>
						<dd class="text-ink-muted font-display text-sm">{spokeNotes.join(' ')}</dd>
					</div>
					<div class="flex justify-between gap-4">
						<dt class="text-ink-dim">pattern repeats after</dt>
						<dd class="text-ink-muted">
							{distinct} ring{distinct === 1 ? '' : 's'}
							{#if config.rings > distinct}· ring {distinct + 1} duplicates ring 1{/if}
						</dd>
					</div>
				</dl>
			</section>

			<div class="flex items-center gap-2">
				<button
					class="bg-ink text-ground rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-30"
					disabled={!dirty || saving}
					onclick={save}
				>
					{saving ? 'Saving…' : saved ? 'Saved' : 'Save calibration'}
				</button>
				{#if dirty}
					<button
						class="text-ink-dim hover:text-ink px-3 py-2.5 font-mono text-xs transition-colors"
						onclick={reset}>revert</button
					>
				{/if}
			</div>

			{#if problem}
				<p class="font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
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

	input[type='range'] {
		accent-color: var(--color-ink-muted);
	}
</style>
