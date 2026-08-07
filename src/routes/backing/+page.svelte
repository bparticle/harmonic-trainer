<script lang="ts">
	import { onDestroy } from 'svelte';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import { BackingTrack, type Part } from '$lib/audio/backing';
	import type { Feel } from '$lib/audio/groove';
	import {
		CHARTS,
		CHART_CATEGORIES,
		realiseChart,
		type ChartBar,
		type ChartCategory,
		type ChartSeed
	} from '$lib/curriculum/charts';
	import { closeVoicing, degreeLabels, fitToRange } from '$lib/music/chord';
	import { parseKey } from '$lib/music/key';
	import { formatNote, midi as toMidi, pitchClass } from '$lib/music/note';
	import { midi as session } from '$lib/midi/shared.svelte';
	import { page } from '$app/state';

	/*
	 * Playing along.
	 *
	 * A rhythm section that plays any of the forms in any key at any tempo. It is
	 * generated rather than recorded, which is the only reason "any key" is even
	 * possible — fourteen charts times twelve keys times every tempo is not a set
	 * of files anyone is going to make.
	 *
	 * The chart is not just a list of names to follow. Every bar is tinted by its
	 * root, the same twelve colours used on the wheel and the keyboard, so the
	 * harmonic motion of a form is visible before you have played a note of it —
	 * the fifths cycle sweeps through the whole palette, a modal vamp barely
	 * moves. Whichever bar is selected gets taken apart underneath: symbol,
	 * numeral, degrees, and where it sits under the hands.
	 *
	 * The controls assume both hands are on the keys: space starts and stops, the
	 * sustain pedal does too, and every target is big enough to hit without
	 * looking.
	 */

	let { data, form } = $props();

	const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
	const MIN_BPM = 40;
	const MAX_BPM = 300;
	const PARTS: Array<[Part, string]> = [
		['bass', 'Bass'],
		['drums', 'Drums'],
		['comp', 'Comping'],
		['metronome', 'Click']
	];

	/** The built-ins plus whatever you have typed in. Nothing downstream cares. */
	const repertoire = $derived<ChartSeed[]>([...CHARTS, ...data.mine]);

	// svelte-ignore state_referenced_locally
	let slug = $state(page.url.searchParams.get('chart') ?? CHARTS[0].slug);
	let importing = $state(false);

	const PLACEHOLDER = `| Dm7 | G7 | Cmaj7 | Cmaj7 |
| Am7 D7 | Dm7 G7 | Cmaj7 | Cmaj7 |`;
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
	let level = $state<Record<Part, number>>({ bass: 1, drums: 1, comp: 1, metronome: 1 });

	let playing = $state(false);
	let counting = $state(false);
	/** Bar of the whole form, not of the loop, so the chart highlight is right. */
	let liveBar = $state(0);
	let liveBeat = $state(0);
	/** The bar being examined when nothing is playing. */
	let pinnedBar = $state(1);

	const seed = $derived(repertoire.find((c) => c.slug === slug) ?? CHARTS[0]);
	const mineId = $derived(data.mine.find((c) => c.slug === slug)?.id ?? null);
	const chart = $derived(realiseChart(seed, keyName));
	const bars = $derived(chart.rows.flat());
	const barCount = $derived(bars.length);
	const looping = $derived(loopFrom !== null && loopTo !== null);
	const byCategory = $derived(
		(Object.keys(CHART_CATEGORIES) as ChartCategory[])
			.map((category) => ({
				category,
				label: CHART_CATEGORIES[category],
				items: repertoire.filter((c) => c.category === category)
			}))
			.filter((group) => group.items.length > 0)
	);

	// Keys are held as ASCII so they survive a round trip through anything, and
	// shown with the accidental they are actually written with.
	const keyLabel = (name: string) => name.replace('b', '♭');

	/*
	 * What the panel underneath is describing.
	 *
	 * Follows the music while it plays and stays where you put it when it stops,
	 * which means the same tap that sets a loop point also asks "what is this
	 * chord?" — the two things you want from a bar, without a mode switch.
	 */
	const focusedBar = $derived<ChartBar | null>(
		bars.find((b) => b.number === (playing && liveBar > 0 ? liveBar : pinnedBar)) ?? bars[0] ?? null
	);
	const focused = $derived(focusedBar?.chords[0] ?? null);
	const focusedNotes = $derived(focused ? degreeLabels(focused.chord) : []);
	/*
	 * The diagram shows two octaves from C3 and no more, so the chord is moved
	 * into them rather than allowed to run off the end. Seventy per cent of the
	 * chords in these charts used to fall partly outside it — including the F7 in
	 * a C blues, which was drawn without its seventh.
	 */
	const KEYS_FROM = 48;
	const KEYS_COUNT = 25;
	const focusedVoicing = $derived(
		focused
			? fitToRange(closeVoicing(focused.chord, 4), KEYS_FROM, KEYS_FROM + KEYS_COUNT - 1).map(toMidi)
			: []
	);

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

	function setLevel(part: Part, value: number) {
		level = { ...level, [part]: value };
		track.setLevel(part, value);
	}

	/**
	 * Tap a bar to look at it and to loop it; tap another to stretch the loop out
	 * to it. Tapping the one bar that is already looping clears the loop but
	 * leaves it selected. Drilling two bars is most of what a backing track is
	 * for, so it should not be buried in a menu.
	 */
	function tapBar(number: number) {
		pinnedBar = number;
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
		bpm = repertoire.find((c) => c.slug === next)?.defaultBpm ?? bpm;
		pinnedBar = 1;
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

<main class="mx-auto max-w-[1500px] px-5 py-7">
	<header class="mb-5">
		<h1 class="font-display text-ink flex items-baseline gap-3 text-2xl font-semibold tracking-tight">
			{seed.name}
			{#if seed.published}
				<span class="text-ink-dim font-mono text-xs font-normal">{seed.published}</span>
			{/if}
			<span class="text-ink-dim font-mono text-xs font-normal">
				{barCount} bars · {keyLabel(keyName)}{seed.mode === 'minor' ? ' minor' : ''}
			</span>
		</h1>
		<p class="text-ink-muted mt-1 max-w-3xl text-sm leading-relaxed">{seed.notes}</p>
	</header>

	<div class="grid gap-7 xl:grid-cols-[15rem_1fr_19rem] lg:grid-cols-[1fr_19rem]">
		<!-- The repertoire, as a list. It was a wall of chips, and a wall of chips
		     is not something you read — it is something you give up on. -->
		<aside class="repertoire xl:max-h-[calc(100dvh-8rem)] xl:sticky xl:top-20 xl:overflow-y-auto">
			{#each byCategory as group (group.category)}
				<h2 class="panel-title mt-3 first:mt-0">{group.label}</h2>
				<ul class="mb-1 flex flex-col">
					{#each group.items as option (option.slug)}
						<li>
							<button
								type="button"
								class="entry"
								class:is-on={option.slug === slug}
								onclick={() => chooseChart(option.slug)}
							>
								<span class="entry-name">{option.name}</span>
								<span class="entry-meta">
									{option.grid.flat().length} bars{option.published
										? ` · ${option.published}`
										: ''}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/each}

			<button type="button" class="entry mt-2" onclick={() => (importing = !importing)}>
				<span class="entry-name">+ Add a chart</span>
				<span class="entry-meta">type in what is on the page</span>
			</button>
		</aside>

		<section>
			{#if importing}
				<!-- Typing is fine here: this is setting up, not practising. -->
				<form
					method="POST"
					action="?/create"
					class="border-ground-line bg-ground-raised mb-5 flex flex-col gap-3 rounded-xl border p-4"
				>
					<h2 class="panel-title mb-0">Add a chart</h2>
					<p class="text-ink-dim text-xs leading-relaxed">
						Write the chords out as they are on the page, with a <code>|</code> between bars and
						a line per row. Say which key it is written in and it gets stored as numerals — so
						typing it once gives you all twelve keys.
					</p>

					<div class="flex flex-wrap gap-2">
						<input
							name="name"
							placeholder="Name"
							value={form?.name ?? ''}
							required
							class="field flex-1"
						/>
						<select name="key" class="field w-24">
							{#each KEYS as k (k)}
								<option value={k} selected={k === (form?.key ?? keyName)}>{keyLabel(k)}</option>
							{/each}
						</select>
						<select name="mode" class="field w-28">
							<option value="major">major</option>
							<option value="minor">minor</option>
						</select>
						<input name="bpm" type="number" min="40" max="300" value="140" class="field w-20" />
					</div>

					<textarea
						name="chart"
						rows="6"
						class="field font-mono text-sm"
						placeholder={PLACEHOLDER}
						>{form?.text ?? ''}</textarea
					>

					{#if form?.problems?.length}
						<ul class="flex flex-col gap-0.5">
							{#each form.problems as problem (problem)}
								<li class="font-mono text-xs" style:color="var(--pc-0)">{problem}</li>
							{/each}
						</ul>
					{/if}

					<div class="flex items-center gap-2">
						<button type="submit" class="chip is-on">Save it</button>
						<button type="button" class="chip" onclick={() => (importing = false)}>Cancel</button>
					</div>
				</form>
			{/if}

			<div class="border-ground-line bg-ground-raised rounded-xl border p-3">
				{#each chart.rows as row, r (r)}
					<div class="grid grid-cols-4 gap-2" class:mt-2={r > 0}>
						{#each row as bar (bar.number)}
							{@const pc = pitchClass(bar.chords[0].chord.root)}
							{@const now = playing && liveBar === bar.number}
							<button
								type="button"
								class="bar"
								class:is-now={now}
								class:is-pinned={!playing && pinnedBar === bar.number}
								class:is-dim={!inLoop(bar.number)}
								class:is-loop-start={looping && bar.number === loopFrom}
								class:is-loop-end={looping && bar.number === loopTo}
								style:--tint="var(--pc-{pc})"
								style:--tint-ink="var(--pc-{pc}-ink)"
								onclick={() => tapBar(bar.number)}
								aria-label={`Bar ${bar.number}: ${bar.chords.map((c) => c.symbol).join(', ')}`}
							>
								<span class="bar-head">
									<span class="bar-number">{bar.number}</span>
									<span class="bar-numeral">{bar.chords.map((c) => c.numeral).join(' ')}</span>
								</span>
								<span class="bar-chords">
									{#each bar.chords as entry, i (i)}
										<ChordSymbol chord={entry.chord} size="1.55rem" />
									{/each}
								</span>
							</button>
						{/each}
					</div>
				{/each}
			</div>

			<div class="text-ink-dim mt-2.5 flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
				<span>
					{#if looping}
						Looping bars {loopFrom}–{loopTo}.
						<button type="button" class="underline" onclick={clearLoop}>Whole form</button>
					{:else}
						Tap a bar to look at it and loop it, then another to stretch the loop out.
					{/if}
				</span>
				{#if mineId}
					<form method="POST" action="?/remove" class="ml-auto">
						<button class="hover:text-ink underline transition-colors">delete this chart</button>
						<input type="hidden" name="id" value={mineId} />
					</form>
				{/if}
			</div>

			<button type="button" class="transport mt-5" onclick={toggle}>
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

			<!-- What the chord under the cursor actually is ------------------- -->
			{#if focused && focusedBar}
				<div class="border-ground-line mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 border-t pt-5">
					<div class="flex items-baseline gap-3">
						<span class="text-ink" style:color="var(--pc-{pitchClass(focused.chord.root)})">
							<ChordSymbol chord={focused.chord} size="3rem" />
						</span>
						<div class="flex flex-col">
							<span class="font-mono text-ink-muted text-sm">{focused.numeral}</span>
							<span class="text-ink-dim font-mono text-[0.7rem]">
								bar {focusedBar.number}{focusedBar.chords.length > 1 ? ', first half' : ''}
							</span>
						</div>
					</div>

					<div class="flex gap-2">
						{#each focusedNotes as entry, i (i)}
							{@const pc = pitchClass(entry.note)}
							<div
								class="degree"
								style:background="var(--pc-{pc})"
								style:color="var(--pc-{pc}-ink)"
							>
								<span class="degree-note">{formatNote(entry.note, { unicode: true })}</span>
								<span class="degree-number">{entry.degree}</span>
							</div>
						{/each}
					</div>

					<div class="ml-auto max-w-full overflow-x-auto">
						<Keyboard
							from={KEYS_FROM}
							count={KEYS_COUNT}
							lit={focusedVoicing}
							interactive={false}
							showLabels={false}
						/>
					</div>
				</div>
			{/if}
		</section>

		<aside class="flex flex-col gap-5">
			<div>
				<h2 class="panel-title">Key</h2>
				<div class="grid grid-cols-4 gap-1.5">
					{#each KEYS as k (k)}
						{@const pc = pitchClass(parseKey(k).tonic)}
						<button
							type="button"
							class="chip key-chip justify-center"
							class:is-on={k === keyName}
							style:--tint="var(--pc-{pc})"
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
					class="mt-2.5 w-full"
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
				<h2 class="panel-title">Mix</h2>
				<div class="flex flex-col gap-2">
					{#each PARTS as [part, label] (part)}
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="chip w-[7.5rem] shrink-0"
								class:is-on={!muted[part]}
								onclick={() => setMuted(part, !muted[part])}
								aria-pressed={!muted[part]}
							>
								<span class="dot" class:is-lit={!muted[part]}></span>
								{label}
							</button>
							<input
								type="range"
								min="0"
								max="1"
								step="0.05"
								value={level[part]}
								oninput={(e) => setLevel(part, Number(e.currentTarget.value))}
								class="min-w-0 flex-1"
								disabled={muted[part]}
								aria-label={`${label} level`}
							/>
						</div>
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
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.76rem;
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

	/*
	 * The repertoire list.
	 *
	 * Rows rather than chips. Twenty-odd charts as tags is a wall you skim past;
	 * as a list with the bar count and the year on each one it is something you
	 * can actually read down and choose from.
	 */
	.repertoire {
		scrollbar-width: thin;
	}

	.entry {
		display: flex;
		width: 100%;
		flex-direction: column;
		gap: 0.05rem;
		padding: 0.35rem 0.55rem;
		border-radius: 7px;
		border-left: 2px solid transparent;
		text-align: left;
		transition:
			background 110ms ease,
			border-color 110ms ease;
	}

	.entry:hover {
		background: var(--color-ground-raised);
	}

	.entry.is-on {
		background: var(--color-ground-overlay);
		border-left-color: var(--color-ink);
	}

	.entry-name {
		font-family: var(--font-display);
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--color-ink-muted);
		line-height: 1.2;
	}

	.entry.is-on .entry-name {
		color: var(--color-ink);
	}

	.entry-meta {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--color-ink-dim);
	}

	.field {
		padding: 0.45rem 0.6rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.field:focus {
		outline: none;
		border-color: var(--color-ink-dim);
	}

	code {
		font-family: var(--font-mono);
		color: var(--color-ink-muted);
	}

	/* The key chips carry their own pitch colour, as they do everywhere else. */
	.key-chip.is-on {
		border-color: var(--tint);
		box-shadow: inset 0 -2px 0 var(--tint);
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

	input[type='range']:disabled {
		opacity: 0.35;
	}

	/*
	 * A bar of the chart.
	 *
	 * Tinted by its root, faintly enough that a chord symbol still reads white on
	 * top of it. The colour is doing real work: on the fifths cycle you can see
	 * the whole palette go past, and on a modal vamp you can see that it doesn't.
	 */
	.bar {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.4rem;
		min-height: 5.25rem;
		padding: 0.45rem 0.65rem 0.6rem;
		border-radius: 9px;
		border: 1px solid var(--color-ground-line);
		background: color-mix(in oklab, var(--tint) 14%, var(--color-ground));
		border-left: 3px solid color-mix(in oklab, var(--tint) 55%, var(--color-ground-line));
		color: var(--color-ink);
		text-align: left;
		transition:
			background 90ms linear,
			border-color 90ms linear,
			opacity 160ms ease;
	}

	.bar-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
	}

	.bar-number {
		color: var(--color-ink-dim);
	}

	.bar-numeral {
		color: color-mix(in oklab, var(--tint) 70%, var(--color-ink-muted));
		letter-spacing: 0.02em;
	}

	.bar-chords {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.55rem;
		line-height: 1;
	}

	.bar.is-now {
		background: color-mix(in oklab, var(--tint) 42%, var(--color-ground));
		border-color: var(--tint);
		color: var(--tint-ink);
	}

	.bar.is-pinned {
		border-color: var(--color-ink-dim);
	}

	.bar.is-dim {
		opacity: 0.3;
	}

	.bar.is-loop-start {
		border-left-color: var(--color-ink-muted);
	}

	.bar.is-loop-end {
		border-right: 3px solid var(--color-ink-muted);
	}

	/* One note of the focused chord: what it is called, and what number it is. */
	.degree {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 3rem;
		padding: 0.4rem 0.5rem;
		border-radius: 8px;
		line-height: 1.15;
	}

	.degree-note {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 600;
	}

	.degree-number {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		opacity: 0.8;
	}

	/* One giant target, per the standing rule that hands stay on the keys. */
	.transport {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 1rem 1.3rem;
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
