<script lang="ts">
	import { pitchClass } from '$lib/music/note';
	import { parseKey } from '$lib/music/key';
	import LandingPage from '$lib/components/LandingPage.svelte';
	import NetworkMap from '$lib/components/NetworkMap.svelte';
	import Roundel from '$lib/components/Roundel.svelte';
	import { network, stationOf } from '$lib/session/network';
	import {
		PROGRESSION_ANCHORS,
		neighbours,
		sayInKey,
		stageAtAccidentals,
		type Neighbour
	} from '$lib/curriculum/atlas';
	import { stageByKey, stationHolding, type RungId } from '$lib/curriculum/ladder';
	import type { WorkoutSize } from '$lib/session/workout';
	import { describeTasks, describeWhen } from '$lib/session/journey';
	import { scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	/*
	 * A stop arriving or leaving the board.
	 *
	 * The only motion on this page, and it is here because the row changes under
	 * a press: holding the run at one station takes two roundels off it, and
	 * three marks vanishing between frames reads as a redraw rather than as a
	 * consequence. Short, and from the mark's own centre, so it is the stop
	 * leaving rather than the row reflowing.
	 */
	const STOP_IN = { duration: 240, start: 0.5, opacity: 0, easing: cubicOut };

	/*
	 * Today: where does this go, and what does it call at?
	 *
	 * This page used to open with a banner naming the key you were "in". There is
	 * no such key. The ladder holds a *frontier* — a set of open cells, one count
	 * per rung — and `workingPosition()` invented a single point in it so the
	 * banner had something to print. Nothing gated on that point. It was the
	 * largest object on the screen and it was a fiction, and it is the reason
	 * "change scale" never matched what the questions then did.
	 *
	 * Three things replace it, and none of them needs a number that did not
	 * already exist:
	 *
	 *   - **A departure board.** A board does not claim you are anywhere. It says
	 *     what is leaving, from where, and what it calls at — which is exactly
	 *     what a workout is. The calling points come from `Makeup.keys`, which has
	 *     been computed all along and printed in a task's sub-line, and promoting
	 *     it to the second row turns the app's most confusing behaviour into its
	 *     plainest: *you pinned E♭; the train starts at E♭ and calls at everything
	 *     else you have opened.* `leadWithPinned` has always worked that way.
	 *
	 *   - **One drawing instead of three.** The banner named one key, every rung
	 *     row carried twelve pips for the frontier's breadth, and a strip of
	 *     twelve swatches carried the record's warmth. Three different facts in
	 *     one visual language, within a screen of each other. The network says all
	 *     three at once and says which is which.
	 *
	 *   - **Two verbs that never share a control.** *Travel* is free, unlimited
	 *     and moves nothing: every station on the built network is one press away.
	 *     *Open* is the only thing that changes the network. Browsing, pinning and
	 *     advancing used to look identical — three coloured key-shaped things with
	 *     three different consequences — and that was the whole of the confusion.
	 *
	 * The colour rule is unchanged and is now kept without exception: the only
	 * hues on this page are on stations and station roundels, and a station is a
	 * key. Tasks, lines, counts and moves are ink and weight.
	 */

	let { data } = $props();

	/* -- What is being pinned -------------------------------------------- */

	type Choice =
		{ kind: 'rung'; key: string; rung: string } | { kind: 'progression'; id: string; key: string };

	// svelte-ignore state_referenced_locally
	let size = $state<WorkoutSize>(data.size);

	/*
	 * What the board departs from, before anything on this page is pressed.
	 *
	 * Two answers, and which one applies is the difference between a control that
	 * works and one that looks broken. Ordinarily it is the ladder's own
	 * suggestion, so pressing Continue without touching anything does what it
	 * always did. **After a ladder move it is the cell that move opened** — you
	 * pressed *open the home chord at F* and the board leaves from the home chord
	 * at F, rather than from wherever `workingPosition()` now points.
	 *
	 * Seeded once and owned by the map from then on; a reload is what changes the
	 * suggestion, not a keystroke.
	 */
	// svelte-ignore state_referenced_locally
	let choice = $state<Choice>(
		data.opened
			? { kind: 'rung', key: data.opened.key, rung: data.opened.rungId }
			: { kind: 'rung', key: data.position.key, rung: data.position.rung.id }
	);

	/*
	 * Whether the run stays where it departs from.
	 *
	 * Off, always, on every load — because the ordinary run is the one that calls
	 * everywhere, and a switch that quietly remembered "C only" from a fortnight
	 * ago would be the app narrowing somebody's practice without being asked
	 * twice. It is a decision about *today*, taken beside the button that starts
	 * today.
	 */
	let stationOnly = $state(false);

	/*
	 * What is drawn on top of the network, and what is pinned, are separate
	 * things. Turning a layer on shows you something; it does not decide what you
	 * are about to practise. Pressing something does.
	 */
	let layers = $state({ record: true, today: true, crossings: false, progressions: false });

	/** Which progression the map is drawing. Pressing one in the list also pins it. */
	// svelte-ignore state_referenced_locally
	let shownProgression = $state<string>(data.progressions[0]?.id ?? '');

	/*
	 * The station being read, which is not always the station being left from.
	 *
	 * These were one thing and it was wrong. Pressing a station that is not on
	 * the network made it the departure, so a workout could be composed in a key
	 * holding no cards at all: the board said F, the questions came from C and G,
	 * and nothing on either page admitted the difference. A station you have not
	 * opened is a perfectly good thing to press — you want to know what it would
	 * take — it is just not somewhere a train can leave from.
	 */
	/**
	 * Whichever half of a relative pair was named, as the station holding it.
	 *
	 * The page used to work this out for itself off `data.stages`. It is
	 * `stationHolding` in the ladder now, because three other places wanted the
	 * same answer — the composer, when it narrows a run to one stop, and the
	 * workout page, when it says which station a question came from — and a fact
	 * about the map written down four times is four chances to disagree.
	 */
	const stationFor = (key: string) => stationHolding(key) ?? key;

	// svelte-ignore state_referenced_locally
	let selectedKey = $state<string>(
		// Opens on wherever today leaves from, so the panel and the board agree
		// before anything has been pressed. A workout in flight owns that answer,
		// unless a ladder move has just named a cell — then it is that cell's key,
		// and the panel below is already reading the station you asked about.
		stationFor(data.opened?.key ?? data.resume?.keyCenter ?? data.position.key)
	);

	const preview = $derived(data.previews[size] ?? []);
	const resuming = $derived(Boolean(data.resume));

	/*
	 * Whether the stops are on show.
	 *
	 * Open while a workout is in flight, because there the list is a record of
	 * how far you have got and the ticks are the whole of the answer to *where
	 * was I*. Shut before one starts, because there it is a description of what
	 * the button does and reading it is not a step on the way to pressing it.
	 */
	// svelte-ignore state_referenced_locally
	let showStops = $state(Boolean(data.resume));

	const stopCount = $derived(
		resuming ? (data.resume?.tasks.length ?? 0) : (data.previews[size]?.length ?? 0)
	);

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');
	const pcOf = (keyName: string) => pitchClass(parseKey(keyName.replace(/m$/, '')).tonic);
	const tint = (keyName: string) => `var(--pc-${pcOf(keyName)})`;
	const tintInk = (keyName: string) => `var(--pc-${pcOf(keyName)}-ink)`;

	/* -- The network ------------------------------------------------------ */

	const net = $derived(network(data.path, data.keys));

	/** The station being departed from. A workout in flight owns it; else the pin. */
	const departure = $derived(resuming ? (data.resume?.keyCenter ?? 'C') : choice.key);

	/** Whichever half of the relative pair was named, as a station. */
	const stationKey = $derived(
		data.stages.find((s) => s.key === departure || s.relativeMinor === departure)?.key ??
			data.stages[0].key
	);

	/** Where today's run leaves from, as a station. Always on the network. */
	const departureStation = $derived(stationOf(net, stationKey) ?? net.stations[6]);

	/** The station being read: the panel, and what the map's overlays are about. */
	const station = $derived(stationOf(net, selectedKey) ?? departureStation);

	const anchor = $derived.by(() => {
		const pinned: Choice = choice;
		return pinned.kind === 'progression' ? (PROGRESSION_ANCHORS[pinned.id] ?? null) : null;
	});

	/** Which line leads the queue. A progression leads with the rung that opens it. */
	const leadRung = $derived.by<RungId>(() => {
		const pinned: Choice = choice;
		if (pinned.kind === 'rung') return pinned.rung as RungId;
		return (anchor?.opensOn ?? data.position.rung.id) as RungId;
	});

	const leadLine = $derived(net.lines.find((l) => l.rungId === leadRung) ?? net.lines[0]);

	const shownAnchor = $derived(PROGRESSION_ANCHORS[shownProgression] ?? null);

	const chosenProgression = $derived.by(() => {
		const pinned: Choice = choice;
		if (pinned.kind !== 'progression') return undefined;
		return data.progressions.find((p) => p.id === pinned.id);
	});

	/* -- Travel: pressing the map ----------------------------------------- */

	/**
	 * Pressing a station makes it the departure — any station, always.
	 *
	 * **This was briefly wrong and the correction matters.** A first pass refused
	 * to depart from a station the ladder had not opened, on the reasoning that a
	 * key with no cards is not somewhere a train can leave from. The reasoning was
	 * sound and the premise was false: `startWorkout` calls `cardsForRung` for
	 * whatever the picker pinned before it composes anything, so every one of the
	 * eighty-four cells has always been startable and the cards are made on the
	 * way out. The README has said so since the picker existed, and refusing it
	 * quietly deleted the whole point of *exploring and advancing are separate
	 * decisions*.
	 *
	 * What was actually broken was quieter: `earQueue` led with the pinned skill
	 * and ignored the pinned key, so pinning F and departing asked about G. That
	 * is fixed where it lives, and the map is free to let you go anywhere again.
	 */
	function goTo(key: string) {
		const pinned: Choice = choice;
		selectedKey = key;

		if (pinned.kind === 'progression') {
			choice = { kind: 'progression', id: pinned.id, key: keyFor(pinned.id, key) };
			return;
		}

		choice = { kind: 'rung', key, rung: pinned.rung };
	}

	/** Pressing a line leads with it, wherever the departure happens to be. */
	function lead(rungId: RungId) {
		choice = { kind: 'rung', key: selectedKey, rung: rungId };
	}

	/** Pressing an intersection pins both at once, which is one cell of the frontier. */
	const goToCell = (key: string, rungId: RungId) => {
		choice = { kind: 'rung', key, rung: rungId };
		selectedKey = key;
	};

	/** A minor progression is practised in the relative minor, not the major. */
	const keyFor = (id: string, stageKey: string) => {
		const progression = data.progressions.find((p) => p.id === id);
		if (progression?.mode !== 'minor') return stageKey;
		return data.stages.find((s) => s.key === stageKey)?.relativeMinor ?? stageKey;
	};

	function pickProgression(id: string) {
		shownProgression = id;
		choice = { kind: 'progression', id, key: keyFor(id, stationKey) };
		selectedKey = stationKey;
	}

	/**
	 * Whether the pin is still the one the ladder made.
	 *
	 * The seed and the pin are the same object, so nothing recorded which of the
	 * two you were looking at — press a station out of curiosity and the button
	 * quietly stopped offering the day the ladder had composed, with no way back
	 * short of a reload. This is the flag that says so, and `followSuggestion` is
	 * the way back.
	 */
	const suggested = $derived(
		choice.kind === 'rung' &&
			choice.key === data.position.key &&
			choice.rung === data.position.rung.id
	);

	function followSuggestion() {
		choice = { kind: 'rung', key: data.position.key, rung: data.position.rung.id };
		selectedKey =
			data.stages.find(
				(stage) => stage.key === data.position.key || stage.relativeMinor === data.position.key
			)?.key ?? data.position.key;
	}

	function toggle(layer: keyof typeof layers) {
		layers[layer] = !layers[layer];
		// The band above the stations answers one question at a time.
		if (layer === 'crossings' && layers.crossings) layers.progressions = false;
		if (layer === 'progressions' && layers.progressions) layers.crossings = false;
	}

	/* -- The board -------------------------------------------------------- */

	/**
	 * Calling points, with the pin at the front.
	 *
	 * The previews are composed before anything is pinned, so these are what else
	 * is due rather than a promise about a queue that has not been built. Putting
	 * the pinned key first is not a guess: `leadWithPinned` puts it first.
	 */
	const leadName = $derived(
		choice.kind === 'progression' ? (chosenProgression?.name ?? '') : (leadLine?.label ?? '')
	);

	const leadOpenHere = $derived.by(() => {
		if (choice.kind === 'rung') return (leadLine?.index ?? 0) < departureStation.lines;
		const at = anchor?.lineIndex;
		return at !== null && at !== undefined && at < departureStation.lines;
	});

	const calls = $derived.by(() => {
		// A workout in flight knows its own calling points exactly.
		if (resuming) return (data.resume?.calls ?? []).slice(0, 6);

		// Kept at one station, the board can say so exactly rather than trim a
		// list: `composeWorkout` filters the whole bank to this stop before it
		// builds a single queue.
		if (stationOnly) return [choice.key];

		/*
		 * The departure goes first because the queue really does start there.
		 * `startWorkout` makes the pinned cell's cards before it composes,
		 * `earQueue` enters the pinned rung through its key and `functionQueue`
		 * leads its round-robin with the same one — so this is a guarantee rather
		 * than a hope, whether or not the ladder has been here yet.
		 */
		const listed = data.calls[size] ?? [];
		const lead = choice.key;
		return [lead, ...listed.filter((key: string) => key !== lead)].slice(0, 6);
	});

	/**
	 * The stops the *leading line* actually has, out of everything the run calls at.
	 *
	 * The question this page had never answered, and the one that reads as a bug
	 * every time somebody asks it: pin **the relative minor**, which is open in C
	 * and nowhere else, and the board still lists F and G. Both facts are true —
	 * the line calls at C, and the run goes on into F and G on other lines,
	 * because `leadWithPinned` gives the pin half the queue and fills the rest
	 * from every open cell. Nothing on the board joined them, so the row looked
	 * like a promise the line could not keep.
	 */
	const leadStops = $derived.by(() => {
		/*
		 * A run in flight leads with the line it was composed around, which is not
		 * the one the map is pinned to: the pin re-seeds from the ladder's own
		 * suggestion on every load, and the run has been fixed since it departed.
		 */
		const run = resuming ? (data.resume?.choice ?? null) : null;
		if (run) {
			if (run.kind === 'rung') {
				return net.lines.find((line) => line.rungId === run.rungId)?.keys ?? [];
			}
			const at = PROGRESSION_ANCHORS[run.progressionId]?.lineIndex;
			return at === null || at === undefined ? [] : (net.lines[at]?.keys ?? []);
		}

		if (choice.kind === 'rung') return leadLine?.keys ?? [];
		const at = anchor?.lineIndex;
		return at === null || at === undefined ? [] : (net.lines[at]?.keys ?? []);
	});

	/** Calling points the leading line has. These get the track. */
	const onLine = $derived(calls.filter((key: string) => leadStops.includes(key)));

	/** And the ones it does not, which stand off it. Empty is the quiet case. */
	const otherLines = $derived(calls.filter((key: string) => !leadStops.includes(key)));

	/** The station a calling point belongs to, so the board draws the map's own roundel. */
	const stationAt = $derived((key: string) => stationOf(net, stationFor(key)) ?? null);

	const resumeAt = $derived(
		data.resume ? Math.max(0, Math.min(data.resume.at, data.resume.tasks.length - 1)) : 0
	);

	const heldMission = $derived(data.missionHeld ?? null);
	const heldBy = $derived(
		(heldMission?.teaches ?? [])
			.slice(0, 2)
			.map((id: string) => data.progressions.find((p) => p.id === id))
			.filter((p): p is (typeof data.progressions)[number] => p !== undefined)
	);

	/* -- The detail panel -------------------------------------------------- */

	const crossingsHere = $derived.by((): Neighbour[] => {
		const stage = stageByKey(selectedKey);
		return stage ? neighbours(stage) : [];
	});

	/**
	 * The line that would take the station you are reading as its next stop.
	 *
	 * `network()` only sets `next` where `widen` would actually allow it, so this
	 * is a move that exists rather than one the diagram merely drew. Null when
	 * nothing can reach this station yet, which is a different sentence and gets
	 * one below.
	 */
	const opensHere = $derived(net.lines.find((line) => line.next?.key === selectedKey) ?? null);

	/**
	 * Which keys the network has to pass through before it can get here.
	 *
	 * The ladder opens keys in its own order and will not skip one, so a station
	 * three steps out is three steps out. Saying *the scale gets here after B♭
	 * and E♭* is the honest version of a dashed circle with no button under it.
	 */
	const reachAfter = $derived.by(() => {
		if (station.onNetwork || opensHere) return [];
		const first = net.lines[0];
		return data.stages.slice(first.stops, station.stageIndex).map((stage) => stage.key);
	});

	const byLevel = $derived(
		Object.entries(data.progressionLevels).map(([level, name]) => ({
			level: Number(level),
			name,
			items: data.progressions.filter((p) => p.level === Number(level))
		}))
	);

	const LAYERS = [
		{ id: 'record' as const, label: 'Record' },
		{ id: 'today' as const, label: "Today's run" },
		{ id: 'crossings' as const, label: 'Crossings' },
		{ id: 'progressions' as const, label: 'Progressions' }
	];

	/*
	 * What the button is about to do, in one line.
	 *
	 * It says the same thing the *Leading* row said, which is why that row is
	 * gone: a fact about the press belongs on the press, and printing it twice
	 * within an inch of itself was half of why the board read as a form.
	 */
	const summary = $derived.by(() => {
		const pinned: Choice = choice;
		return pinned.kind === 'rung'
			? `${glyph(pinned.key)} · ${leadName}`
			: `${leadName} in ${glyph(pinned.key)}`;
	});
</script>

<svelte:head>
	<title
		>{data.public
			? 'Harmonic Trainer — see, hear, drill and apply harmony'
			: 'Harmonic Trainer'}</title
	>
	{#if data.public}
		<meta
			name="description"
			content="An open-source, instrument-first practice tool for seeing, hearing and mastering chord progressions in every key."
		/>
		<meta property="og:title" content="Harmonic Trainer" />
		<meta
			property="og:description"
			content="See harmony move. Hear it. Drill it in every key. Apply it at your instrument."
		/>
		<meta property="og:type" content="website" />
		<meta name="twitter:card" content="summary" />
	{/if}
</svelte:head>

<!--
	What a task is made of, in two or three words. Ink and weight, never colour:
	none of this is a pitch.
-->
{#snippet tags(labels: string[])}
	{#if labels.length}
		<span class="task-tags">
			{#each labels as label (label)}
				<span class="task-tag">{label}</span>
			{/each}
		</span>
	{/if}
{/snippet}

{#if data.public}
	<LandingPage />
{:else}
	<main class="mx-auto flex max-w-5xl flex-col gap-7 px-5 py-7">
		<!--
			The board.

			It does not say where you are, because there is nowhere to be. It says
			what is leaving, from which station, on which line, and what it calls at
			on the way — every one of which is a field the composer already fills in.
		-->
		<section class="board" style:--tint={tint(stationKey)} style:--tint-ink={tintInk(stationKey)}>
			<div class="board-head">
				<span class="label">{resuming ? 'In progress' : 'Next departure'}</span>
				<span class="label"
					>{resuming
						? `task ${resumeAt + 1} of ${data.resume?.tasks.length}`
						: `${size} · ${preview.length} stops`}</span
				>
			</div>

			<!--
				The go row: the one thing to press, and the station it leaves from.

				This used to be the last thing on the board, under four rows naming the
				exercises. A player who only wants to carry on had to read a menu to
				find the control that means *do not make me choose* — so the control
				comes first now, and the menu is one press away below it.
			-->
			<div class="go">
				<div class="board-origin">
					<!-- The map's own roundel, at the size of a headline. The board used
					     to draw its origin as a filled disc and the map draws stations as
					     a ring with the record inside it, which is two drawings of one
					     key within a screen of each other — the exact fault the network
					     was built to end. -->
					<Roundel
						inline
						size={3.4}
						name={stationKey}
						pc={departureStation.pc}
						fill={departureStation.fill}
						built={departureStation.onNetwork}
						departs
						title="Departs {glyph(stationKey)}"
					/>
					<span class="origin-names">
						<span class="origin-major">{glyph(stationKey)}</span>
						<span class="origin-minor">with {glyph(departureStation.relativeMinor)}</span>
					</span>
				</div>

				<form method="POST" action="?/start" class="go-form">
					<input type="hidden" name="size" value={size} />
					<input
						type="hidden"
						name="progression"
						value={choice.kind === 'progression' ? choice.id : ''}
					/>
					<input
						type="hidden"
						name="progressionKey"
						value={choice.kind === 'progression' ? choice.key : ''}
					/>
					<input type="hidden" name="focusKey" value={choice.kind === 'rung' ? choice.key : ''} />
					<input type="hidden" name="focusRung" value={choice.kind === 'rung' ? choice.rung : ''} />
					{#if stationOnly}
						<input type="hidden" name="stationOnly" value="on" />
					{/if}

					<button type="submit" class="start">
						<span class="start-text">
							<span class="start-verb">{resuming ? 'Carry on' : 'Continue'}</span>
							<span class="start-what">
								{#if resuming}
									{glyph(data.resume?.keyCenter ?? '')} · task {resumeAt + 1} of {data.resume?.tasks
										.length}
								{:else}
									{summary}
									<!-- Ahead of the ladder is not the same as unavailable: the
									     cards are made on the way out. Said on the button rather
									     than in a row above it, because it is a fact about the
									     press and about nothing else. -->
									{#if !leadOpenHere}· ahead of the ladder{/if}
								{/if}
							</span>
						</span>
						<span class="start-go" aria-hidden="true">→</span>
					</button>
				</form>
			</div>

			<!--
				What the map has pinned, while a run in flight owns the board.

				The board belongs to the workout that is open — `departure` reads
				`resume.keyCenter` and the button says *Carry on* — so pressing the map
				changed the panels below and nothing at the top, which is the report
				*clicking doesn't affect the button above* almost word for word. It is
				not a bug in the map and it is not something to silently allow: the run
				was composed already and its queues are card ids. So the press is
				answered where it was made, and the way to act on it is named.
			-->
			{#if resuming && !suggested}
				<p class="pinned">
					The map is pinned to <strong>{summary}</strong>. The run above was composed already — stop
					it, and that is what departs next.
				</p>
			{/if}

			<dl class="board-rows">
				<div class="board-row">
					<dt>Calls at</dt>
					<dd>
						<!--
							Which of these the leading line has, and which are somewhere else,
							said in track rather than in prose.

							The oldest question this board could not answer. Pin the relative
							minor — open in C and nowhere else — and the row still lists F and
							G, because `leadWithPinned` gives the pin half the queue and takes
							the rest from every open cell. Both facts are true and nothing
							joined them, so the row read as the line making a promise it could
							not keep.

							It was a sentence for an afternoon, and a sentence is the wrong
							shape for it: the map three inches below already draws stops on a
							line as connected and stops elsewhere as not. **Track means this
							line.** So the leading line's calling points sit on a piece of
							track and the rest stand off it, in the grammar the reader has
							already been taught, and the explanation goes where explanations
							go. See ROADMAP.md.
						-->
						<span class="calls">
							<span class="leg">
								{#each onLine as key, i (key)}
									{@const at = stationAt(key)}
									<span class="call" transition:scale={STOP_IN}>
										<Roundel
											inline
											size={2.15}
											name={key}
											pc={pcOf(key)}
											fill={at?.fill ?? 0}
											built={at?.onNetwork ?? true}
											departs={key === choice.key}
											linkLeft={i > 0}
											linkRight={i < onLine.length - 1}
											title="{glyph(key)} — on the leading line"
										/>
									</span>
								{/each}
							</span>

							{#if otherLines.length}
								<span class="elsewhere">
									{#each otherLines as key (key)}
										{@const at = stationAt(key)}
										<span class="call" transition:scale={STOP_IN}>
											<Roundel
												inline
												size={2.15}
												name={key}
												pc={pcOf(key)}
												fill={at?.fill ?? 0}
												built={at?.onNetwork ?? true}
												title="{glyph(key)} — on another line"
											/>
										</span>
									{/each}
								</span>
							{/if}
						</span>
					</dd>
				</div>
				{#if data.due > 0 && !resuming}
					<div class="board-row">
						<dt>Due</dt>
						<dd class="dim">{data.due} questions the schedule has come round to</dd>
					</div>
				{/if}
			</dl>

			<!--
				The small choices, under the big one.

				How long, how to get back to the suggestion once the map has been
				pressed, and whether to read the stops at all. None of them has to be
				touched for the button above to do something sensible.
			-->
			<div class="choices">
				{#if resuming}
					<form method="POST" action="?/end">
						<button class="quiet is-exit">
							{data.resume?.complete ? 'close it and start another' : 'stop this workout'}
						</button>
					</form>
				{:else}
					<div class="sizes" aria-label="How long">
						{#each ['short', 'standard', 'long'] as const as option (option)}
							<button
								type="button"
								class="size"
								class:is-selected={size === option}
								aria-pressed={size === option}
								onclick={() => (size = option)}
								>{option} · {data.previews[option]?.length ?? 0}</button
							>
						{/each}
					</div>

					<!--
						The way back out of a choice, which the map had no way of undoing.

						Pressing a station or a line pins it and the button above changes
						with it, which is the point of the map. What was missing was the
						other direction: nothing said the pin had moved off the ladder's
						own suggestion, and only a reload put it back.
					-->
					<!--
						The one control that narrows anything, and it narrows a place
						rather than a subject.

						`leadWithPinned` has always led and never narrowed, and the note
						there gives the reason: a workout that orbits one skill is the cage
						the picker was built to open. That argument is about *skills*. It
						was silently deciding for keys too, and "today, only C" is an
						ordinary thing to want in the week you meet a key — especially the
						week after opening a rung that exists in one key and nowhere else.

						Named for the map, because that is where the answer is drawn: the
						run stays at this station, which is a key and its relative minor.
					-->
					<button
						type="button"
						class="scope"
						class:is-on={stationOnly}
						aria-pressed={stationOnly}
						onclick={() => (stationOnly = !stationOnly)}
						>{stationOnly ? `staying at ${glyph(choice.key)}` : 'stay at this station'}</button
					>

					{#if !suggested}
						<button type="button" class="quiet" onclick={followSuggestion}
							>back to the suggestion</button
						>
					{/if}
				{/if}

				<button
					type="button"
					class="disclose"
					aria-expanded={showStops}
					onclick={() => (showStops = !showStops)}
				>
					{showStops ? 'hide the stops' : `the ${stopCount} stops`}
					<span class="caret" class:is-open={showStops}>▾</span>
				</button>
			</div>

			<!-- The stops: what today is actually made of. Folded away because it is
			     a description of the press above and not a decision to be taken. -->
			{#if showStops}
				<ol class="stops">
					{#each resuming ? (data.resume?.tasks ?? []) : preview as item, i (i)}
						<li
							class="stop"
							class:is-done={resuming && data.resume?.tasks[i]?.finished}
							class:is-next={resuming && i === resumeAt}
						>
							<span class="stop-n">{resuming && data.resume?.tasks[i]?.finished ? '✓' : i + 1}</span
							>
							<span class="min-w-0 flex-1">
								<span class="stop-title">{item.title}</span>
								<span class="stop-line">{item.line}</span>
								{@render tags(item.tags)}
							</span>
						</li>
					{/each}
				</ol>
			{/if}

			<!-- No play-along yet, and why. Not a lock: a thing you have not been
			     shown, and where to go and be shown it. -->
			{#if heldMission && !resuming}
				<!--
					The nearest tune, and the one step between here and it.

					It used to end *learn major in I – IV – V – I or I – V – vi – IV*,
					naming progressions that need the same shape they were offered to
					teach — advice nobody could take, on the one line a new player reads
					before pressing Continue. The ladder is what teaches a shape from
					nothing, so where a rung teaches it the rung is named, and the
					progressions are what is left for a gap the ladder has already
					covered.
				-->
				<p class="held">
					<strong>Play-along next: {heldMission.chartName}.</strong>
					Learn {heldMission.needs}
					{#if heldMission.opens}
						— that is <strong>{heldMission.opens.label.toLowerCase()}</strong>, the next step below.
					{:else if heldBy.length}
						in {heldBy.map((p) => p.name).join(' or ')}.
					{:else}
						on the network.
					{/if}
				</p>
			{/if}
		</section>

		<!--
			The network.

			The whole state, nothing folded away. It replaced three drawings of the
			twelve keys that meant three different things; press anything on it to
			move the board.
		-->
		<section class="network" aria-label="The network">
			<div class="section-head">
				<h2 class="label">The network</h2>
				<p class="stat">
					{net.cells} of {net.total} cells open · {net.lines.filter((l) => l.stops > 0).length} of {net
						.lines.length} lines · {net.lines[0].stops} of {data.stages.length} stations
					{#if data.totals.reviews > 0}
						· {data.totals.correct.toLocaleString()} of {data.totals.reviews.toLocaleString()} right so
						far
					{/if}
				</p>
			</div>

			<!--
				What pressing it does, said once, above it.

				The board is now a single button and reads as the whole of the page's
				offer, so the map underneath had to say that it is a control and not a
				diagram. Three sentences because there are exactly three gestures, and
				the third is the one nobody found: a crossing is pressable whether or
				not the ladder has been there.
			-->
			<p class="how">
				Press a <strong>station</strong> to depart from that key, a
				<strong>line</strong> to lead with that idea, or a
				<strong>crossing</strong> of the two for both at once — open or not. Nothing here is locked; the
				cards are made on the way out.
			</p>

			<div class="layers" aria-label="What the map shows">
				{#each LAYERS as layer (layer.id)}
					<button
						type="button"
						class="chip"
						class:is-on={layers[layer.id]}
						aria-pressed={layers[layer.id]}
						onclick={() => toggle(layer.id)}>{layer.label}</button
					>
				{/each}
			</div>

			<div class="map-scroll">
				<NetworkMap
					{net}
					departureKey={stationKey}
					{selectedKey}
					pinnedRung={leadRung}
					{layers}
					progression={layers.progressions ? shownAnchor : null}
					callsAt={calls}
					heldAt={(resuming ? data.resume?.stationOnly : stationOnly) ? stationKey : null}
					onstation={goTo}
					online={lead}
					oncell={goToCell}
				/>
			</div>

			<!-- The progression list, which is now the index into a layer of the map
			     rather than a second place to choose from. -->
			{#if layers.progressions}
				<div class="picker">
					{#each byLevel as group (group.level)}
						{#if group.items.length}
							<div class="picker-group">
								<span class="label">{group.name}</span>
								<div class="picker-row">
									{#each group.items as progression (progression.id)}
										{@const at = PROGRESSION_ANCHORS[progression.id]}
										<button
											type="button"
											class="chip"
											class:is-on={shownProgression === progression.id}
											aria-pressed={shownProgression === progression.id}
											title={at.lineIndex === null
												? 'No rung builds this one'
												: `Opens on ${data.rungs[at.lineIndex].label.toLowerCase()}`}
											onclick={() => pickProgression(progression.id)}>{progression.name}</button
										>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}

			<ul class="legend">
				<li><i class="mark-track"></i>A line — one rung, one idea</li>
				<li><i class="mark-spine"></i>A station — one key, in its tonic's colour</li>
				<li><i class="mark-stub"></i>Not built — one stop away</li>
				<li><i class="mark-empty"></i>Opened, never played</li>
				<li><i class="mark-full"></i>Filled by what the record holds</li>
			</ul>
		</section>

		<!--
			Two panels: what is selected, and the one verb that changes the map.

			Travel is the map above and costs nothing. Opening is here, on its own,
			in its own words — which is the whole of the fix for three controls that
			used to look identical and do different things.
		-->
		<div class="panels">
			<section class="panel" aria-label="Selected">
				{#if layers.progressions && shownAnchor}
					{@const progression = data.progressions.find((p) => p.id === shownProgression)}
					<div class="panel-head">
						<span class="label">Progression</span>
						<span class="label"
							>{shownAnchor.lineIndex === null
								? 'no rung builds it'
								: net.lines[shownAnchor.lineIndex].stops === 0
									? 'its line is not open yet'
									: `playable at ${net.lines[shownAnchor.lineIndex].stops} of ${
											data.stages.length
										}`}</span
						>
					</div>
					<h3 class="panel-title">{progression?.name}</h3>
					<p class="panel-line">{progression?.describes}</p>
					<p class="panel-line dim">
						{shownAnchor.lineIndex === null
							? 'No rung on the ladder builds every chord in it.'
							: `Opens on ${data.rungs[shownAnchor.lineIndex].label.toLowerCase()}.`}
					</p>

					<ul class="rows">
						{#if shownAnchor.borrows.length === 0}
							<li class="row">
								<span>Every chord is at home</span><span class="dim">never leaves the station</span>
							</li>
						{:else}
							{#each shownAnchor.borrows as borrow (borrow.symbol)}
								<!--
									Said in the key the departure is actually in. The anchors are
									worked out in C, so both halves of this row have to move with
									the station — the chord and the station it comes from. Moving
									one and not the other would be worse than moving neither.
								-->
								{@const source = borrow.from
									? stageAtAccidentals(borrow.from.accidentals + station.accidentals)
									: null}
								<li class="row">
									<span class="row-key" style:--tint={source ? tint(source.key) : 'transparent'}>
										{#if source}<i></i>{/if}{glyph(sayInKey(borrow.symbol, station.accidentals))}
									</span>
									<span class="dim">
										{#if source && borrow.from}
											from {glyph(source.key)} · {borrow.stops}
											{borrow.stops === 1 ? 'stop' : 'stops'}
											{borrow.from.accidentals < 0 ? 'flat' : 'sharp'}
										{:else}
											no key builds it
										{/if}
									</span>
								</li>
							{/each}
						{/if}
					</ul>
				{:else if layers.crossings}
					<div class="panel-head">
						<span class="label">Crossings from {glyph(selectedKey)}</span>
						<span class="label">the near four</span>
					</div>
					<ul class="rows">
						{#each crossingsHere as crossing (crossing.relation)}
							<li class="row">
								<span class="row-key" style:--tint={tint(crossing.stage.key)}>
									<i></i>the {crossing.relation} — {glyph(crossing.label)}
								</span>
								<span class="dim">
									{#if crossing.stops === 0}
										cross the platform · no note moves
									{:else if crossing.relation === 'parallel'}
										three stops flat · lives at {glyph(crossing.stage.key)}
									{:else}
										one stop {crossing.relation === 'dominant' ? 'sharp' : 'flat'}
									{/if}
								</span>
							</li>
						{/each}
					</ul>
					<p class="panel-line dim">
						The parallel comes last of the four because it shares a name and not a neighbourhood.
					</p>
				{:else}
					<div class="panel-head">
						<span class="label">Station</span>
						<span class="label"
							>{station.onNetwork
								? `${station.lines} of ${net.lines.length} lines`
								: 'ahead of the ladder'}</span
						>
					</div>
					<div class="board-origin">
						<span
							class="origin-roundel"
							class:is-unbuilt={!station.onNetwork}
							style:--tint={tint(selectedKey)}
							style:--tint-ink={tintInk(selectedKey)}>{glyph(selectedKey)}</span
						>
						<span class="origin-names">
							<span class="origin-major">{glyph(selectedKey)} major</span>
							<span class="origin-minor"
								>platform 2 · {glyph(station.relativeMinor)} — the same seven notes</span
							>
							<span class="origin-minor">{data.stages[station.stageIndex].note}</span>
						</span>
					</div>

					<ul class="rows">
						{#each net.lines as line (line.rungId)}
							{@const open = line.index < station.lines}
							{@const next = line.next?.key === selectedKey}
							<li class="row" class:is-shut={!open}>
								<span class="row-key" style:--tint={tint(selectedKey)}>
									<i class:is-hollow={!open}></i>{line.label}
								</span>
								<span class="dim"
									>{open ? 'calls here' : next ? 'one stop away' : 'ahead of the ladder'}</span
								>
							</li>
						{/each}
					</ul>

					<p class="panel-line dim">
						{station.fresh
							? station.onNetwork
								? 'Opened, never played.'
								: 'The ladder has not been here. You can still depart from it — the cards are made on the way out.'
							: `${station.chords.toLocaleString()} chords in the record.`}
					</p>
				{/if}
			</section>

			<!--
				Opening. The only thing on this page that changes what exists.

				Deliberately unguarded and deliberately separate: travelling anywhere
				on the built network costs nothing and moves nothing, and this is the
				one control that does. Nothing here is a lock — the ladder suggests.
			-->
			<section class="panel" aria-label="Open and close">
				<div class="panel-head">
					<span class="label">Open · close</span>
					<span class="label">at {glyph(selectedKey)}</span>
				</div>

				<!--
						The move that puts the station you are reading on the network, named
						for that station rather than for whichever line the ladder would
						have picked. This is the control that was missing: the map drew a
						dashed stop, there was no way to take it, and the only button on
						offer widened somewhere else entirely.
					-->
				<div class="moves">
					{#if opensHere}
						<form method="POST" action="?/widen">
							<input type="hidden" name="rung" value={opensHere.rungId} />
							<button class="move is-suggested">
								Open {opensHere.label.toLowerCase()} at {glyph(selectedKey)}
							</button>
						</form>
					{:else if data.canWiden && data.widenTo}
						<form method="POST" action="?/widen">
							<input type="hidden" name="rung" value={data.widenTo.rung.id} />
							<button class="move" class:is-suggested={data.progress.readyToMoveOn}>
								Open {data.widenTo.rung.label.toLowerCase()} at {glyph(data.widenTo.key)}
							</button>
						</form>
					{/if}

					{#if data.canDeepen && data.deepenTo?.rung}
						<form method="POST" action="?/deepen">
							<button class="move" class:is-suggested={data.progress.readyToMoveOn}>
								Open the next line — {data.deepenTo.rung.label.toLowerCase()}
							</button>
						</form>
					{/if}

					<form method="POST" action="?/back">
						<button class="quiet" disabled={!data.canStepBack}>close the last stop</button>
					</form>
				</div>

				<p class="panel-line dim">
					{#if reachAfter.length}
						The ladder does not skip: {net.lines[0].label.toLowerCase()} reaches {glyph(
							selectedKey
						)} after {reachAfter.length > 3
							? `${reachAfter.length} more stations`
							: reachAfter.map((key) => glyph(key)).join(', ')}. Departing from it does not wait for
						that.
					{:else if opensHere}
						{station.onNetwork
							? `One stop away — it would put ${opensHere.label.toLowerCase()} at ${glyph(selectedKey)}.`
							: `One stop away. Open it and ${glyph(selectedKey)} joins the network.`}
					{:else if !data.canWiden && !data.canDeepen}
						Every line, at all twelve stations. There is nowhere left to open.
					{:else if data.progress.looksSolid}
						{glyph(data.position.key)} · {data.position.rung.label.toLowerCase()} looks solid.
					{:else if data.progress.readyToMoveOn}
						{data.progress.reviews} questions on {data.position.rung.label.toLowerCase()}. The next
						idea is here whenever you want it.
					{:else}
						Your call — nothing on the map is locked. Opening a line also adds a stop to every line
						above it, which is why the whole shape grows.
					{/if}
				</p>

				<!--
						Opening during a workout is allowed, and the first draft of this
						panel refused it on a reason that turned out to be wrong. A
						workout's queues are card ids, decided when it was composed and
						stored in `plan_json`; opening a line writes a frontier and creates
						cards, and touches neither. The run in flight is unchanged and the
						new ground is there for the next one. Refusing it meant somebody
						who noticed mid-practice that they wanted F had to stop the
						workout to say so.
					-->
				{#if resuming}
					<p class="panel-line dim">
						The run above is already composed, so this changes nothing in it — the new ground is
						there for the next one.
					</p>
				{/if}
			</section>
		</div>

		<!--
			What the last few days were made of. Not a streak, and nothing here can
			fall while you are away from the piano.
		-->
		<section class="history" aria-label="Recent practice">
			<div class="section-head">
				<h2 class="label">Recently practised</h2>
				<a class="stat hover:text-ink transition-colors" href="/profile">the whole record →</a>
			</div>

			{#if data.history.length}
				<ol class="days">
					{#each data.history as past (past.id)}
						<li class="day">
							<span class="day-when">{describeWhen(new Date(past.startedAt))}</span>
							<span class="day-key" style:--tint={tint(past.keyCenter)}>
								{glyph(past.keyCenter)}
							</span>
							<span class="day-what">{describeTasks(past.titles)}</span>
							<span class="day-count">{past.finished}/{past.total}</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="panel-line dim">
					Nothing yet. Whatever departs from the board above will be the first thing here.
				</p>
			{/if}
		</section>
	</main>
{/if}

<style>
	.label {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-ink-dim);
	}

	.dim {
		color: var(--color-ink-dim);
	}

	.section-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem 1rem;
	}

	.stat {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	/* ---------------------------------------------------------------------
	 * The board
	 *
	 * The one large object on the page, and it makes no claim about where you
	 * are. The only colour on it is the origin roundel, because that is a key.
	 * ------------------------------------------------------------------- */
	.board {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.15rem 1.15rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 16px;
		background: var(--color-ground-raised);
	}

	.board-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--color-ground-line);
	}

	/*
	 * The go row.
	 *
	 * The station is what is leaving from, the button is the leaving, and they
	 * sit on one line so that the first thing under the board's own name is the
	 * thing to press. The button takes the space that is left and stops growing
	 * before it turns into a banner.
	 */
	.go {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.9rem 1.6rem;
	}

	.go-form {
		flex: 1 1 17rem;
		max-width: 30rem;
	}

	.board-origin {
		display: flex;
		align-items: center;
		gap: 0.85rem;
	}

	.origin-names {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.1rem;
	}

	.origin-major {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 600;
		letter-spacing: -0.025em;
		line-height: 1.05;
		color: var(--color-ink);
	}

	.origin-minor {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-dim);
	}

	.board-rows {
		display: flex;
		min-width: 0;
		flex-direction: column;
		margin: 0;
	}

	.board-row {
		display: grid;
		grid-template-columns: 4.6rem minmax(0, 1fr);
		gap: 0.75rem;
		align-items: baseline;
		padding: 0.32rem 0;
		border-bottom: 1px solid color-mix(in oklab, var(--color-ground-line) 55%, transparent);
	}

	.board-row:last-child {
		border-bottom: 0;
	}

	.board-row dt {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--color-ink-dim);
	}

	.board-row dd {
		margin: 0;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-ink);
	}

	/*
	 * Track means this line.
	 *
	 * The whole of what the board now says about its calling points, drawn in the
	 * grammar the map below already uses: the leading line's stops sit on a piece
	 * of track and everything else stands off it. The gap between the two groups
	 * is wide enough to read as a break rather than as spacing.
	 */
	.calls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 1.5rem;
	}

	.leg,
	.elsewhere {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
	}

	/*
	 * No gap on the leg, because the track is drawn inside each mark and the
	 * marks have to touch for it to join up. The visible spacing is the roundel's
	 * own margin inside its box, which is where it should come from anyway: it
	 * scales with the mark instead of being a number in here that has to be kept
	 * in step with one in there.
	 */
	.elsewhere {
		gap: 0.35rem;
	}

	.call {
		display: inline-flex;
		line-height: 0;
	}

	/* The sentence that joins two true facts. Ink, at the weight of a caption:
	   it explains the row above it and is not a second row. */
	/* Pressed, this is the only control on the page that takes material away for
	   the day, so it says which station it is holding you at rather than "on". */
	.scope.is-on {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	/* The stops of today's run. Ink and weight: a task is not a pitch. */
	.stops {
		display: flex;
		flex-direction: column;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
	}

	.stop {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		padding: 0.42rem 0.15rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
	}

	.stop-n {
		width: 1rem;
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	.stop-title {
		display: block;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.stop-line {
		display: block;
		font-size: 0.72rem;
		line-height: 1.35;
		color: var(--color-ink-dim);
	}

	.stop.is-done .stop-title {
		color: var(--color-ink-dim);
		font-weight: 500;
	}

	.stop.is-next .stop-title {
		color: var(--color-ink);
	}

	.task-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.2rem;
	}

	.task-tag {
		padding: 0.05rem 0.35rem;
		border-radius: 999px;
		border: 1px solid var(--color-ground-line);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		letter-spacing: 0.03em;
		color: var(--color-ink-dim);
		white-space: nowrap;
	}

	/* The press the board could not act on, answered where it was made. */
	.pinned {
		padding-left: 0.6rem;
		border-left: 2px solid color-mix(in oklab, var(--color-ground-line) 90%, transparent);
		font-size: 0.76rem;
		line-height: 1.5;
		color: var(--color-ink-muted);
	}

	.pinned strong {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink);
	}

	/* What the three gestures on the map are. Prose, because it is a sentence. */
	.how {
		max-width: 46rem;
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--color-ink-dim);
	}

	.how strong {
		font-weight: 600;
		color: var(--color-ink-muted);
	}

	.held {
		padding-left: 0.6rem;
		border-left: 2px solid color-mix(in oklab, var(--color-ground-line) 90%, transparent);
		font-size: 0.76rem;
		line-height: 1.5;
		color: var(--color-ink-muted);
	}

	.held strong {
		color: var(--color-ink);
		font-weight: 600;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1rem;
		padding-top: 0.6rem;
		border-top: 1px solid var(--color-ground-line);
	}

	.start {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.8rem 1.1rem 0.8rem 1.3rem;
		border-radius: 12px;
		background: var(--color-ink);
		color: var(--color-ground);
		text-align: left;
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.start:hover {
		opacity: 0.9;
	}

	.start:active {
		transform: translateY(1px);
	}

	.start-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.1rem;
	}

	.start-verb {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		letter-spacing: -0.015em;
		line-height: 1.15;
	}

	.start-what {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		opacity: 0.75;
	}

	/* The one mark on the page that is not a station, a line or a word. It is
	   here because a control this large has to say which way it goes. */
	.start-go {
		flex: none;
		font-size: 1.1rem;
		line-height: 1;
		opacity: 0.65;
		transition: transform 120ms ease;
	}

	.start:hover .start-go {
		transform: translateX(2px);
	}

	.sizes {
		display: flex;
		gap: 0.3rem;
	}

	/* The stops, on request. Pushed to the far end because it is the last thing
	   on the row that anybody needs. */
	.disclose {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-dim);
		transition: color 120ms ease;
	}

	.disclose:hover {
		color: var(--color-ink);
	}

	.caret {
		display: block;
		font-size: 0.6rem;
		transition: transform 140ms ease;
	}

	.caret.is-open {
		transform: rotate(180deg);
	}

	/*
	 * One shape for every small control on this page.
	 *
	 * `.quiet` and `.scope` were bare text at the dimmest ink in the palette,
	 * sitting in a row with three bordered chips — so *stop this workout* and
	 * *back to the suggestion*, which are the two ways out of a decision, read as
	 * captions rather than as things to press. They were reported as hard to
	 * find, and being hard to find is the only thing wrong with them: the row
	 * already had a vocabulary for a small control and these were not in it.
	 */
	.size,
	.chip,
	.move,
	.quiet,
	.scope {
		padding: 0.35rem 0.7rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-muted);
		transition:
			background 120ms ease,
			border-color 120ms ease,
			color 120ms ease;
	}

	.size:hover,
	.chip:hover,
	.move:hover:not(:disabled) {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.size.is-selected,
	.chip.is-on {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.quiet:hover:not(:disabled),
	.scope:hover {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.quiet:disabled {
		opacity: 0.4;
	}

	/*
	 * The way out of a workout, which is the one control on the board somebody
	 * goes looking for rather than notices. A step up from the rest of the row
	 * and no further: it ends the day's run, and a filled button would make
	 * stopping look like the thing the page wants.
	 */
	.quiet.is-exit {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.quiet.is-exit:hover {
		background: var(--color-ground-overlay);
	}

	/* ---------------------------------------------------------------------
	 * The network
	 * ------------------------------------------------------------------- */
	.network {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.layers,
	.picker-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}

	/* The drawing is one shape and does not reflow. On a narrow screen it
	   scrolls sideways inside its own box rather than squeezing the twelve
	   stations into something unreadable. */
	.map-scroll {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 0.6rem 0.2rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 14px;
		background: var(--color-ground-raised);
	}

	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.3rem;
	}

	.picker-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-ink-dim);
	}

	.legend li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.legend i {
		display: block;
		flex: none;
	}

	.mark-track {
		width: 1.4rem;
		height: 3px;
		border-radius: 2px;
		background: var(--color-ground-line);
	}

	.mark-stub {
		width: 1.4rem;
		height: 3px;
		border-radius: 2px;
		background: repeating-linear-gradient(
			to right,
			var(--color-ground-line) 0 2px,
			transparent 2px 6px
		);
	}

	.mark-spine {
		width: 0.4rem;
		height: 0.9rem;
		border-radius: 2px;
		background: var(--pc-7);
	}

	.mark-empty,
	.mark-full {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
	}

	.mark-empty {
		border: 2px solid var(--pc-5);
	}

	.mark-full {
		background: var(--pc-0);
	}

	/* ---------------------------------------------------------------------
	 * The two panels
	 * ------------------------------------------------------------------- */
	.panels {
		display: grid;
		gap: 0.9rem;
		grid-template-columns: minmax(0, 1fr);
	}

	@media (min-width: 860px) {
		.panels {
			grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		}
	}

	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 14px;
	}

	.panel-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--color-ground-line);
	}

	.panel-title {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--color-ink);
	}

	.panel-line {
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-ink-muted);
	}

	.rows {
		display: flex;
		flex-direction: column;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.3rem 0;
		border-bottom: 1px solid color-mix(in oklab, var(--color-ground-line) 45%, transparent);
		font-size: 0.8rem;
		color: var(--color-ink-muted);
	}

	.row:last-child {
		border-bottom: 0;
	}

	.row.is-shut {
		color: var(--color-ink-dim);
	}

	.row .dim {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		white-space: nowrap;
	}

	.row-key {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.45rem;
	}

	.row-key i {
		display: block;
		width: 0.5rem;
		height: 0.5rem;
		flex: none;
		border-radius: 50%;
		background: var(--tint);
	}

	.row-key i.is-hollow {
		background: transparent;
		border: 1px dashed var(--color-ground-line);
	}

	.moves {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.8rem;
	}

	.move.is-suggested {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	/* ---------------------------------------------------------------------
	 * Recently practised
	 * ------------------------------------------------------------------- */
	.history {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.days {
		display: flex;
		flex-direction: column;
	}

	.day {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.4rem 0.1rem;
		border-top: 1px solid var(--color-ground-line);
	}

	.day:first-child {
		border-top: 0;
	}

	.day-when {
		width: 4.6rem;
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-muted);
	}

	.day-key {
		flex: none;
		padding: 0.05rem 0.35rem;
		border-radius: 5px;
		border: 1px solid var(--tint);
		background: color-mix(in oklab, var(--tint) 12%, var(--color-ground));
		font-family: var(--font-display);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.day-what {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		font-size: 0.76rem;
		line-height: 1.3;
		color: var(--color-ink-dim);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.day-count {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 520px) {
		.day-what {
			display: none;
		}
	}
</style>
