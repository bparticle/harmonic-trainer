<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Fireworks, { type FireworksApi } from '$lib/components/Fireworks.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import ScaleKeys from '$lib/components/ScaleKeys.svelte';
	import { BackingTrack, type Part } from '$lib/audio/backing';
	import { GROOVES, grooveSpec, isGroove, type Groove } from '$lib/audio/groove';
	import {
		CHARTS,
		CHART_CATEGORIES,
		realiseChart,
		type ChartBar,
		type ChartCategory,
		type ChartSeed
	} from '$lib/curriculum/charts';
	import { chordPitchClasses, closeVoicing, degreeLabels, fitToRange } from '$lib/music/chord';
	import { scaleDegreeIn, scaleNotes } from '$lib/music/scales';
	import { formatKey, key as makeKey, parseKey } from '$lib/music/key';
	import {
		formatRoman,
		formatStudyKey,
		studyProgression,
		type HarmonicStudy
	} from '$lib/music/study';
	import { formatNote, midi as toMidi, pitchClass, type Note } from '$lib/music/note';
	import { formatDegree } from '$lib/music/spell';
	import { midi as session } from '$lib/midi/shared.svelte';
	import {
		accuracy,
		add as addAttempt,
		coverage,
		emptyTally,
		judge,
		targetFor,
		type Attempt,
		type Tally,
		type Target
	} from '$lib/practice/match';
	import {
		advance as advanceStreak,
		callout as streakCallout,
		farewell,
		noStreak,
		tierFor,
		type Streak
	} from '$lib/effects/streak';
	import {
		award,
		badgesOn,
		emptyRecord,
		missingFrom,
		parseRecord,
		type StreakRecord
	} from '$lib/effects/badges';
	import {
		isEmpty,
		noBests,
		parseBests,
		queue,
		readOutbox,
		settle,
		tallyColumns,
		type AttemptPayload,
		type BadgePayload,
		type Bests,
		type BlockResultPayload,
		type RunPayload
	} from '$lib/practice/run';
	import {
		describeGoal,
		evaluateGoal,
		readMission,
		type MissionParams,
		type Verdict
	} from '$lib/practice/goal';
	import { chordSymbolLabel } from '$lib/music/symbol';
	import StreakBadges from '$lib/components/StreakBadges.svelte';
	import ChartEditor from '$lib/components/ChartEditor.svelte';
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

	/*
	 * Two routes render this: `/backing` for the player who owns the instance,
	 * and `/demo` for a visitor who has not signed in and may never.
	 *
	 * `demo` is a read-only mode rather than a cut-down copy. The transport, the
	 * scoring, the chart and the study column are identical — the whole point of
	 * showing it to a stranger is that it is the real thing — and what it turns
	 * off is everything that would write: the chart editor, deleting a tune, and
	 * the four localStorage keys. A visitor leaves no trace, which is also the
	 * honest version of the privacy claim on the page they arrived from.
	 */
	let {
		mine = [] as Array<ChartSeed & { id: string }>,
		form = null,
		colorMap,
		demo = false,
		/** The shelf and the two bests, as the record has them. Empty for the demo. */
		record: fromServer = emptyRecord() as StreakRecord,
		bests: bestsFromServer = noBests() as Bests
	} = $props();

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
	const initialRepertoire: ChartSeed[] = [...CHARTS, ...mine];
	const requestedSlug = page.url.searchParams.get('chart');
	const initialSeed = initialRepertoire.find((chart) => chart.slug === requestedSlug) ?? CHARTS[0];
	const repertoire = $derived<ChartSeed[]>([...CHARTS, ...mine]);

	/*
	 * A mission, if this URL is one.
	 *
	 * Read once, from the query string, beside the `?chart=` above it — because a
	 * mission is an additional reading of the URL and never a mode this page is
	 * put into. `readMission` returns null for every URL without a goal on it, and
	 * every branch below is written so that null means the page behaves exactly as
	 * it did before missions existed: same defaults, same controls, same
	 * recording, same streaks and same badges.
	 *
	 * The constraint travels as parameters rather than as a component prop so that
	 * both routes get it for free and neither has to know what a mission is —
	 * which also means the demo can be handed one and will still write nothing,
	 * because everything that writes is already behind `demo`.
	 */
	const mission: MissionParams | null = readMission(page.url.searchParams);

	// svelte-ignore state_referenced_locally
	let slug = $state(initialSeed.slug);
	/*
	 * The editor is one component doing two jobs: writing a chart down and
	 * changing one you already have. `editing` says which, and a refused save
	 * carries the id back so a rejected edit reopens as an edit rather than
	 * silently turning into a second copy of the tune.
	 */
	// svelte-ignore state_referenced_locally
	let editing = $state<(ChartSeed & { id: string }) | null>(
		form?.id ? (mine.find((c) => c.id === form.id) ?? null) : null
	);
	// svelte-ignore state_referenced_locally
	let importing = $state(Boolean(form) && !form?.id);
	let confirmingDelete = $state(false);

	// A chart with a home key opens in it; a form has none and opens in C. A
	// mission names what it names and leaves the rest alone — its tempo is a floor
	// rather than a setting, so it is where the slider starts and not where it
	// stays.
	let keyName = $state(mission?.keyCenter ?? initialSeed.defaultKey ?? 'C');
	let bpm = $state(mission?.bpmFloor ?? initialSeed.defaultBpm);
	let groove = $state<Groove>(mission?.groove ?? initialSeed.defaultGroove);
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
	 * Keeping the chord you are playing on screen.
	 *
	 * A thirty-two bar form does not fit on a laptop screen alongside the setup
	 * panel and the study column, so the bar being played walks off the bottom
	 * of the window somewhere around the bridge. Hands are on the keys; nobody
	 * is going to scroll.
	 *
	 * `block: 'nearest'` rather than 'center' because it does the least: a bar
	 * already fully visible causes no scroll at all, so the page only moves at
	 * row boundaries rather than shuffling on every bar.
	 */
	let chartEl = $state<HTMLDivElement | null>(null);
	let motionOK = $state(true);

	/**
	 * Deliberate scrolling wins, for a few seconds.
	 *
	 * Without this, reaching for the tempo slider below the chart while the
	 * track is running means being yanked back up on the next bar line. Read
	 * from wheel and touch rather than from the scroll event, which cannot tell
	 * a person from our own `scrollIntoView`.
	 */
	let scrollHeldUntil = 0;
	const holdAutoScroll = () => (scrollHeldUntil = performance.now() + 4000);

	onMount(() => {
		const reduced = matchMedia('(prefers-reduced-motion: reduce)');
		motionOK = !reduced.matches;
		const onPreference = () => (motionOK = !reduced.matches);
		reduced.addEventListener('change', onPreference);
		return () => reduced.removeEventListener('change', onPreference);
	});

	/*
	 * The fireworks.
	 *
	 * Everything from here to `celebrateRun` is decoration, on a switch, and
	 * deliberately kept apart from the scoring above it: the tally is what
	 * happened and this is how loud to be about it. Turning it off changes what
	 * the app celebrates and never what it reports.
	 */
	let fireworks = $state(true);
	let fx = $state<FireworksApi | null>(null);
	let streak = $state<Streak>(noStreak());
	const tier = $derived(tierFor(streak.count));

	/*
	 * What the streaks leave behind.
	 *
	 * The combo itself lives and dies with the run. This outlives the tab, and
	 * since M9 it outlives the *machine*: one badge per rung per tune, kept from
	 * the first time you reached it there, in the database.
	 *
	 * Local storage is still here and has changed job. It was the record and is
	 * now a write-through cache in front of it — which is what lets a run played
	 * with the network away still count, and what carried the shelf in on the
	 * first load after this shipped.
	 *
	 * No best is held here at all. A streak cannot outlive the transport, so the
	 * best ever is the highest any run reached and the best on a tune is the same
	 * grouped by slug — both computed where the runs are, so there is no second
	 * copy able to disagree with the badges.
	 */
	const RECORD_KEY = 'backing:record-v2';
	/** What the record was called when it was the record. Read once, on the way past. */
	const LEGACY_RECORD_KEY = 'backing:streaks-v1';

	// svelte-ignore state_referenced_locally
	let record = $state<StreakRecord>(fromServer);
	// svelte-ignore state_referenced_locally
	let bests = $state<Bests>(bestsFromServer);
	let recordReady = $state(false);

	const shelf = $derived(badgesOn(record, slug));
	/*
	 * The run under way counts towards both bests before it has been written
	 * down. Waiting for the flush would mean landing a new personal best and
	 * watching the shelf go on quoting the old one for the rest of the sitting.
	 */
	const bestEver = $derived(Math.max(bests.best, streak.best));
	const bestHere = $derived(Math.max(bests.byChart[slug] ?? 0, streak.best));

	onMount(() => {
		// The demo keeps its streak for as long as the tab is open and writes
		// nothing down. Leaving `recordReady` false is what stops the effect below.
		if (demo) return;

		try {
			const raw = localStorage.getItem(RECORD_KEY) ?? localStorage.getItem(LEGACY_RECORD_KEY);
			const cached = raw ? parseRecord(JSON.parse(raw)) : emptyRecord();

			// Badges the browser knows about and the record does not: everything
			// earned before M9, and anything earned since while offline. `parseRecord`
			// reads the old tier-keyed shape and files each badge under the tune that
			// won it, which is lossless because a badge has named its chart since the
			// day badges shipped.
			const unseen = missingFrom(cached, record);
			if (unseen.length > 0) {
				queue(localStorage, {
					runs: [],
					blocks: [],
					badges: unseen.map((badge) => ({
						chartSlug: badge.chart,
						tier: badge.tier,
						wonAt: badge.at || new Date().toISOString(),
						count: badge.count,
						pc: badge.pc,
						keyCenter: badge.key,
						runId: null
					}))
				});
			}
		} catch {
			// A cache that will not parse costs you nothing: the record is elsewhere.
		}

		recordReady = true;
		void flush();
	});

	$effect(() => {
		if (!recordReady) return;
		localStorage.setItem(RECORD_KEY, JSON.stringify(record));
	});

	/**
	 * Send whatever is waiting, and take the answer as the truth.
	 *
	 * Failure is not handled because there is nothing to handle: the outbox keeps
	 * what was not accepted and the next load tries again. Every id in it was
	 * generated here, so sending the same thing twice is a no-op at the other end
	 * — which is the entire reason the ids are generated here.
	 */
	async function flush() {
		if (demo) return;
		const pending = readOutbox(localStorage);
		if (isEmpty(pending)) return;

		try {
			const response = await fetch('/api/runs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(pending)
			});
			if (!response.ok) return;

			const answer = await response.json();
			settle(localStorage, pending);
			record = parseRecord(answer.record);
			bests = parseBests(answer.bests);
		} catch {
			// No network. It waits, which is what an outbox is for.
		}
	}

	/*
	 * The run being played, on its way to the record.
	 *
	 * A run is one press of play to one press of stop, which is the same unit the
	 * score on screen has always used — and it has to be, because a streak is
	 * counted from the moment the transport starts and `best_streak` is what the
	 * shelf's two numbers are derived from.
	 *
	 * Changing the chart or the loop mid-run restarts the transport, so it also
	 * ends one run and begins another. That is not bookkeeping pedantry: one row
	 * records one chart in one key, and a row that spanned a chart change could
	 * not honestly say what was played over.
	 */
	let runId: string | null = null;
	let runStartedAt = '';
	/** Transport actually running, accumulated across pauses. */
	let runPlayedMs = 0;
	let runningSince: number | null = null;
	let runAttempts: AttemptPayload[] = [];
	let runBadges: BadgePayload[] = [];
	/**
	 * The tempo the run's best streak was clinched at.
	 *
	 * The slider moves while the transport runs, so by the time the run is banked
	 * `bpm` is where the tempo *ended up* and not where the streak was reached.
	 * Written at the one moment that fact exists — see `celebrateChord` — and null
	 * until then, because a run that never landed two in a row clinched nothing.
	 */
	let runBestStreakBpm: number | null = null;

	/**
	 * How the mission went, once the transport has stopped.
	 *
	 * Null until there is something to say, and null again the moment a new run
	 * starts — the same lifetime `lastRun` has, because they are two readings of
	 * the same thing and it would be odd for one to outlive the other.
	 */
	let verdict = $state<Verdict | null>(null);

	/** How far into the run we are, on the only clock that counts. */
	const elapsedMs = () =>
		Math.round(runPlayedMs + (runningSince === null ? 0 : performance.now() - runningSince));

	const startClock = () => (runningSince ??= performance.now());

	function stopClock() {
		if (runningSince === null) return;
		runPlayedMs += performance.now() - runningSince;
		runningSince = null;
	}

	/** Begin one. Whatever came before must already have been banked. */
	function startRun() {
		runId = crypto.randomUUID();
		runStartedAt = new Date().toISOString();
		runPlayedMs = 0;
		runningSince = null;
		runAttempts = [];
		runBadges = [];
		runBestStreakBpm = null;
	}

	/**
	 * Write the run down, if there was one.
	 *
	 * Closes the chord under the hands first, so the last thing played belongs to
	 * the run it was played in. Idempotent through `runId`, which is cleared here
	 * — stopping, then changing the chart, banks once.
	 *
	 * A second of transport is the whole bar to clear: below that nothing was
	 * played and nothing was heard, and a row saying so would be a double-tap of
	 * the play button pretending to be practice. Anything that judged a chord is
	 * far past it.
	 *
	 * Queued before it is posted, always, so closing the tab on the way out costs
	 * nothing — the next load sends it.
	 */
	function bankRun() {
		closeSlot();
		stopClock();
		const id = runId;
		runId = null;

		/*
		 * The mission is judged before the demo's early return, because the verdict
		 * is about the playing rather than about the record: a visitor gets to see
		 * how it went and still leaves nothing behind. Judged from the same rows
		 * that are about to be written down, so the sentence on screen and the one
		 * in the database cannot disagree.
		 */
		if (mission) {
			verdict = evaluateGoal(mission.goal, runAttempts, {
				chartSlug: slug,
				keyCenter: keyName,
				bpm,
				barsPerChorus: barCount
			});
		}

		if (demo || !id || runPlayedMs < 1000) return;

		const run: RunPayload = {
			id,
			chartSlug: slug,
			chartId: mineId,
			sessionBlockId: mission?.blockId ?? null,
			keyCenter: keyName,
			bpm,
			groove,
			startedAt: runStartedAt,
			endedAt: new Date().toISOString(),
			playingMs: Math.round(runPlayedMs),
			...tallyColumns(tally),
			bestStreak: streak.best,
			bestStreakBpm: runBestStreakBpm,
			attempts: runAttempts
		};

		// The verdict rides with the run that earned it. Only a mission a session
		// actually set has a block to report to; one opened by hand is judged on
		// screen and written down as an ordinary run, which is all it is.
		const blocks: BlockResultPayload[] =
			mission?.blockId && verdict ? [{ blockId: mission.blockId, runId: id, verdict }] : [];

		queue(localStorage, { runs: [run], badges: runBadges, blocks });
		runAttempts = [];
		runBadges = [];
		void flush();
	}
	let transportEl = $state<HTMLDivElement | null>(null);
	let transportBeat: Animation | null = null;

	/*
	 * The chart list, collapsible.
	 *
	 * Persisted, because the point of collapsing it is to stop it competing for
	 * attention during a practice sitting — it should stay out of the way across
	 * a reload too, not spring back the moment the page is refreshed.
	 *
	 * Collapsed by default below `xl` rather than below `lg`: three columns only
	 * genuinely fit at 1280px and up. Between 1024 and 1279 they do fit, but the
	 * chart pays for it, so that arrangement is something you opt into to go and
	 * find a tune — not what you land on to practise.
	 */
	const SIDEBAR_KEY = 'backing:sidebar-collapsed';
	let sidebarCollapsed = $state(false);
	let sidebarReady = $state(false);
	onMount(() => {
		const saved = demo ? null : localStorage.getItem(SIDEBAR_KEY);
		sidebarCollapsed = saved ? saved === 'yes' : matchMedia('(max-width: 1279px)').matches;
		sidebarReady = !demo;
	});
	$effect(() => {
		if (sidebarReady) localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? 'yes' : 'no');
	});

	/*
	 * The setup panel, collapsible for the same reason the chart list is: key,
	 * tempo, feel and the mix are things you dial in before playing, not things
	 * worth spending space on once your hands are on the keys. Unlike the chart
	 * list it defaults open, since a fresh chart usually wants at least a key
	 * and a tempo checked before the first pass.
	 */
	const SETUP_KEY = 'backing:setup-open';
	let settingsOpen = $state(true);
	let settingsReady = $state(false);
	onMount(() => {
		const saved = demo ? null : localStorage.getItem(SETUP_KEY);
		settingsOpen = saved ? saved === 'yes' : true;
		settingsReady = !demo;
	});
	$effect(() => {
		if (settingsReady) localStorage.setItem(SETUP_KEY, settingsOpen ? 'yes' : 'no');
	});

	const seed = $derived(repertoire.find((c) => c.slug === slug) ?? CHARTS[0]);
	const mineId = $derived(mine.find((c) => c.slug === slug)?.id ?? null);
	const mineSeed = $derived(mine.find((c) => c.slug === slug) ?? null);

	/**
	 * A stored chart, back in the editor as chord symbols.
	 *
	 * It goes in as numerals and has to come out as something a person can read
	 * and retype, which is `realiseChart` — the same function the player uses to
	 * put a chart into a key. Realised in the key it was written in, so the
	 * numerals underneath each bar come straight back out as the ones already
	 * stored: opening a chart and saving it again without touching anything must
	 * not move a single chord.
	 */
	function chartAsTyped(seed: ChartSeed): string {
		return realiseChart(seed, seed.defaultKey ?? 'C')
			.rows.map((row) => row.map((bar) => bar.chords.map((c) => c.symbol).join(' ')).join(' | '))
			.join('\n');
	}

	const editorInitial = $derived(
		form ??
			(editing
				? {
						name: editing.name,
						text: chartAsTyped(editing),
						key: editing.defaultKey ?? 'C',
						mode: editing.mode,
						bpm: editing.defaultBpm,
						groove: editing.defaultGroove,
						lyrics: editing.lyrics,
						// `load` shows 'Yours.' where a chart has no notes. It is a placeholder
						// on the way out and must not become real text on the way back in.
						notes: editing.notes === 'Yours.' ? '' : editing.notes
					}
				: null)
	);
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
	/** The chord's own notes, for marking them out inside each suggested scale. */
	const focusedTones = $derived(focused ? chordPitchClasses(focused.chord) : []);
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
	 * The scale diagram in words, for a screen reader.
	 *
	 * Its degrees are drawn as Roman numerals and read out as plain numbers:
	 * speech has no use for a numeral — "flat seven" is the degree, and
	 * "flat vee eye eye" is what a numeral becomes out loud.
	 */
	const describeScale = (name: string, notes: Note[]) =>
		`${name}: ` +
		notes
			.map(
				(note) =>
					`${formatNote(note, { unicode: true })} ${formatDegree(scaleDegreeIn(notes[0], note), true)}`
			)
			.join(', ');
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
	/** Its root's colour, held so a celebration fired after it closes is still its own. */
	let openPc = 0;
	/*
	 * What the chord *was*, held for the same reason its colour is: by the time
	 * the slot closes and the attempt can be judged, the music has moved on and
	 * the numbers alone would not say what they were about.
	 */
	let openBar = 0;
	let openChord = '';
	let openNumeral = '';
	let openLocalKey = '';
	let openAtMs = 0;
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

	/** The colour the room is lit in: whatever chord is sounding, or nothing at all. */
	const livePc = $derived(liveEntry ? pitchClass(liveEntry.chord.root) : null);

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
			// The chord that just ended is the only thing worth celebrating, and
			// this is the one place a chord ends while the music carries on — the
			// other callers of `closeSlot` are stopping, pausing or resetting.
			celebrateChord(closeSlot());
			const study = studyAt(number, index);
			if (!study) return;
			openSlot = slot;
			openWhere = `${number}:${index}`;
			openPc = pitchClass(bar.chords[index].chord.root);
			openTarget = targetFor(bar.chords[index].chord, study.key);
			openBar = number;
			// The chord as it sounded and the numeral as the chart stores it: the
			// first is what was played over, the second is what makes two runs in
			// different keys comparable.
			openChord = chordSymbolLabel(bar.chords[index].chord);
			openNumeral = study.roman;
			// `formatKey`, not `formatStudyKey`: the record stores 'Bb' and 'F# dorian',
			// never 'B♭ major'. The schema's convention is that a key survives a round
			// trip through the database, and a display string with a ♭ in it does not —
			// `parseKey` cannot read it back, so the profile could not tell which pitch
			// class it was looking at.
			openLocalKey = formatKey(study.key);
			openAtMs = elapsedMs();
		}

		if (!openTarget) return;

		// A tone is sparked the first time it turns up under this chord, not on
		// every repeat of it: holding a voicing down should not fountain.
		const pc = ((note % 12) + 12) % 12;
		const isNew = !heard.some((played) => ((played % 12) + 12) % 12 === pc);
		const isChordTone = openTarget.chord.has(pc);
		heard = [...heard, note];
		if (isNew && isChordTone) sparkTone(pc);
	}

	/**
	 * Fold the open chord into the run, and hand back what it was.
	 *
	 * Silence is dropped rather than failed. The return is for the fireworks:
	 * where the chord was on screen and what colour it is, both of which are
	 * cleared here and would otherwise have moved on by the time anything could
	 * be drawn about them.
	 */
	function closeSlot(): { attempt: Attempt; where: string | null; pc: number } | null {
		let finished: { attempt: Attempt; where: string | null; pc: number } | null = null;

		if (openTarget && heard.length > 0) {
			const attempt = judge(heard, openTarget);
			tally = addAttempt(tally, attempt);
			finished = { attempt, where: openWhere, pc: openPc };

			// One row per judged chord. This is the grain the blind-spot report
			// needs and the one thing that cannot be reconstructed afterwards from
			// the totals it rolls up into.
			if (runId) {
				runAttempts.push({
					id: crypto.randomUUID(),
					bar: openBar,
					chord: openChord,
					numeral: openNumeral,
					localKey: openLocalKey,
					landing: attempt.landing,
					found: attempt.found,
					needed: attempt.needed,
					notesChord: attempt.notes.chord,
					notesColour: attempt.notes.colour,
					notesOutside: attempt.notes.outside,
					atMs: openAtMs
				});
			}
		}

		openSlot = null;
		openTarget = null;
		openWhere = null;
		heard = [];
		return finished;
	}

	/**
	 * Clear the run off the screen.
	 *
	 * Banks it first, always. Emptying the tally and the streak and only then
	 * writing the row would file a sitting as a row of zeroes, so the two are
	 * welded together here rather than left as an order for each caller to
	 * remember — which is exactly the kind of thing a caller eventually does not.
	 */
	function resetRun() {
		bankRun();
		tally = emptyTally();
		lastRun = null;
		// Cleared after the banking, not before: `bankRun` is what works the verdict
		// out, and a mission's last answer belongs to the run that gave it.
		verdict = null;
		streak = noStreak();
	}

	$effect(() => {
		session.onNote((note) => recordNote(note));
		return () => session.onNote(null);
	});

	/*
	 * Where a celebration goes off.
	 *
	 * At the thing it is about, rather than in the middle of the screen: a chord
	 * tone found sparks on the chip that just lit up in the study column, and a
	 * chord landed bursts out of the bar on the chart it was played over. Both
	 * are places the eyes were already pointed.
	 */
	const slotEl = (where: string | null) =>
		where ? chartEl?.querySelector(`[data-slot="${where}"]`) : null;

	let degreeRowEl = $state<HTMLDivElement | null>(null);

	function sparkTone(pc: number) {
		const power = 0.3 + 0.55 * tier.intensity;
		// The degree chips describe the focused chord, which is only the chord
		// being marked while the inspector is following the music.
		const chip =
			marking && openWhere === liveWhere
				? degreeRowEl?.querySelector(`[data-degree="${pc}"]`)
				: null;
		fx?.spark(chip ?? slotEl(openWhere), pc, power);
	}

	/**
	 * One chord, judged and over.
	 *
	 * The streak and the record both move whether or not anyone can see them, so
	 * that switching the fireworks on mid-sitting shows the truth rather than a
	 * shelf that started counting when you flipped the switch.
	 */
	function celebrateChord(finished: ReturnType<typeof closeSlot>) {
		if (!finished) return;

		const before = streak;
		streak = advanceStreak(streak, finished.attempt.landing);

		// The tempo, at the one moment it means anything: the chord that raised the
		// best. Recorded here rather than read off the run at the end, because the
		// slider can be somewhere else by then and a streak clinched at 140 is not
		// the same achievement as the same streak clinched at 60.
		if (streak.best > before.best) runBestStreakBpm = bpm;

		const at = new Date().toISOString();
		const banked = award(record, before, streak, {
			pc: finished.pc,
			chart: slug,
			at,
			key: keyName
		});
		record = banked.record;

		// Carried with the run rather than posted as it happens: a badge and the
		// run that won it should land together or not at all.
		for (const tier of banked.earned) {
			runBadges.push({
				chartSlug: slug,
				tier: tier.id,
				wonAt: at,
				count: streak.count,
				pc: finished.pc,
				keyCenter: keyName,
				runId
			});
		}

		if (finished.attempt.landing === 'landed') {
			fx?.land(slotEl(finished.where), finished.pc, 0.55 + 0.45 * tier.intensity);
		}

		/*
		 * Three things can be worth saying, and only the loudest of them gets to.
		 * A badge earned for the first time outranks reaching the tier it sits
		 * on, which outranks the streak having ended — and a badge is rare enough
		 * to be worth the whole confetti cannon, six times ever.
		 */
		const [fresh] = banked.earned.slice(-1);
		if (fresh) {
			fx?.finale([finished.pc], `${fresh.name} · new badge`);
			return;
		}

		const words = streakCallout(before, streak);
		if (words) {
			fx?.say(words, finished.pc);
			return;
		}

		const ended = farewell(before, streak);
		if (ended) fx?.say(ended, finished.pc, 'end');
	}

	/**
	 * The end of a run, if it was one worth marking.
	 *
	 * Every colour in the tune rather than the last chord's, because what is
	 * being celebrated is the whole form. Deliberately hard enough to earn that
	 * it does not go off every time the stop button is pressed — a confetti
	 * cannon for four bars of noodling would be worth precisely nothing.
	 */
	function celebrateRun() {
		if (!lastRun || lastRun.voiced < 4) return;
		const scored = accuracy(lastRun);
		if (scored === null || scored < 70) return;

		const colours = [
			...new Set(bars.flatMap((bar) => bar.chords.map((entry) => pitchClass(entry.chord.root))))
		];
		fx?.finale(colours, scored === 100 ? 'flawless' : `${scored}%`);
	}

	/** The floating transport taps its foot, on the audio clock rather than a CSS loop. */
	function pulseTransport(strength: number) {
		if (!fireworks || !motionOK || !transportEl) return;
		transportBeat?.cancel();
		transportBeat = transportEl.animate(
			[{ transform: `scale(${1 + 0.085 * strength})` }, { transform: 'scale(1)' }],
			{ duration: 120 + 220 * strength, easing: 'cubic-bezier(0.15, 0.9, 0.3, 1)' }
		);
	}

	/*
	 * The chart follows the music.
	 *
	 * Only while it is actually leading — pinning a chord to study it hands
	 * scrolling back to you, exactly as it hands the inspector back.
	 */
	$effect(() => {
		/*
		 * Read first, decide second.
		 *
		 * Every early return below has to come *after* `liveBar` is read, or the
		 * run that returns early registers no dependency on it and the effect
		 * never wakes again. Caught in the browser: one scroll of the wheel and
		 * the chart stopped following for good, because the held run dropped the
		 * only dependency that would have restarted it.
		 */
		const number = liveBar;
		const following = followingPlayback;
		const root = chartEl;

		if (!following || !root) return;
		if (performance.now() < scrollHeldUntil) return;

		root.querySelector(`[data-bar="${number}"]`)?.scrollIntoView({
			block: 'nearest',
			inline: 'nearest',
			behavior: motionOK ? 'smooth' : 'auto'
		});
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
			const raw = demo ? null : localStorage.getItem(PLAYER_KEY);
			if (raw) {
				const saved = JSON.parse(raw) as Record<string, unknown>;
				const savedSeed = repertoire.find((chart) => chart.slug === saved.slug);
				if (!requestedSlug && savedSeed) slug = savedSeed.slug;
				// The saved key belongs to the sitting; a song's home key belongs to the
				// song, and on the way in the song wins. A form has no home key — a
				// blues is a blues in all twelve — so nothing overrides there. A key a
				// mission asked for outranks both: being sent somewhere cold and landing
				// in yesterday's comfortable key would be the mission not happening.
				if (
					!initialSeed.defaultKey &&
					!mission?.keyCenter &&
					typeof saved.keyName === 'string' &&
					KEYS.includes(saved.keyName)
				) {
					keyName = saved.keyName;
				}
				if (
					!requestedSlug &&
					!mission?.bpmFloor &&
					typeof saved.bpm === 'number' &&
					Number.isFinite(saved.bpm)
				) {
					bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, Number(saved.bpm)));
				}
				// `feel` is the old two-value key. Reading it keeps a sitting set up
				// before grooves existed opening on the groove it used to be.
				const savedGroove = isGroove(saved.groove) ? saved.groove : saved.feel;
				if (!requestedSlug && !mission?.groove && isGroove(savedGroove)) groove = savedGroove;
				if (typeof saved.countIn === 'boolean') countIn = saved.countIn;
				if (typeof saved.fireworks === 'boolean') fireworks = saved.fireworks;
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
		// Not inside the guard above: the mix has to reach the track whether it
		// was restored from a previous sitting or is still at its defaults.
		for (const [part] of PARTS) {
			track.setMuted(part, muted[part]);
			track.setLevel(part, level[part]);
		}
		playerReady = !demo;
	});

	$effect(() => {
		if (!playerReady) return;
		localStorage.setItem(
			PLAYER_KEY,
			JSON.stringify({ slug, keyName, bpm, groove, countIn, fireworks, muted, level })
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

		// The count-in gets its pulses too — it is the one moment the screen can
		// say "here it comes". Its beats are negative, hence the two-step modulo.
		const beat = Math.round(state.beat);
		const inBar = ((beat % chart.beatsPerBar) + chart.beatsPerBar) % chart.beatsPerBar;
		const strength = inBar === 0 ? 1 : 0.4;
		fx?.pulse(strength);
		pulseTransport(strength);
	};

	track.onStart = () => (counting = false);

	function config() {
		return {
			bars: chart.bars,
			bpm,
			groove,
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
			// previous one is banked and cleared away.
			resetRun();
			startRun();
			startClock();
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
		// The clock stops with the music. A paused transport is not playing, which
		// is the difference between an hour claimed and an hour spent.
		stopClock();
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
		startClock();
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
		// Banked rather than reset, because the total stays on screen: `resetRun`
		// would write the same row and then wipe the thing you just played.
		bankRun();
		track.stop();
		playing = false;
		paused = false;
		counting = false;
		celebrateRun();
	}

	/** Anything that changes the notes has to be rebuilt; tempo does not. */
	async function restartIfPlaying() {
		if (!playing) return;
		// The form goes back to the top and the chords may not even be the same
		// ones, so what was counted up to here is not part of what follows. It is
		// a run in its own right, though, which is why `resetRun` banks it rather
		// than throwing it away.
		resetRun();
		startRun();
		startClock();
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

	/*
	 * Changing the chart brings its own setup with it.
	 *
	 * 160 for rhythm changes and 160 for a modal vamp are not the same request,
	 * and neither are swing and rock — a pop tune arriving over a walking bass is
	 * three controls away from being the tune you asked for, every single time.
	 *
	 * The key only moves for a chart that has one. A form does not: a blues is a
	 * blues in all twelve, and dragging the key back to C on the way past would
	 * undo the one thing the player most often sets deliberately.
	 */
	function chooseChart(next: string) {
		// Whatever was played over the old tune is a run over the old tune. Banked
		// before the slug moves, or it would be filed under the wrong one.
		bankRun();
		slug = next;
		const chosen = repertoire.find((c) => c.slug === next);
		bpm = chosen?.defaultBpm ?? bpm;
		groove = chosen?.defaultGroove ?? groove;
		if (chosen?.defaultKey && KEYS.includes(chosen.defaultKey)) keyName = chosen.defaultKey;
		pinnedChord = 0;
		followPlayback = true;
		pinnedBar = 1;
		confirmingDelete = false;
		editing = null;
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

	onDestroy(() => {
		// Navigating away mid-run should not cost the run. The queue is written
		// synchronously, so it survives the page going even if the post does not.
		bankRun();
		track.dispose();
	});
</script>

<!-- Wheel and touch, not the scroll event: only those two can tell a person
     scrolling from the chart following the music. -->
<svelte:window onkeydown={onKeydown} onwheel={holdAutoScroll} ontouchmove={holdAutoScroll} />

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
		<div class="flex shrink-0 gap-2">
			<button
				type="button"
				class="chip"
				onclick={() => (sidebarCollapsed = !sidebarCollapsed)}
				aria-pressed={sidebarCollapsed}
			>
				{sidebarCollapsed ? '☰ Show charts' : '« Hide charts'}
			</button>
			<button
				type="button"
				class="chip"
				onclick={() => (settingsOpen = !settingsOpen)}
				aria-pressed={settingsOpen}
			>
				{settingsOpen ? '⚙ Hide setup' : '⚙ Setup'}
			</button>
		</div>
	</header>

	<!--
		Every column actually on screen gets a track of its own. The chart list is
		optional, so the template has to change with it: when it was left out of
		the `lg` template the list still needed somewhere to go, and the study
		panel got pushed onto a second row underneath the chart — which is exactly
		the thing it is supposed to never do. Between 1024 and 1279 the list and
		the study each give up a couple of rem to make three columns fit; below
		1024 the whole thing stacks.
	-->
	<div
		class={sidebarCollapsed
			? 'grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem]'
			: 'grid gap-7 lg:grid-cols-[12rem_minmax(0,1fr)_20rem] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]'}
	>
		{#if !sidebarCollapsed}
			<!-- The repertoire, as a list. It was a wall of chips, and a wall of chips
			     is not something you read — it is something you give up on. -->
			<aside class="repertoire lg:max-h-[calc(100dvh-8rem)] lg:sticky lg:top-20 lg:overflow-y-auto">
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

				{#if !demo}
					<button type="button" class="entry mt-2" onclick={() => (importing = !importing)}>
						<span class="entry-name">+ Add a chart</span>
						<span class="entry-meta">type in what is on the page</span>
					</button>
				{/if}
			</aside>
		{/if}

		<section>
			{#if importing || editing}
				<!-- Typing is fine here: this is setting up, not practising. -->
				<ChartEditor
					keys={KEYS}
					{keyLabel}
					initialKey={keyName}
					initial={editorInitial}
					editing={editing ? { id: editing.id, name: editing.name } : null}
					onCancel={() => {
						importing = false;
						editing = null;
					}}
				/>

				{#if form?.problems?.length}
					<div role="alert" class="border-ground-line mb-5 rounded-lg border p-3">
						<p class="mb-1 text-sm font-semibold">The save was refused:</p>
						<ul class="flex flex-col gap-0.5">
							{#each form.problems as problem (problem)}
								<li class="text-ink-muted font-mono text-xs">{problem}</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}

			<div class="tonal-centre">
				<span class="study-kicker">Harmonic map</span>
				<strong>Main key: {formatStudyKey(homeKey)}</strong>
				<span>Roman function and departures are shown on every chord.</span>
			</div>

			<div
				class="chart border-ground-line bg-ground-raised rounded-xl border p-3"
				class:is-party={fireworks}
				bind:this={chartEl}
			>
				{#each chart.rows as row, r (r)}
					<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" class:mt-2={r > 0}>
						{#each row as bar (bar.number)}
							{@const pc = pitchClass(bar.chords[0].chord.root)}
							{@const now = playing && liveBar === bar.number}
							<div
								class="bar"
								data-bar={bar.number}
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
											data-slot={`${bar.number}:${i}`}
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
								{#if chart.hasLyrics}
									<!--
										The words, under the chord they are sung over.
										Rendered for every bar once any bar has words — including the
										ones with none — so the row keeps a straight baseline instead
										of the bars jumping about at different heights. A chart with
										no lyrics at all draws nothing here and looks exactly as it
										did before lyrics existed.
									-->
									<p class="bar-lyric" class:is-silent={!bar.lyric}>
										{#if bar.lyric}{bar.lyric}{:else}&nbsp;{/if}
									</p>
								{/if}
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
				{#if mineSeed}
					{#if !confirmingDelete && !editing}
						<button
							type="button"
							class="ml-auto rounded-md px-2 py-1 underline"
							onclick={() => {
								editing = mineSeed;
								confirmingDelete = false;
							}}>edit this chart</button
						>
					{/if}
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
							class="rounded-md px-2 py-1 underline"
							onclick={() => (confirmingDelete = true)}>delete this chart</button
						>
					{/if}
				{/if}
			</div>

			<!--
				The mission, directly over the transport it is played on.

				Drawn only when the URL carries one, which is what keeps this page the
				page: without a goal in the query string nothing here renders and there
				is no branch anywhere below it. Weight and no hue, like the score strip
				— a goal is not a pitch, so it does not get a colour.
			-->
			{#if mission}
				<section class="mission" aria-label="Mission">
					<span class="study-kicker">Mission</span>
					<p class="mission-goal">{describeGoal(mission.goal)}</p>
					{#if verdict}
						<!-- Announced rather than shouted: the run has just stopped and the
						     eyes are still on the chart. -->
						<p class="mission-verdict" class:is-met={verdict.met} aria-live="polite">
							{verdict.says}
						</p>
					{/if}
					<!-- The way back, and only for a mission a workout actually set. A
					     mission opened by hand belongs to no workout and is offered no
					     door out of a page nobody sent you to. -->
					{#if mission.blockId}
						<a class="mission-back" href="/session">back to the workout</a>
					{/if}
				</section>
			{/if}

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
								{#if fireworks && streak.best >= 3}
									&middot; best run {streak.best} in a row
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

			<!--
				The shelf, under the score and above the settings, and on screen
				whether or not anything is playing — a ladder you can only see once
				you are on it would be no use for deciding to get on it.
			-->
			{#if fireworks}
				<StreakBadges {shelf} {streak} chartName={seed.name} best={bestEver} {bestHere} />
			{/if}

			<!--
				Settings, underneath the thing they configure. Each panel keeps its
				sidebar-era width rather than stretching to fill the row — most end
				up stacked, and only pair up where the row has room to spare.
			-->
			{#if settingsOpen}
				<div
					class="setup-panel border-ground-line bg-ground-raised mt-5 flex flex-wrap gap-x-8 gap-y-6 rounded-xl border p-4"
				>
					<div class="w-60">
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

					<div class="w-60">
						<h2 class="panel-title">Tempo</h2>
						<div class="flex items-center gap-2">
							<button
								type="button"
								class="stepper"
								onclick={() => nudgeTempo(-5)}
								aria-label="Slower">−</button
							>
							<span class="font-mono text-ink flex-1 text-center text-3xl tabular-nums">{bpm}</span>
							<button
								type="button"
								class="stepper"
								onclick={() => nudgeTempo(5)}
								aria-label="Faster">+</button
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

					<div class="w-60">
						<h2 class="panel-title">Groove</h2>
						<!-- Three across rather than four: nine of them make a square, and
						     the longer names fit without being cramped. -->
						<div class="grid grid-cols-3 gap-1.5">
							{#each GROOVES as option (option.id)}
								<button
									type="button"
									class="chip justify-center"
									class:is-on={groove === option.id}
									title={option.notes}
									onclick={() => {
										groove = option.id;
										void restartIfPlaying();
									}}>{option.name}</button
								>
							{/each}
						</div>
						<p class="groove-note">{grooveSpec(groove).notes}</p>
					</div>

					<div class="w-60">
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

					<div class="w-60">
						<h2 class="panel-title">Fireworks</h2>
						<button
							type="button"
							class="chip w-full"
							class:is-on={fireworks}
							onclick={() => (fireworks = !fireworks)}
							aria-pressed={fireworks}
						>
							<span class="dot" class:is-lit={fireworks}></span>
							Sparks, glow and combos
						</button>
						<p class="text-ink-dim mt-2 text-xs leading-snug">
							Every chord tone you find throws off its own colour, and landing chords in a row
							lights the room up. The score underneath is the same either way.
						</p>
					</div>

					<div class="w-full">
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
				</div>
			{/if}
		</section>

		<!--
			The chord under study, kept on screen the whole time you are playing —
			this is the thing your eyes actually need mid-tune, so it does not
			compete with the setup panel or scroll out of view with the chart.
		-->
		<aside
			class="study-inspector lg:max-h-[calc(100dvh-8rem)] lg:sticky lg:top-20 lg:overflow-y-auto"
			aria-label="Chord study"
		>
			{#if focused && focusedBar && focusedStudy}
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

				<!-- The chord tones, and — while the track is running — which of them
				     you have actually played since this chord came round. -->
				<div
					class="degree-row"
					class:is-marking={marking}
					class:is-party={fireworks}
					bind:this={degreeRowEl}
					aria-label="Chord tones"
				>
					{#each focusedNotes as entry, i (i)}
						{@const pc = pitchClass(entry.note)}
						<div
							class="degree"
							data-degree={pc}
							class:is-played={litTones.has(pc)}
							style:--tone="var(--pc-{pc})"
							style:background="var(--pc-{pc})"
							style:color="var(--pc-{pc}-ink)"
						>
							<span class="degree-note">{formatNote(entry.note, { unicode: true })}</span>
							<span class="degree-number">{entry.degree}</span>
						</div>
					{/each}
				</div>

				<div class="study-keyboard">
					<span class="study-kicker">Under the hands</span>
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

				{#if focusedStudy.modulation}
					<p class="modulation-note">
						Key centre changes here: {formatStudyKey(focusedStudy.modulation.from)} &rarr;
						<strong>{formatStudyKey(focusedStudy.modulation.to)}</strong>
					</p>
				{/if}

				<div class="study-copy">
					<span class="study-kicker">In this song</span>
					<p>{focusedExplanation}</p>
				</div>

				<div class="study-options">
					<section>
						<h3>Try over it</h3>
						<!--
							Each suggestion is drawn as well as named. Which sharps and flats
							a scale actually gives you is a question about the keyboard, and
							"G♭ Lydian dominant" only answers it for someone who already
							knew. The chord tones are solid on the diagram and the rest of
							the scale is held back, so the same picture says both what is
							available and what is home — and each key carries its degree, so
							it also says what every note is doing there.
						-->
						<ul class="scale-list">
							{#each focusedStudy.scales as suggestion (suggestion.name)}
								{@const notes = scaleNotes(suggestion.root, suggestion.scale)}
								<li>
									<strong>{suggestion.name}</strong>
									<span>{suggestion.reason}</span>
									<ScaleKeys
										{notes}
										chordTones={focusedTones}
										label={describeScale(suggestion.name, notes)}
									/>
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
			{/if}
		</aside>
	</div>

	<!--
		The transport and score, pinned in the corner. The page is chart, then
		settings, then chord study, all stacked — this is the one control you
		should never have to scroll back up to reach.
	-->
	<div
		class="floating-transport"
		class:is-final={Boolean(lastRun)}
		class:is-lit={fireworks && streak.count >= 3}
		style:--glow={livePc === null ? 'var(--color-ink-dim)' : `var(--pc-${livePc})`}
		bind:this={transportEl}
	>
		<!--
			The combo, next to the honest number rather than instead of it. It only
			appears once a streak is real: two landed chords in a row happens inside
			any ii–V and is not an achievement.
		-->
		{#if fireworks && streak.count >= 2}
			{#key streak.count}
				<span class="floating-combo" aria-hidden="true">
					<b>{streak.count}×</b>
					{#if tier.name}<em>{tier.name}</em>{/if}
				</span>
			{/key}
		{/if}
		{#if playing || paused || lastRun}
			<span class="floating-accuracy">
				{shownAccuracy ?? '–'}{#if shownAccuracy !== null}<span class="floating-accuracy-unit"
						>%</span
					>{/if}
			</span>
		{/if}
		<button
			type="button"
			class="floating-play"
			onclick={toggle}
			aria-label={playing ? 'Pause' : paused ? 'Resume playing' : 'Play'}
			title={playing ? 'Pause' : paused ? 'Resume' : 'Play'}
		>
			<span aria-hidden="true">{counting ? '···' : playing ? '❚❚' : '▶'}</span>
		</button>
	</div>

	<!--
		The optional half of playing along: sparks, an edge glow in the colour of
		whatever chord is sounding, and a combo. Mounted whether or not it is
		switched on, because the page holds a handle on it rather than props —
		everything it does is fired at a moment rather than being state.
	-->
	<Fireworks
		enabled={fireworks}
		palette={colorMap}
		pc={livePc}
		intensity={tier.intensity}
		onready={(api) => (fx = api)}
	/>
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

	/*
	 * The words.
	 *
	 * Dim until the bar is playing and then lit, which needs no state of its own
	 * — `is-now` is already on the bar for the chord highlight, and the lyric
	 * simply reads it. The whole phrase lights at once rather than word by word,
	 * because bars are what the sheet aligned the words to and anything finer
	 * would be a guess dressed up as timing.
	 */
	.bar-lyric {
		margin: 0.5rem 0 0;
		padding-top: 0.45rem;
		border-top: 1px solid var(--color-ground-line);
		font-size: 0.82rem;
		line-height: 1.35;
		color: var(--color-ink-muted);
		text-wrap: balance;
		transition: color 120ms ease;
	}

	.bar-lyric.is-silent {
		/* Holds the line's height without claiming there are words here. */
		opacity: 0;
	}

	.bar.is-now .bar-lyric {
		color: var(--color-ink);
	}

	@media (prefers-reduced-motion: reduce) {
		.bar-lyric {
			transition: none;
		}
	}

	/* One line saying what the selected groove is, for whoever has not met the
	   word. It sits where the key panel's fourth row of chips would be, so the
	   two panels stay the same height. */
	.groove-note {
		margin-top: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		line-height: 1.45;
		color: var(--color-ink-dim);
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

	/* The form fields and their labels left with the chart importer: the editor
	   is a component now and carries its own. */

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
		/*
		 * What "scrolled into view" has to mean here.
		 *
		 * Above: below the sticky header, or the bar lands underneath it.
		 * Below: a whole row of bars further down than the bar itself, so the
		 * minimum scroll leaves the *next* row on screen. Landing the current
		 * bar flush against the bottom edge is technically in view and useless
		 * to read from — you play towards the next chord, not at this one.
		 */
		scroll-margin: 4.75rem 0 9rem;
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

	/*
	 * The chart with the fireworks on.
	 *
	 * The same information, turned up: the bar being played is lifted off the
	 * page and lit from behind in its own colour, and the exact chord announces
	 * itself as it arrives. Nothing here is new meaning — `is-now` and `is-live`
	 * already said both of these things quietly — so switching it off loses
	 * decoration and never a fact.
	 */
	/* On the bar rather than on `.is-now`, so it settles back down as smoothly as
	   it lifted when the music moves on. */
	.chart.is-party .bar {
		transition:
			background 90ms linear,
			border-color 90ms linear,
			opacity 160ms ease,
			box-shadow 220ms ease,
			transform 220ms var(--ease-wheel);
	}

	.chart.is-party .bar.is-now {
		transform: scale(1.02);
		border-color: color-mix(in oklab, var(--tint) 85%, var(--color-ink));
		box-shadow:
			0 0 0 1px color-mix(in oklab, var(--tint) 60%, transparent),
			0 6px 34px -6px var(--tint);
	}

	.chart.is-party .bar-chord.is-live {
		/* Runs once each time the class lands, which is once per chord — no
		   looping animation sitting on the compositor between changes. */
		animation: chord-arrive 480ms var(--ease-wheel);
	}

	@keyframes chord-arrive {
		0% {
			transform: scale(0.94);
			box-shadow: 0 0 0 0 color-mix(in oklab, var(--chord-tint) 80%, transparent);
		}
		45% {
			transform: scale(1.03);
		}
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 14px color-mix(in oklab, var(--chord-tint) 0%, transparent);
		}
	}

	/* A tone found lands rather than fades in, and keeps a halo in its own colour. */
	.degree-row.is-party.is-marking .degree.is-played {
		box-shadow:
			0 0 0 2px color-mix(in oklab, var(--color-ink) 55%, transparent),
			0 0 22px -2px var(--tone);
		animation: degree-found 420ms var(--ease-wheel);
	}

	@keyframes degree-found {
		0% {
			transform: scale(0.86) rotate(-3deg);
		}
		50% {
			transform: scale(1.12) rotate(2deg);
		}
		100% {
			transform: scale(1) rotate(0deg);
		}
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

	/*
	 * What was asked for, and how it went.
	 *
	 * Type sizes on the assumption of a screen most of a metre away, because this
	 * is the one thing on the page you are meant to read with your hands already
	 * on the keys. A met goal is drawn in full ink and a missed one in muted ink:
	 * weight rather than hue, and nothing goes red, because a mission short of its
	 * bar is a mission to play again and not a telling-off.
	 */
	.mission {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 1.25rem;
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 11px;
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}

	.mission-goal {
		color: var(--color-ink);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.4;
	}

	.mission-verdict {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.5;
	}

	.mission-verdict.is-met {
		color: var(--color-ink);
	}

	.mission-back {
		display: inline-block;
		margin-top: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		text-decoration: underline;
	}

	.mission-back:hover {
		color: var(--color-ink);
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
		.spread > span,
		.chart.is-party .bar {
			transition: none;
		}

		.chart.is-party .bar.is-now {
			transform: none;
		}
	}
	/*
	 * The chord study column. Narrow and permanent rather than wide and
	 * occasional, so everything in it stacks in one column by default — this
	 * used to be the >700px-wide layout's job; now the >700px layout is what
	 * the mobile stack always looked like, because the column never gets wider
	 * than the old mobile breakpoint.
	 */
	.study-inspector {
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
		padding: 1.1rem 1.15rem 1.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: color-mix(in oklab, var(--color-ground-raised) 55%, transparent);
	}

	.study-inspector-head {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.study-identity {
		display: flex;
		min-width: 0;
		align-items: flex-start;
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
		min-height: 2.5rem;
		align-items: center;
		gap: 0.45rem;
		padding: 0.45rem 0.55rem;
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

	.degree-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.study-keyboard {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.modulation-note {
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

	.study-copy p {
		margin-top: 0.35rem;
		color: var(--color-ink-muted);
		font-size: 0.88rem;
		line-height: 1.55;
	}

	.study-options {
		display: flex;
		flex-direction: column;
		border-block: 1px solid var(--color-ground-line);
	}

	.study-options > section,
	.context-details {
		padding: 1rem 0;
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
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		/* Roomier than the other lists: each entry now carries a drawing as well
		   as a line of prose, and three of them run together without it. */
		padding: 0.65rem 0 0.8rem;
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

	.scale-list :global(.scale-keys) {
		margin-top: 0.4rem;
	}

	.context-details {
		border-top: 1px solid var(--color-ground-line);
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
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 0.5rem 0.8rem;
		padding: 0.4rem 0;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 65%, transparent);
		color: var(--color-ink-dim);
		font-size: 0.7rem;
	}

	.context-row > :last-child {
		grid-column: 1 / -1;
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

	@media (max-width: 700px) {
		.tonal-centre {
			grid-template-columns: 1fr;
			gap: 0.15rem;
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

	/*
	 * The floating transport. A shortcut to the same `toggle`, not a second
	 * state machine — it exists purely so play/pause and the running score
	 * are reachable without a scroll, on a page that now has settings and a
	 * chord-study column between the chart and the foot of the page.
	 */
	.floating-transport {
		position: fixed;
		right: 1.25rem;
		bottom: 1.25rem;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--color-ground-line);
		background: color-mix(in oklab, var(--color-ground-raised) 92%, transparent);
		box-shadow: 0 8px 24px color-mix(in oklab, black 35%, transparent);
		backdrop-filter: blur(8px);
	}

	.floating-transport.is-final {
		border-color: var(--color-ink-dim);
	}

	/* Lit in the sounding chord's colour once a streak is running, which makes
	   the corner of the screen change colour with the harmony. */
	.floating-transport.is-lit {
		border-color: color-mix(in oklab, var(--glow) 70%, var(--color-ground-line));
		box-shadow:
			0 8px 24px color-mix(in oklab, black 35%, transparent),
			0 0 26px -4px var(--glow);
	}

	.floating-combo {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		padding-left: 0.75rem;
		line-height: 1;
		animation: combo-bump 320ms var(--ease-wheel);
	}

	.floating-combo b {
		color: var(--glow);
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 0 16px color-mix(in oklab, var(--glow) 60%, transparent);
	}

	.floating-combo em {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		font-style: normal;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	@keyframes combo-bump {
		0% {
			transform: scale(1.5) translateY(2px);
		}
		100% {
			transform: scale(1) translateY(0);
		}
	}

	.floating-accuracy {
		padding-left: 0.75rem;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
	}

	.floating-accuracy-unit {
		margin-left: 0.05rem;
		color: var(--color-ink-dim);
		font-size: 0.7rem;
	}

	.floating-play {
		display: flex;
		width: 2.75rem;
		height: 2.75rem;
		flex: none;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--color-ground-overlay);
		color: var(--color-ink);
		font-size: 1.1rem;
	}

	.floating-play:hover {
		background: var(--color-ink-dim);
		color: var(--color-ground);
	}

	@media (max-width: 640px) {
		.floating-transport {
			right: 0.85rem;
			bottom: 0.85rem;
		}
	}
</style>
