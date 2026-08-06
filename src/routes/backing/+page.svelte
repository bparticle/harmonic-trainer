<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import { BackingTrack, type Part } from '$lib/audio/backing';
	import type { Feel } from '$lib/audio/groove';
	import { CHARTS, chartBySlug, realiseChart } from '$lib/curriculum/charts';
	import { parseKey } from '$lib/music/key';
	import { midi as session } from '$lib/midi/shared.svelte';

	/*
	 * Playing along.
	 *
	 * A rhythm section that plays any of the forms in any key at any tempo. It is
	 * generated rather than recorded, which is the only reason "any key" is even
	 * possible — twelve keys times five forms times every tempo is not a set of
	 * files anyone is going to make.
	 *
	 * The controls assume both hands are on the keys: space starts and stops, the
	 * sustain pedal does too, and every target is big enough to hit without
	 * looking. Nothing here needs the mouse to be accurate.
	 */

	const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
	const MIN_BPM = 40;
	const MAX_BPM = 300;

	let slug = $state(CHARTS[0].slug);
	let keyName = $state('C');
	let bpm = $state(CHARTS[0].defaultBpm);
	let feel = $state<Feel>('swing');
	let countIn = $state(true);

	let loopFrom = $state<number | null>(null);
	let loopTo = $state<number | null>(null);

	let muted = $state<Record<Part, boolean>>({
		bass: false,
		drums: false,
		comp: true,
		metronome: true
	});

	let playing = $state(false);
	let counting = $state(false);
	/** Bar of the whole form, not of the loop, so the chart highlight is right. */
	let liveBar = $state(0);
	let liveBeat = $state(0);

	const seed = $derived(chartBySlug(slug) ?? CHARTS[0]);
	const chart = $derived(realiseChart(seed, keyName));
	const barCount = $derived(chart.rows.flat().length);
	const looping = $derived(loopFrom !== null && loopTo !== null);
	// Keys are held as ASCII so they survive a round trip through anything, and
	// shown with the accidental they are actually written with.
	const keyLabel = (name: string) => name.replace('b', '♭');

	const track = new BackingTrack();

	/*
	 * The highlight, and only the highlight.
	 *
	 * This arrives on Tone's draw queue, which runs on animation frames — so it
	 * stops entirely while the tab is in the background and catches up on return.
	 * That is right for a highlight and wrong for anything else, which is why
	 * whether we are playing is read from the track instead.
	 */
	track.onBeat = (state) => {
		if (!state.playing) {
			liveBar = 0;
			liveBeat = 0;
			return;
		}
		liveBeat = state.beat;
		liveBar = state.bar === 0 ? 0 : (loopFrom ?? 1) + state.bar - 1;
	};

	track.onStart = () => (counting = false);

	function config() {
		return {
			bars: chart.bars,
			bpm,
			feel,
			key: parseKey(keyName),
			loopFrom: loopFrom ?? undefined,
			loopTo: loopTo ?? undefined,
			beatsPerBar: chart.beatsPerBar,
			countInBars: countIn ? 1 : 0
		};
	}

	async function toggle() {
		if (playing) {
			track.stop();
			playing = false;
			counting = false;
		} else {
			counting = countIn;
			await track.start(config());
			playing = track.playing;
		}
	}

	/** Anything that changes the notes has to be rebuilt; tempo does not. */
	async function restartIfPlaying() {
		if (!playing) return;
		counting = countIn;
		await track.start(config());
	}

	function nudgeTempo(by: number) {
		bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm + by));
		track.setBpm(bpm);
	}

	function setMuted(part: Part, value: boolean) {
		muted = { ...muted, [part]: value };
		track.setMuted(part, value);
	}

	/**
	 * Tap a bar to loop it; tap another to stretch the loop out to it. Tapping
	 * the one bar that is already looping clears it. Drilling two bars is most of
	 * what a backing track is for, so it should not be buried in a menu.
	 */
	function tapBar(number: number) {
		if (loopFrom === number && loopTo === number) {
			loopFrom = null;
			loopTo = null;
		} else if (loopFrom === null || loopTo === null) {
			loopFrom = number;
			loopTo = number;
		} else {
			loopFrom = Math.min(loopFrom, number);
			loopTo = Math.max(loopTo, number);
		}
		void restartIfPlaying();
	}

	function clearLoop() {
		loopFrom = null;
		loopTo = null;
		void restartIfPlaying();
	}

	const inLoop = (number: number) =>
		!looping || (number >= (loopFrom ?? 1) && number <= (loopTo ?? barCount));

	// Changing the chart brings its own tempo with it, since 160 for rhythm
	// changes and 160 for a modal vamp are not the same request.
	function chooseChart(next: string) {
		slug = next;
		bpm = chartBySlug(next)?.defaultBpm ?? bpm;
		clearLoop();
		void restartIfPlaying();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === ' ' && !(event.target instanceof HTMLInputElement)) {
			event.preventDefault();
			void toggle();
		}
	}

	// The pedal is the other hands-free control, exactly as it is on /play.
	$effect(() => {
		session.onPedal((down) => down && void toggle());
		return () => session.onPedal(null);
	});

	onDestroy(() => track.dispose());
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head><title>Play along · Harmonic</title></svelte:head>

<main class="mx-auto max-w-[1500px] px-5 py-8">
	<header class="mb-7">
		<h1 class="font-display text-ink text-2xl font-semibold tracking-tight">Play along</h1>
		<p class="text-ink-muted mt-1 max-w-2xl text-sm">
			{seed.notes}
		</p>
	</header>

	<div class="grid gap-8 lg:grid-cols-[1fr_20rem]">
		<section>
			<div class="mb-4 flex flex-wrap gap-2">
				{#each CHARTS as option (option.slug)}
					<button
						type="button"
						class="chip"
						class:is-on={option.slug === slug}
						onclick={() => chooseChart(option.slug)}>{option.name}</button
					>
				{/each}
			</div>

			<div class="border-ground-line bg-ground-raised rounded-xl border p-4">
				{#each chart.rows as row, r (r)}
					<div class="grid grid-cols-4 gap-2" class:mt-2={r > 0}>
						{#each row as bar (bar.number)}
							<button
								type="button"
								class="bar"
								class:is-now={playing && liveBar === bar.number}
								class:is-dim={!inLoop(bar.number)}
								class:is-loop-start={looping && bar.number === loopFrom}
								class:is-loop-end={looping && bar.number === loopTo}
								onclick={() => tapBar(bar.number)}
								aria-label={`Bar ${bar.number}: ${bar.chords.map((c) => c.symbol).join(', ')}`}
							>
								<span class="bar-number">{bar.number}</span>
								<span class="bar-chords">
									{#each bar.chords as entry, i (i)}
										<ChordSymbol chord={entry.chord} size="1.6rem" />
									{/each}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>

			<p class="text-ink-dim mt-3 font-mono text-xs">
				{#if looping}
					Looping bars {loopFrom}–{loopTo}.
					<button type="button" class="underline" onclick={clearLoop}>Whole form</button>
				{:else}
					Tap a bar to loop it, then another to stretch the loop out.
				{/if}
			</p>

			<button type="button" class="transport mt-6" onclick={toggle}>
				<span class="transport-mark" aria-hidden="true">{playing ? '■' : '▶'}</span>
				<span class="transport-text">
					{#if counting}
						Counting in…
					{:else if playing && liveBar > 0}
						Stop — bar {liveBar}, beat {Math.floor(liveBeat % chart.beatsPerBar) + 1}
					{:else if playing}
						Stop
					{:else}
						Play in {keyLabel(keyName)} at {bpm}
					{/if}
				</span>
				<span class="transport-hint" aria-hidden="true">space, or the sustain pedal</span>
			</button>
		</section>

		<aside class="flex flex-col gap-6">
			<div>
				<h2 class="panel-title">Key</h2>
				<div class="grid grid-cols-4 gap-1.5">
					{#each KEYS as k (k)}
						<button
							type="button"
							class="chip justify-center"
							class:is-on={k === keyName}
							onclick={() => {
								keyName = k;
								void restartIfPlaying();
							}}>{keyLabel(k)}</button
						>
					{/each}
				</div>
			</div>

			<div>
				<h2 class="panel-title">Tempo</h2>
				<div class="flex items-center gap-2">
					<button type="button" class="stepper" onclick={() => nudgeTempo(-5)} aria-label="Slower"
						>−</button
					>
					<span class="font-mono text-ink flex-1 text-center text-3xl tabular-nums">{bpm}</span>
					<button type="button" class="stepper" onclick={() => nudgeTempo(5)} aria-label="Faster"
						>+</button
					>
				</div>
				<input
					type="range"
					min={MIN_BPM}
					max={MAX_BPM}
					step="1"
					bind:value={bpm}
					oninput={() => track.setBpm(bpm)}
					class="mt-3 w-full"
					aria-label="Tempo in beats per minute"
				/>
			</div>

			<div>
				<h2 class="panel-title">Feel</h2>
				<div class="flex gap-1.5">
					{#each ['swing', 'straight'] as const as option (option)}
						<button
							type="button"
							class="chip flex-1 justify-center"
							class:is-on={feel === option}
							onclick={() => {
								feel = option;
								void restartIfPlaying();
							}}>{option}</button
						>
					{/each}
				</div>
			</div>

			<div>
				<h2 class="panel-title">Parts</h2>
				<div class="flex flex-col gap-1.5">
					{#each [['bass', 'Bass'], ['drums', 'Drums'], ['comp', 'Comping'], ['metronome', 'Click']] as const as [part, label] (part)}
						<button
							type="button"
							class="chip"
							class:is-on={!muted[part]}
							onclick={() => setMuted(part, !muted[part])}
							aria-pressed={!muted[part]}
						>
							<span class="dot" class:is-lit={!muted[part]}></span>
							{label}
						</button>
					{/each}
				</div>
				<p class="text-ink-dim mt-2 text-xs leading-snug">
					Comping starts off. Two people voicing the same chord is one too many — turn it on to
					hear the changes, off to be the one playing them.
				</p>
			</div>

			<div>
				<h2 class="panel-title">Count-in</h2>
				<button
					type="button"
					class="chip w-full"
					class:is-on={countIn}
					onclick={() => (countIn = !countIn)}
					aria-pressed={countIn}
				>
					<span class="dot" class:is-lit={countIn}></span>
					One bar of clicks
				</button>
			</div>
		</aside>
	</div>
</main>

<style>
	.panel-title {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--color-ink-dim);
		margin-bottom: 0.5rem;
	}

	.chip {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.8rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		text-align: left;
		transition:
			color 120ms ease,
			border-color 120ms ease,
			background 120ms ease;
	}

	.chip:hover {
		color: var(--color-ink);
		border-color: var(--color-ink-dim);
	}

	.chip.is-on {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-ground-line);
		flex: none;
	}

	.dot.is-lit {
		background: var(--color-ink);
	}

	.stepper {
		width: 3rem;
		height: 3rem;
		border-radius: 10px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink);
		font-size: 1.4rem;
		line-height: 1;
	}

	.stepper:hover {
		background: var(--color-ground-overlay);
	}

	/* A bar of the chart. Big enough to hit while looking at the keys. */
	.bar {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 5.5rem;
		padding: 0.5rem 0.7rem 0.7rem;
		border-radius: 9px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground);
		color: var(--color-ink);
		text-align: left;
		transition:
			background 90ms linear,
			border-color 90ms linear,
			opacity 160ms ease;
	}

	.bar-number {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--color-ink-dim);
	}

	.bar-chords {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
		line-height: 1;
	}

	.bar.is-now {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink);
	}

	.bar.is-dim {
		opacity: 0.32;
	}

	.bar.is-loop-start {
		border-left-width: 3px;
		border-left-color: var(--color-ink-muted);
	}

	.bar.is-loop-end {
		border-right-width: 3px;
		border-right-color: var(--color-ink-muted);
	}

	/* One giant target, per the standing rule that hands stay on the keys. */
	.transport {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 1.1rem 1.4rem;
		border-radius: 12px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink);
	}

	.transport:hover {
		background: var(--color-ground-overlay);
	}

	.transport-mark {
		font-size: 1.5rem;
		line-height: 1;
	}

	.transport-text {
		font-family: var(--font-mono);
		font-size: 1.05rem;
	}

	.transport-hint {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-dim);
	}
</style>
