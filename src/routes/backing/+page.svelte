<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
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
	import { key as makeKey, parseKey } from '$lib/music/key';
	import {
		formatRoman,
		formatStudyKey,
		studyProgression,
		type HarmonicStudy
	} from '$lib/music/study';
	import { formatNote, midi as toMidi, pitchClass } from '$lib/music/note';
	import { midi as session } from '$lib/midi/shared.svelte';
	import {
		accuracy,
		add as addAttempt,
		coverage,
		emptyTally,
		judge,
		targetFor,
		type Tally,
		type Target
	} from '$lib/practice/match';
	import { target as sharedTarget } from '$lib/practice/target.svelte';
	import { page } from '$app/state';
	import { shouldHandleSpace } from '$lib/shortcuts';

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
	// svelte-ignore state_referenced_locally
	const initialRepertoire: ChartSeed[] = [...CHARTS, ...data.mine];
	const requestedSlug = page.url.searchParams.get('chart');
	const initialSeed = initialRepertoire.find((chart) => chart.slug === requestedSlug) ?? CHARTS[0];
	const repertoire = $derived<ChartSeed[]>([...CHARTS, ...data.mine]);

	// svelte-ignore state_referenced_locally
	let slug = $state(initialSeed.slug);
	// svelte-ignore state_referenced_locally
	let importing = $state(Boolean(form));
	let confirmingDelete = $state(false);

	const PLACEHOLDER = `| Dm7 | G7 | Cmaj7 | Cmaj7 |
| Am7 D7 | Dm7 G7 | Cmaj7 | Cmaj7 |`;
	let keyName = $state('C');
	let bpm = $state(initialSeed.defaultBpm);
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
	let paused = $state(false);
	let counting = $state(false);
	/** Bar of the whole form, not of the loop, so the chart highlight is right. */
	let liveBar = $state(0);
	let liveBeat = $state(0);
	/** The bar being examined when nothing is playing — including the one paused on. */
	let pinnedBar = $state(1);
	/** The exact half-bar chord being studied. */
	let pinnedChord = $state(0);
	/** Playback normally leads the inspector; selecting a chord pins it instead. */
	let followPlayback = $state(true);

	/*
	 * The chart list, collapsible.
	 *
	 * Persisted, because the point of collapsing it is to stop it competing for
	 * attention during a practice sitting — it should stay out of the way across
	 * a reload too, not spring back the moment the page is refreshed.
	 */
	const SIDEBAR_KEY = 'backing:sidebar-collapsed';
	let sidebarCollapsed = $state(false);
	let sidebarReady = $state(false);
	onMount(() => {
		const saved = localStorage.getItem(SIDEBAR_KEY);
		sidebarCollapsed = saved ? saved === 'yes' : matchMedia('(max-width: 1023px)').matches;
		sidebarReady = true;
	});
	$effect(() => {
		if (sidebarReady) localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? 'yes' : 'no');
	});

	const seed = $derived(repertoire.find((c) => c.slug === slug) ?? CHARTS[0]);
	const mineId = $derived(data.mine.find((c) => c.slug === slug)?.id ?? null);
	const chart = $derived(realiseChart(seed, keyName));
	const bars = $derived(chart.rows.flat());
	const homeKey = $derived(makeKey(keyName, seed.mode === 'minor' ? 'aeolian' : 'ionian'));
	const studies = $derived(
		studyProgression(
			bars.flatMap((bar) => bar.chords.map((entry) => entry.chord)),
			homeKey
		)
	);
	const studyByBar = $derived.by((): HarmonicStudy[][] => {
		let cursor = 0;
		return bars.map((bar) => bar.chords.map(() => studies[cursor++]));
	});
	const studyAt = (barNumber: number, chordIndex: number) =>
		studyByBar[barNumber - 1]?.[chordIndex] ?? null;
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
	function chordIndexAtBeat(bar: ChartBar, beat: number): number {
		const beatInBar = ((beat % chart.beatsPerBar) + chart.beatsPerBar) % chart.beatsPerBar;
		let edge = 0;
		for (let index = 0; index < bar.chords.length; index++) {
			edge += bar.chords[index].beats;
			if (beatInBar < edge) return index;
		}
		return Math.max(0, bar.chords.length - 1);
	}

	const followingPlayback = $derived(playing && followPlayback && liveBar > 0);
	const focusedBar = $derived<ChartBar | null>(
		bars.find((bar) => bar.number === (followingPlayback ? liveBar : pinnedBar)) ?? bars[0] ?? null
	);
	const focusedChordIndex = $derived(
		focusedBar
			? followingPlayback
				? chordIndexAtBeat(focusedBar, liveBeat)
				: Math.min(pinnedChord, focusedBar.chords.length - 1)
			: 0
	);
	const focused = $derived(focusedBar?.chords[focusedChordIndex] ?? null);
	const focusedStudy = $derived(focusedBar ? studyAt(focusedBar.number, focusedChordIndex) : null);
	const focusedNotes = $derived(focused ? degreeLabels(focused.chord) : []);
	const otherContexts = $derived(
		focusedStudy?.compatibleKeys.filter(
			(context) =>
				pitchClass(context.key.tonic) !== pitchClass(focusedStudy.key.tonic) ||
				context.key.mode !== focusedStudy.key.mode
		) ?? []
	);
	const focusedExplanation = $derived(
		focusedStudy
			? focusedStudy.explanation.replace(focusedStudy.roman, formatRoman(focusedStudy.roman))
			: ''
	);
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
			? fitToRange(closeVoicing(focused.chord, 4), KEYS_FROM, KEYS_FROM + KEYS_COUNT - 1).map(
					toMidi
				)
			: []
	);

	const track = new BackingTrack();

	/*
	 * Am I playing the chord that is sounding?
	 *
	 * The question was already being answered by eye — comparing the note
	 * colours in the header against the chord colours on the chart — which is
	 * the app handing back a job it is better placed to do than you are while
	 * both hands are busy.
	 *
	 * Where the notes are attributed from is the part worth being careful about.
	 * `liveBar` and `liveBeat` arrive through Tone's `Draw` queue, which runs on
	 * animation frames and stops dead when the tab is not compositing — fine for
	 * a highlight, and unusable for a score, which would silently stop counting
	 * with nothing on screen to say so. So every note asks the transport where
	 * the music is at the instant it lands: the MIDI clock reading the audio
	 * clock, with no frame in between.
	 */

	/** The chord occurrence notes are currently being gathered into. */
	let openSlot: string | null = null;
	let openTarget = $state<Target | null>(null);
	/** Where that occurrence is, without the pass count, for the display to match on. */
	let openWhere = $state<string | null>(null);
	/** Pitch classes played over it so far. */
	let heard = $state<number[]>([]);
	let tally = $state<Tally>(emptyTally());
	/** Held after stopping, so the run does not vanish the moment it ends. */
	let lastRun = $state<Tally | null>(null);

	/** The chord sounding right now, as opposed to the one being studied. */
	const liveEntry = $derived.by(() => {
		if (!playing || liveBar <= 0) return null;
		const bar = bars.find((entry) => entry.number === liveBar);
		if (!bar) return null;
		const index = chordIndexAtBeat(bar, liveBeat);
		const study = studyAt(bar.number, index);
		if (!study) return null;
		return { bar, index, chord: bar.chords[index].chord, study };
	});

	const liveTarget = $derived(liveEntry ? targetFor(liveEntry.chord, liveEntry.study.key) : null);

	/*
	 * Lend the target to the header.
	 *
	 * The row of sounding notes is on every screen and is where the eyes already
	 * are; giving it the chord means each pill can say whether it belongs. Given
	 * back on the way out, on the same terms as the pedal handler above — the
	 * header outlives this page and would otherwise go on marking notes against
	 * a chord that stopped sounding when you navigated away.
	 */
	$effect(() => {
		sharedTarget.set(liveTarget);
		return () => sharedTarget.clear();
	});

	const liveWhere = $derived(liveEntry ? `${liveEntry.bar.number}:${liveEntry.index}` : null);

	/** Chord tones actually played during the chord now sounding. */
	const litTones = $derived(
		openWhere !== null && openWhere === liveWhere
			? new Set(heard.map((note) => ((note % 12) + 12) % 12))
			: new Set<number>()
	);

	/** Whether the inspector is describing the chord you are being marked against. */
	const marking = $derived(playing && liveTarget !== null && followingPlayback);

	function recordNote(note: number) {
		// Null while stopped, paused, or still counting in — none of which is a
		// moment when a note belongs to a bar of the form.
		const position = track.position;
		if (!position) return;

		const number = (loopFrom ?? 1) + position.bar - 1;
		const bar = bars.find((entry) => entry.number === number);
		if (!bar) return;
		const index = chordIndexAtBeat(bar, position.beat);
		// The pass is what makes bar 1 the second time round a different chord to
		// answer for than bar 1 the first time.
		const slot = `${position.pass}:${number}:${index}`;

		if (slot !== openSlot) {
			closeSlot();
			const study = studyAt(number, index);
			if (!study) return;
			openSlot = slot;
			openWhere = `${number}:${index}`;
			openTarget = targetFor(bar.chords[index].chord, study.key);
		}

		if (openTarget) heard = [...heard, note];
	}

	/** Fold the open chord into the run. Silence is dropped rather than failed. */
	function closeSlot() {
		if (openTarget && heard.length > 0) tally = addAttempt(tally, judge(heard, openTarget));
		openSlot = null;
		openTarget = null;
		openWhere = null;
		heard = [];
	}

	function resetRun() {
		closeSlot();
		tally = emptyTally();
		lastRun = null;
	}

	$effect(() => {
		session.onNote((note) => recordNote(note));
		return () => session.onNote(null);
	});

	/**
	 * The run so far, counting the chord still under the hands.
	 *
	 * A chord cannot be finally judged until it is over — you may yet play the
	 * note that lands it — so the tally proper only takes it once it has passed.
	 * Showing only that, though, means playing a perfect first chord and watching
	 * the panel go on insisting you have not started, which reads as broken. The
	 * open chord is therefore folded in provisionally: the number is live and
	 * honest, and firms up rather than jumping when the bar turns.
	 */
	const provisional = $derived<Tally>(
		openTarget && heard.length > 0 ? addAttempt(tally, judge(heard, openTarget)) : tally
	);

	/** The run on show: the one just finished, or the one under way. */
	const shown = $derived<Tally>(lastRun ?? provisional);
	const shownAccuracy = $derived(accuracy(shown));
	const shownCoverage = $derived(coverage(shown));

	/** How the notes played were spread, as percentages of the whole run. */
	const spread = $derived.by(() => {
		const { chord, colour, outside } = shown.notes;
		const total = chord + colour + outside;
		if (total === 0) return null;
		return {
			chord: (chord / total) * 100,
			colour: (colour / total) * 100,
			outside: (outside / total) * 100,
			total
		};
	});

	const PLAYER_KEY = 'backing:player-v1';
	let playerReady = $state(false);

	onMount(() => {
		try {
			const raw = localStorage.getItem(PLAYER_KEY);
			if (raw) {
				const saved = JSON.parse(raw) as Record<string, unknown>;
				const savedSeed = repertoire.find((chart) => chart.slug === saved.slug);
				if (!requestedSlug && savedSeed) slug = savedSeed.slug;
				if (typeof saved.keyName === 'string' && KEYS.includes(saved.keyName))
					keyName = saved.keyName;
				if (!requestedSlug && typeof saved.bpm === 'number' && Number.isFinite(saved.bpm)) {
					bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(saved.bpm)));
				}
				if (saved.feel === 'swing' || saved.feel === 'straight') feel = saved.feel;
				if (typeof saved.countIn === 'boolean') countIn = saved.countIn;
				for (const [part] of PARTS) {
					const savedMuted = (saved.muted as Partial<Record<Part, unknown>> | undefined)?.[part];
					const savedLevel = (saved.level as Partial<Record<Part, unknown>> | undefined)?.[part];
					if (typeof savedMuted === 'boolean') muted = { ...muted, [part]: savedMuted };
					if (typeof savedLevel === 'number' && Number.isFinite(savedLevel)) {
						level = { ...level, [part]: Math.max(0, Math.min(1, savedLevel)) };
					}
				}
			}
		} catch {
			// A malformed preference should never stop the player from opening.
		}
		for (const [part] of PARTS) {
			track.setMuted(part, muted[part]);
			track.setLevel(part, level[part]);
		}
		playerReady = true;
	});

	$effect(() => {
		if (!playerReady) return;
		localStorage.setItem(
			PLAYER_KEY,
			JSON.stringify({ slug, keyName, bpm, feel, countIn, muted, level })
		);
	});

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
			key: homeKey,
			loopFrom: loopFrom ?? undefined,
			loopTo: loopTo ?? undefined,
			beatsPerBar: chart.beatsPerBar,
			countInBars: countIn ? 1 : 0
		};
	}

	/**
	 * The hands-free control: space, the pedal, and the big button all reach
	 * this. It cycles play → pause → resume rather than play → stop, because
	 * stopping and going back to the top is not what "let me look at that
	 * chord" means.
	 */
	async function toggle() {
		if (playing) {
			pause();
		} else if (paused) {
			await resumePlay();
		} else {
			followPlayback = true;
			// A run is one press of play to one press of stop, so this is where the
			// previous one is cleared away.
			resetRun();
			counting = countIn;
			await track.start(config());
			playing = track.playing;
		}
	}

	/** Freeze exactly here, so a shape can be found under the hands. */
	function pause() {
		// Bank the chord being played over. Without this, the notes found while
		// paused and hunting for a shape would be credited to it as though they
		// had been played in time.
		closeSlot();
		track.pause();
		// Pin the chord panel to the one just landed on — the same thing tapping
		// a bar does when nothing is playing.
		if (liveBar > 0) {
			pinnedBar = liveBar;
			const live = bars.find((bar) => bar.number === liveBar);
			if (live) pinnedChord = chordIndexAtBeat(live, liveBeat);
		}
		playing = false;
		paused = true;
	}

	/** Continue from `pause`, from the same beat if nothing changed meanwhile. */
	async function resumePlay() {
		followPlayback = true;
		const resumed = await track.resume(config());
		paused = false;
		playing = track.playing;
		// If the key, chart, feel or loop changed while paused there was no
		// "same place" to return to, and `resume` rebuilt from the top instead —
		// that deserves the same count-in a fresh play would get.
		counting = resumed ? false : countIn;
	}

	/** A full reset, back to the top of the form. Not on the hands-free path. */
	function stopFully() {
		// The run ends here, so the last chord is banked and the total is held on
		// screen rather than being cleared along with the transport.
		closeSlot();
		lastRun = tally.voiced > 0 ? tally : null;
		track.stop();
		playing = false;
		paused = false;
		counting = false;
	}

	/** Anything that changes the notes has to be rebuilt; tempo does not. */
	async function restartIfPlaying() {
		if (!playing) return;
		// The form goes back to the top and the chords may not even be the same
		// ones, so what was counted up to here is not part of what follows.
		resetRun();
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
	function selectChord(number: number, chordIndex: number) {
		pinnedBar = number;
		pinnedChord = chordIndex;
		followPlayback = false;
	}

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
		bpm = repertoire.find((c) => c.slug === next)?.defaultBpm ?? bpm;
		pinnedChord = 0;
		followPlayback = true;
		pinnedBar = 1;
		confirmingDelete = false;
		loopFrom = null;
		loopTo = null;
		// A score against a tune you have moved on from is just a stale number.
		resetRun();
		void restartIfPlaying();
	}

	function onKeydown(event: KeyboardEvent) {
		if (!shouldHandleSpace(event)) return;
		event.preventDefault();
		void toggle();
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
	<header class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1
				class="font-display text-ink flex items-baseline gap-3 text-2xl font-semibold tracking-tight"
			>
				{seed.name}
				{#if seed.published}
					<span class="text-ink-dim font-mono text-xs font-normal">{seed.published}</span>
				{/if}
				<span class="text-ink-dim font-mono text-xs font-normal">
					{barCount} bars · {keyLabel(keyName)}{seed.mode === 'minor' ? ' minor' : ''}
				</span>
			</h1>
			<p class="text-ink-muted mt-1 max-w-3xl text-sm leading-relaxed">{seed.notes}</p>
		</div>
		<!-- A distraction is exactly what a wall of tune names becomes mid-practice. -->
		<button
			type="button"
			class="chip shrink-0"
			onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
			aria-pressed={sidebarCollapsed}
		>
			{sidebarCollapsed ? '☰ Show charts' : '« Hide charts'}
		</button>
	</header>

	<div
		class={sidebarCollapsed
			? 'grid gap-7 xl:grid-cols-[1fr_19rem] lg:grid-cols-[1fr_19rem]'
			: 'grid gap-7 xl:grid-cols-[15rem_1fr_19rem] lg:grid-cols-[1fr_19rem]'}
	>
		{#if !sidebarCollapsed}
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
		{/if}

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
						Write the chords out as they are on the page, with a <code>|</code> between bars and a line
						per row. Say which key it is written in and it gets stored as numerals — so typing it once
						gives you all twelve keys.
					</p>

					<div class="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_7rem_8rem]">
						<label class="col-span-2 flex flex-col gap-1 sm:col-span-3">
							<span class="field-label">Chart name</span>
							<input name="name" value={form?.name ?? ''} required class="field w-full" />
						</label>
						<label class="flex flex-col gap-1">
							<span class="field-label">Written key</span>
							<select name="key" class="field w-full">
								{#each KEYS as k (k)}
									<option value={k} selected={k === (form?.key ?? keyName)}>{keyLabel(k)}</option>
								{/each}
							</select>
						</label>
						<label class="flex flex-col gap-1">
							<span class="field-label">Mode</span>
							<select name="mode" class="field w-full">
								<option value="major" selected={form?.mode !== 'minor'}>major</option>
								<option value="minor" selected={form?.mode === 'minor'}>minor</option>
							</select>
						</label>
						<label class="col-span-2 flex flex-col gap-1 sm:col-span-1">
							<span class="field-label">Tempo</span>
							<input
								name="bpm"
								type="number"
								min="40"
								max="300"
								value={form?.bpm ?? 140}
								class="field w-full"
							/>
						</label>
					</div>

					<label class="flex flex-col gap-1">
						<span class="field-label">Chords, one row per line</span>
						<textarea
							name="chart"
							rows="6"
							class="field font-mono text-sm"
							placeholder={PLACEHOLDER}>{form?.text ?? ''}</textarea
						>
					</label>

					{#if form?.problems?.length}
						<div role="alert" class="border-ground-line rounded-lg border p-3">
							<p class="mb-1 text-sm font-semibold">Check these before saving:</p>
							<ul class="flex flex-col gap-0.5">
								{#each form.problems as problem (problem)}
									<li class="font-mono text-xs" style:color="var(--pc-0)">{problem}</li>
								{/each}
							</ul>
						</div>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						{#if form?.canSavePartial}
							<button type="submit" name="allowPartial" value="yes" class="chip is-on"
								>Save the understood bars</button
							>
						{:else}
							<button type="submit" class="chip is-on">Save chart</button>
						{/if}
						<button type="button" class="chip" onclick={() => (importing = false)}>Cancel</button>
					</div>
				</form>
			{/if}

			<div class="tonal-centre">
				<span class="study-kicker">Harmonic map</span>
				<strong>Main key: {formatStudyKey(homeKey)}</strong>
				<span>Roman function and departures are shown on every chord.</span>
			</div>

			<div class="border-ground-line bg-ground-raised rounded-xl border p-3">
				{#each chart.rows as row, r (r)}
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" class:mt-2={r > 0}>
						{#each row as bar (bar.number)}
							{@const pc = pitchClass(bar.chords[0].chord.root)}
							{@const now = playing && liveBar === bar.number}
							<div
								class="bar"
								class:is-now={now}
								class:is-study-bar={!followingPlayback && pinnedBar === bar.number}
								class:is-dim={!inLoop(bar.number)}
								class:is-loop-start={looping && bar.number === loopFrom}
								class:is-loop-end={looping && bar.number === loopTo}
								style:--tint="var(--pc-{pc})"
								style:--tint-ink="var(--pc-{pc}-ink)"
							>
								<button
									type="button"
									class="bar-head"
									onclick={() => tapBar(bar.number)}
									aria-label={'Set bar ' + bar.number + ' as a loop point'}
									title="Set loop point"
								>
									<span class="bar-number">Bar {bar.number}</span>
									<span class="bar-loop-action">loop</span>
								</button>
								<div class="bar-chords">
									{#each bar.chords as entry, i (i)}
										{@const context = studyAt(bar.number, i)}
										{@const chordNow = now && chordIndexAtBeat(bar, liveBeat) === i}
										<button
											type="button"
											class="bar-chord"
											class:is-selected={!followingPlayback &&
												pinnedBar === bar.number &&
												pinnedChord === i}
											class:is-live={chordNow}
											style:--chord-tint="var(--pc-{pitchClass(entry.chord.root)})"
											onclick={() => selectChord(bar.number, i)}
											aria-pressed={!followingPlayback &&
												pinnedBar === bar.number &&
												pinnedChord === i}
											aria-label={'Study ' + entry.symbol + ' in bar ' + bar.number}
										>
											<span class="bar-symbol">
												<ChordSymbol chord={entry.chord} size="1.45rem" />
											</span>
											<span class="chord-analysis">
												<strong>{formatRoman(context?.roman ?? entry.numeral)}</strong>
												<span>{context?.annotation ?? 'Analyse'}</span>
											</span>
										</button>
									{/each}
								</div>
							</div>
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
						Select a chord to study it. Use a bar header to set the loop range.
					{/if}
				</span>
				{#if mineId}
					{#if confirmingDelete}
						<form method="POST" action="?/remove" class="ml-auto flex flex-wrap items-center gap-2">
							<span>Delete {seed.name}?</span>
							<input type="hidden" name="id" value={mineId} />
							<button class="rounded-md px-2 py-1 underline">Yes, delete</button>
							<button
								type="button"
								class="rounded-md px-2 py-1 underline"
								onclick={() => (confirmingDelete = false)}>Cancel</button
							>
						</form>
					{:else}
						<button
							type="button"
							class="ml-auto rounded-md px-2 py-1 underline"
							onclick={() => (confirmingDelete = true)}>delete this chart</button
						>
					{/if}
				{/if}
			</div>

			<div class="mt-5 flex items-stretch gap-2">
				{#if playing || paused}
					<button
						type="button"
						class="stop-button"
						onclick={stopFully}
						aria-label="Stop and go back to the top"
						title="Stop and go back to the top"
					>
						<span aria-hidden="true">■</span>
					</button>
				{/if}
				<button type="button" class="transport flex-1" onclick={toggle}>
					<span class="transport-mark" aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
					<span class="transport-text">
						{#if counting}
							Counting in…
						{:else if playing && liveBar > 0}
							Bar {liveBar}, beat {Math.floor(liveBeat % chart.beatsPerBar) + 1}
						{:else if playing}
							Playing…
						{:else if paused}
							Paused — bar {liveBar}, beat {Math.floor(liveBeat % chart.beatsPerBar) + 1}
						{:else}
							Play in {keyLabel(keyName)} at {bpm}
						{/if}
					</span>
					<span class="transport-hint" aria-hidden="true">
						{#if playing}
							space to pause
						{:else if paused}
							space to resume
						{:else}
							space, or the sustain pedal
						{/if}
					</span>
				</button>
			</div>

			<!--
				How the playing is going: the same strip live and afterwards, because a
				running total and a final one are the same fact caught at two moments,
				and a separate results panel appearing at the end would be a second
				thing to learn to read.
			-->
			{#if playing || paused || lastRun}
				<section class="match" class:is-final={Boolean(lastRun)} aria-label="Chord matching">
					<div class="match-figure">
						<strong class="match-percent">
							{shownAccuracy ?? '–'}{#if shownAccuracy !== null}<span>%</span>{/if}
						</strong>
						<span class="study-kicker">{lastRun ? 'last run' : 'landed'}</span>
					</div>

					<div class="match-detail">
						{#if shown.voiced === 0}
							<p class="match-hint">
								Play along and each chord is counted as it goes by. Up in the header, a solid note
								is a chord tone, a faded one is in the key, and an outlined one is outside it.
							</p>
						{:else}
							<p class="match-counts">
								<strong>{shown.landed}</strong> of <strong>{shown.voiced}</strong>
								chords landed{#if shown.partial > 0}, {shown.partial} half{/if}{#if shown.missed > 0},
									{shown.missed}
									missed{/if}
								{#if shownCoverage !== null}
									&middot; {shownCoverage}% of the guide tones
								{/if}
							</p>

							{#if spread}
								<!-- Where the notes sat. Reported, never scored: a note outside the
								     key is a blue note as often as it is a mistake. -->
								<div
									class="spread"
									role="img"
									aria-label={`Of ${spread.total} notes played, ${Math.round(spread.chord)}% chord tones, ${Math.round(spread.colour)}% elsewhere in the key, ${Math.round(spread.outside)}% outside it`}
								>
									<span class="spread-chord" style:width="{spread.chord}%"></span>
									<span class="spread-colour" style:width="{spread.colour}%"></span>
									<span class="spread-outside" style:width="{spread.outside}%"></span>
								</div>
								<p class="spread-legend">
									<span><i class="key-chord"></i>{Math.round(spread.chord)}% chord tones</span>
									<span><i class="key-colour"></i>{Math.round(spread.colour)}% in key</span>
									<span><i class="key-outside"></i>{Math.round(spread.outside)}% outside</span>
								</p>
							{/if}
						{/if}
					</div>
				</section>
			{/if}

			<!-- The selected chord as a compact, progressive theory lesson. -->
			{#if focused && focusedBar && focusedStudy}
				<section class="study-inspector" aria-label="Chord study">
					<header class="study-inspector-head">
						<div class="study-identity">
							<span class="study-symbol" style:color="var(--pc-{pitchClass(focused.chord.root)})">
								<ChordSymbol chord={focused.chord} size="3rem" />
							</span>
							<div>
								<div class="study-function">
									<strong>{formatRoman(focusedStudy.roman)}</strong>
									<span>{focusedStudy.annotation}</span>
								</div>
								<p class="study-location">
									bar {focusedBar.number}{focusedBar.chords.length > 1
										? focusedChordIndex === 0
											? ', first half'
											: ', second half'
										: ''}
									&middot; {formatStudyKey(focusedStudy.key)}
								</p>
							</div>
						</div>

						<button
							type="button"
							class="follow-button"
							class:is-on={followPlayback}
							onclick={() => (followPlayback = true)}
							aria-pressed={followPlayback}
						>
							<span class="follow-dot" aria-hidden="true"></span>
							Follow playback
						</button>
					</header>

					{#if focusedStudy.modulation}
						<p class="modulation-note">
							Key centre changes here: {formatStudyKey(focusedStudy.modulation.from)} &rarr;
							<strong>{formatStudyKey(focusedStudy.modulation.to)}</strong>
						</p>
					{/if}

					<div class="study-overview">
						<div class="study-copy">
							<span class="study-kicker">In this song</span>
							<p>{focusedExplanation}</p>
						</div>

						<!-- The chord tones, and — while the track is running — which of them
						     you have actually played since this chord came round. -->
						<div class="degree-row" class:is-marking={marking} aria-label="Chord tones">
							{#each focusedNotes as entry, i (i)}
								{@const pc = pitchClass(entry.note)}
								<div
									class="degree"
									class:is-played={litTones.has(pc)}
									style:background="var(--pc-{pc})"
									style:color="var(--pc-{pc}-ink)"
								>
									<span class="degree-note">{formatNote(entry.note, { unicode: true })}</span>
									<span class="degree-number">{entry.degree}</span>
								</div>
							{/each}
						</div>
					</div>

					<div class="study-options">
						<section>
							<h3>Try over it</h3>
							<ul class="scale-list">
								{#each focusedStudy.scales as suggestion (suggestion.name)}
									<li>
										<strong>{suggestion.name}</strong>
										<span>{suggestion.reason}</span>
									</li>
								{/each}
							</ul>
						</section>

						<details class="context-details">
							<summary>
								<span>Other useful contexts</span>
								<span class="context-count">{otherContexts.length}</span>
							</summary>
							<div class="context-list">
								{#each otherContexts as context (formatStudyKey(context.key) + '-' + context.roman)}
									<div class="context-row">
										<strong>{formatStudyKey(context.key)}</strong>
										<span class="context-roman">{formatRoman(context.roman)}</span>
										<span>{context.description}</span>
									</div>
								{/each}
							</div>
						</details>
					</div>

					<div class="study-keyboard">
						<span class="study-kicker">Chord tones under the hands</span>
						<div class="max-w-full overflow-x-auto">
							<Keyboard
								from={KEYS_FROM}
								count={KEYS_COUNT}
								lit={focusedVoicing}
								interactive={false}
								showLabels={false}
							/>
						</div>
					</div>
				</section>
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
					Comping starts off. Two people voicing the same chord is one too many — turn it on to hear
					the changes, off to be the one playing them.
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
		border: 1px solid transparent;
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
		border-color: var(--color-ink-dim);
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

	.field-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
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
		border-color: var(--color-ink-dim);
	}

	.field:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
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

	/* A full reset, deliberately smaller and quieter than the transport itself —
	   the hands-free control is pause/resume; this is the mouse-only escape hatch. */
	.stop-button {
		flex: none;
		width: 3.25rem;
		border-radius: 12px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font-size: 1rem;
	}

	.stop-button:hover {
		background: var(--color-ground-overlay);
		color: var(--color-ink);
	}

	input[type='range']:disabled {
		opacity: 0.35;
	}

	.tonal-centre {
		display: grid;
		grid-template-columns: auto auto minmax(0, 1fr);
		align-items: baseline;
		gap: 0.45rem 1rem;
		padding: 0 0.25rem 0.7rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.tonal-centre strong {
		color: var(--color-ink);
		font-family: var(--font-display);
		font-size: 0.9rem;
	}

	.study-kicker {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	/*
	 * A chart bar is now a small group: its header controls the loop and each
	 * chord is its own study target. Keeping those actions separate means a
	 * theory question never restarts the track.
	 */
	.bar {
		position: relative;
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.25rem;
		min-height: 6.5rem;
		padding: 0.28rem 0.38rem 0.42rem;
		border-radius: 9px;
		border: 1px solid var(--color-ground-line);
		background: color-mix(in oklab, var(--tint) 14%, var(--color-ground));
		color: var(--color-ink);
		transition:
			background 90ms linear,
			border-color 90ms linear,
			opacity 160ms ease;
	}

	.bar-head {
		display: flex;
		width: 100%;
		min-height: 2.4rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.25rem 0.35rem;
		border-radius: 6px;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		text-align: left;
	}

	.bar-head:hover {
		background: color-mix(in oklab, var(--color-ground-overlay) 70%, transparent);
		color: var(--color-ink-muted);
	}

	.bar-head:focus-visible,
	.bar-chord:focus-visible,
	.follow-button:focus-visible,
	.context-details summary:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}

	.bar-loop-action {
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.bar.is-loop-start .bar-loop-action,
	.bar.is-loop-end .bar-loop-action {
		color: var(--color-ink);
	}

	.bar.is-loop-start .bar-loop-action::before {
		content: 'start / ';
	}

	.bar.is-loop-end:not(.is-loop-start) .bar-loop-action::before {
		content: 'end / ';
	}

	.bar-chords {
		display: grid;
		min-width: 0;
		flex: 1;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		gap: 0.3rem;
	}

	.bar-chord {
		display: flex;
		min-width: 0;
		min-height: 3.5rem;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.3rem;
		padding: 0.38rem 0.45rem;
		border-radius: 7px;
		border: 1px solid transparent;
		background: color-mix(in oklab, var(--chord-tint) 8%, transparent);
		color: var(--color-ink);
		text-align: left;
		transition:
			background 90ms linear,
			border-color 90ms linear;
	}

	.bar-chord:hover {
		background: color-mix(in oklab, var(--chord-tint) 18%, var(--color-ground));
		border-color: color-mix(in oklab, var(--chord-tint) 58%, var(--color-ground-line));
	}

	.bar-symbol {
		line-height: 1;
	}

	.chord-analysis {
		display: flex;
		min-width: 0;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.15rem 0.45rem;
		font-family: var(--font-mono);
		font-size: 0.56rem;
		line-height: 1.2;
	}

	.chord-analysis strong {
		color: color-mix(in oklab, var(--chord-tint) 72%, var(--color-ink));
		font-size: 0.64rem;
	}

	.chord-analysis span {
		color: var(--color-ink-dim);
	}

	.bar.is-now {
		background: color-mix(in oklab, var(--tint) 30%, var(--color-ground));
		border-color: var(--tint);
	}

	.bar.is-study-bar {
		border-color: var(--color-ink-dim);
	}

	.bar-chord.is-live {
		background: color-mix(in oklab, var(--chord-tint) 42%, var(--color-ground));
		border-color: var(--chord-tint);
		color: var(--tint-ink);
	}

	.bar-chord.is-selected {
		border-color: var(--chord-tint);
		box-shadow: inset 0 0 0 1px var(--chord-tint);
	}

	.bar.is-dim {
		opacity: 0.3;
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

	/*
	 * While a track is running the degree row doubles as a checklist: the tones
	 * you have played since this chord came round stay lit, the ones you have
	 * not recede. Nothing is added to the layout — the chips were already there
	 * and already the right colours, so this is the same object answering a
	 * second question rather than a second object asking one.
	 *
	 * Outside a run every chip is fully lit, exactly as before.
	 */
	.degree-row.is-marking .degree {
		opacity: 0.26;
		transform: scale(0.94);
		transition:
			opacity 160ms ease,
			transform 160ms ease,
			box-shadow 160ms ease;
	}

	.degree-row.is-marking .degree.is-played {
		opacity: 1;
		transform: scale(1);
		box-shadow: 0 0 0 2px color-mix(in oklab, var(--color-ink) 45%, transparent);
	}

	/*
	 * The running total, and the same strip once the run has stopped.
	 *
	 * Quiet by construction: mono type at caption size, no colour of its own,
	 * and no green or red anywhere. This app already spends its entire palette
	 * on pitch, and a score that shouted would compete with the chart it is
	 * meant to be commenting on.
	 */
	.match {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem 1.4rem;
		margin-top: 0.85rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 11px;
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}

	/* Finished runs are the thing to look at, so they get a little more edge. */
	.match.is-final {
		background: var(--color-ground-raised);
		border-color: var(--color-ink-dim);
	}

	.match-figure {
		display: flex;
		min-width: 4.5rem;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
	}

	.match-percent {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1.9rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.match-percent span {
		font-size: 0.9rem;
		color: var(--color-ink-dim);
	}

	.match-detail {
		min-width: 0;
	}

	.match-counts {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		line-height: 1.45;
	}

	.match-counts strong {
		color: var(--color-ink);
	}

	.match-hint {
		max-width: 44rem;
		color: var(--color-ink-dim);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	/* Where the notes sat, as one bar. Weight, not hue — the same language the
	   header pills use, for the same reason. */
	.spread {
		display: flex;
		width: 100%;
		height: 6px;
		margin-top: 0.5rem;
		border-radius: 3px;
		overflow: hidden;
		background: var(--color-ground-line);
	}

	.spread > span {
		transition: width 220ms ease;
	}

	.spread-chord {
		background: var(--color-ink);
	}

	.spread-colour {
		background: var(--color-ink-dim);
	}

	.spread-outside {
		background: repeating-linear-gradient(-45deg, var(--color-ink-dim) 0 2px, transparent 2px 4px);
	}

	.spread-legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin-top: 0.4rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.64rem;
	}

	.spread-legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.spread-legend i {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 2px;
		flex: none;
	}

	.key-chord {
		background: var(--color-ink);
	}

	.key-colour {
		background: var(--color-ink-dim);
	}

	.key-outside {
		border: 1px dashed var(--color-ink-dim);
	}

	@media (prefers-reduced-motion: reduce) {
		.degree-row.is-marking .degree,
		.spread > span {
			transition: none;
		}
	}
	.study-inspector {
		margin-top: 1.25rem;
		padding-top: 1.15rem;
		border-top: 1px solid var(--color-ground-line);
	}

	.study-inspector-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.study-identity {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 1rem;
	}

	.study-symbol {
		flex: none;
		line-height: 1;
	}

	.study-function {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.45rem 0.8rem;
	}

	.study-function strong {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1rem;
	}

	.study-function span {
		color: var(--color-ink-muted);
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.study-location {
		margin-top: 0.18rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.follow-button {
		display: flex;
		min-height: 2.75rem;
		flex: none;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.7rem;
		border-radius: 7px;
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.follow-button:hover,
	.follow-button.is-on {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.follow-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--color-ground-line);
	}

	.follow-button.is-on .follow-dot {
		background: var(--color-ink);
	}

	.modulation-note {
		margin-top: 0.9rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 7px;
		background: color-mix(in oklab, var(--color-ground-overlay) 65%, transparent);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.modulation-note strong {
		color: var(--color-ink);
	}

	.study-overview {
		display: grid;
		grid-template-columns: minmax(15rem, 1fr) auto;
		align-items: center;
		gap: 1.25rem 2rem;
		padding: 1.15rem 0;
	}

	.study-copy p {
		max-width: 46rem;
		margin-top: 0.35rem;
		color: var(--color-ink-muted);
		font-size: 0.88rem;
		line-height: 1.55;
	}

	.degree-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.study-options {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		border-block: 1px solid var(--color-ground-line);
	}

	.study-options > section,
	.context-details {
		padding: 1rem 0;
	}

	.study-options > section {
		padding-right: 1.25rem;
	}

	.study-options h3,
	.context-details summary {
		color: var(--color-ink);
		font-family: var(--font-display);
		font-size: 0.86rem;
		font-weight: 600;
	}

	.scale-list {
		margin-top: 0.55rem;
	}

	.scale-list li {
		display: grid;
		grid-template-columns: minmax(8rem, 0.8fr) minmax(0, 1.5fr);
		gap: 0.6rem 1rem;
		padding: 0.45rem 0;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 65%, transparent);
	}

	.scale-list strong {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.scale-list span {
		color: var(--color-ink-dim);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.context-details {
		padding-left: 1.25rem;
		border-left: 1px solid var(--color-ground-line);
	}

	.context-details summary {
		display: flex;
		min-height: 2rem;
		cursor: pointer;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		list-style-position: inside;
	}

	.context-count {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.65rem;
	}

	.context-count::before {
		content: '+ ';
	}

	.context-details[open] .context-count::before {
		content: '- ';
	}

	.context-list {
		margin-top: 0.45rem;
	}

	.context-row {
		display: grid;
		grid-template-columns: minmax(7rem, 0.8fr) minmax(4rem, auto) minmax(7rem, 1fr);
		align-items: baseline;
		gap: 0.5rem 0.8rem;
		padding: 0.4rem 0;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 65%, transparent);
		color: var(--color-ink-dim);
		font-size: 0.7rem;
	}

	.context-row strong {
		color: var(--color-ink-muted);
		font-family: var(--font-display);
		font-size: 0.76rem;
	}

	.context-roman {
		color: var(--color-ink);
		font-family: var(--font-mono);
	}

	.study-keyboard {
		display: grid;
		grid-template-columns: minmax(8rem, auto) minmax(0, 1fr);
		align-items: center;
		gap: 1rem 1.5rem;
		padding-top: 1rem;
	}

	@media (max-width: 700px) {
		.tonal-centre {
			grid-template-columns: 1fr;
			gap: 0.15rem;
		}

		.study-inspector-head {
			align-items: flex-start;
		}

		.study-identity {
			align-items: flex-start;
		}

		.follow-button {
			padding-inline: 0.55rem;
		}

		.study-overview,
		.study-keyboard {
			grid-template-columns: 1fr;
		}

		.study-options {
			grid-template-columns: 1fr;
		}

		.study-options > section {
			padding-right: 0;
		}

		.context-details {
			padding-left: 0;
			border-top: 1px solid var(--color-ground-line);
			border-left: 0;
		}

		.scale-list li {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}

		.context-row {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.context-row > :last-child {
			grid-column: 1 / -1;
		}
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
