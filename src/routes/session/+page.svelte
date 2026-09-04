<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { midi as session } from '$lib/midi/shared.svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { playChord, playProgression, playSequence, startAudio, stopAll } from '$lib/audio/engine';
	import {
		choicesFor,
		diatonicNames,
		markGathered,
		markNamed,
		markPassage,
		markPlayed,
		markShape,
		materialOf,
		nameNeighbours,
		pose,
		shapeChoices,
		toVoicing
	} from '$lib/session/drill';
	import type { Shape } from '$lib/curriculum/vocabulary';
	import { guidanceFor, guidanceKey, isChordShape, type LessonCard } from '$lib/session/lesson';
	import { openQueue, putBack as putBackAt, stillToPutRight } from '$lib/session/queue';
	import { gradeFromPerformance } from '$lib/srs/scheduler';
	import { parseKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { describeGoal, type Verdict } from '$lib/practice/goal';
	import { taskTags } from '$lib/session/progress';
	import { skillLabel } from '$lib/curriculum/cards';
	import { itemsForRung, rungById, stageByKey, stationHolding } from '$lib/curriculum/ladder';
	import Roundel from '$lib/components/Roundel.svelte';
	import RouteStrip from '$lib/components/RouteStrip.svelte';
	import { progressionById, realiseProgression } from '$lib/curriculum/progressions';
	import type { Mission } from '$lib/session/workout';
	import type { WorkoutReport } from '$lib/session/report';
	import { keyOverlay } from '$lib/wheel/overlays';
	import type { Highlight, WheelGeometry } from '$lib/wheel/geometry';
	import { cellsFor } from '$lib/wheel/geometry';
	import type { ReviewRating } from '$lib/server/db/schema';
	import { shouldHandleSpace } from '$lib/shortcuts';

	/*
	 * The workout.
	 *
	 * Three to five tasks in order, each with a goal rather than a clock that runs
	 * out. Drills end when their count is met; after a mission attempt, the player
	 * can keep reaching for its bar or carry the recorded verdict into the rest of
	 * the workout. Nothing here counts down at anything.
	 *
	 * Two of the four kinds are asked here and two are not. The ear and the
	 * function are the questions the play-along page cannot pose, so they are posed
	 * on this screen; a mission is not a copy of that page but *is* that page, so
	 * this hands off to `/backing` with the constraint in the URL and the block id
	 * beside it, and the verdict comes back through the run. The new thing is shown
	 * once and tried once.
	 *
	 * Results are written as each task finishes rather than at the end, so walking
	 * away halfway still records everything up to that point. Advancing never needs
	 * the mouse: the sustain pedal or the spacebar moves you on, because both hands
	 * are on the keys.
	 */

	let { data } = $props();

	/**
	 * Guidance follows a musical shape across the whole workout, even when the
	 * ear and function tasks ask for it through different card rows.
	 */
	function guidanceAt(taskPosition: number, at: number) {
		const keys: string[] = [];
		let current = -1;
		for (let position = 0; position < (data.workout?.tasks.length ?? 0); position++) {
			const workoutEntry = data.workout?.tasks[position];
			if (!workoutEntry) continue;
			const cards = data.cards[workoutEntry.index] ?? [];
			for (let cardAt = 0; cardAt < cards.length; cardAt++) {
				if (position === taskPosition && cardAt === at) current = keys.length;
				keys.push(guidanceKey(cards[cardAt] as LessonCard));
			}
		}
		return guidanceFor(keys, current);
	}

	function openingPhase(taskPosition: number, at: number): 'watch' | 'play' {
		const workoutEntry = data.workout?.tasks[taskPosition];
		const card = workoutEntry ? (data.cards[workoutEntry.index] ?? [])[at] : null;
		if (!card) return 'play';
		const kind = (card.payload as { kind?: string }).kind;
		const canDemonstrate =
			(kind === 'scale' && card.direction === 'hear_play') || isChordShape(card as LessonCard);
		return guidanceAt(taskPosition, at).mode === 'guided' && canDemonstrate ? 'watch' : 'play';
	}

	const GEOMETRY: WheelGeometry = { outerRadius: 330, ringWidth: 52 };
	const config = $derived(data.settings.wheelConfig);
	const workout = $derived(data.workout?.workout ?? null);
	const context = $derived(parseKey(workout?.keyCenter ?? 'C'));
	const keyView = $derived(keyOverlay(context, config, GEOMETRY));

	// Seeded from where the server says to resume; from then on the task
	// transitions own it.
	// svelte-ignore state_referenced_locally
	let index = $state(data.workout?.resumeAt ?? 0);
	const entry = $derived(data.workout?.tasks[index] ?? null);
	const task = $derived(entry?.task ?? null);
	const total = $derived(workout?.tasks.length ?? 0);

	/*
	 * Held separately from the loaded data. Finishing a workout clears it from the
	 * server's "what is open" query, so relying on `data.workout` alone dropped you
	 * onto "nothing running" the moment you finished one — which reads as though
	 * the last twenty minutes had been thrown away.
	 */
	let report = $state<WorkoutReport | null>(null);
	const finished = $derived(report !== null);

	/** Whether the workout was closed with tasks still unplayed, so the end screen can say so without making anything of it. */
	let stoppedShort = $state(false);

	let busy = $state(false);
	let problem = $state<string | null>(null);

	// ---- per-task state ----------------------------------------------------

	/*
	 * The walk over this task's cards, and what happens to the ones you miss.
	 *
	 * It was `cardIndex`, walking `taskCards` from nought, and a run was over
	 * when it ran off the end — so a question you got wrong was one you never saw
	 * again inside that run. The rule that replaces it lives in `queue.ts`, where
	 * it can be tested without a keyboard; here it is only ever *applied*.
	 *
	 * Seeded where the server says to resume, in the same breath as `index`, so
	 * the first render already has a card. See `resetTask`.
	 */
	// svelte-ignore state_referenced_locally
	let queue = $state(seedQueue(data.workout?.resumeAt ?? 0));
	/** Where in the queue we are. */
	let position = $state(0);
	let askedAt = $state(0);
	let answered = $state(false);
	let lastMarking = $state<{ correct: boolean; missing: number[]; extra: number[] } | null>(null);
	let revealed = $state(false);
	/** Pitch classes played since this card was posed, for the ones built up over time. */
	let gathered = $state<number[]>([]);
	/** Chords of a passage already played, for the ones answered in order. */
	let passageDone = $state(0);
	/** Which chord of a passage is sounding, while the question plays. */
	let soundingStep = $state(-1);
	/**
	 * The naming half of a question, once the playing half is out of the way.
	 *
	 * `hear_name` enters it as soon as the chord has finished sounding; a degree
	 * enters it when the chord lands under the hands. Nothing else has one.
	 */
	let naming = $state(false);
	/** Whether the played half was right, for a question that has both. */
	let playedRight = $state<boolean | null>(null);
	/** The name that was chosen, and whether it was the right one. */
	let chosenName = $state<string | null>(null);
	let namedRight = $state<boolean | null>(null);
	/**
	 * The names already offered and refused, in the order they were tried.
	 *
	 * A wrong name used to end the question: it was recorded, the right answer
	 * flashed up for six hundred milliseconds, and the next question arrived. The
	 * only way to know you had been wrong was to catch the flash. Now a wrong
	 * name is refused rather than accepted — it goes dark, the row shakes its
	 * head, and the question is still open — so the grade the scheduler already
	 * heard is the same one, and the *learner* hears it too, at the moment they
	 * can still do something about it.
	 */
	let wrongNames = $state<string[]>([]);
	/** Set for as long as the "no" plays, and for nothing else. */
	let refused = $state(false);
	let refusalRun = 0;
	let showedAnswer = $state(false);
	let cardRecorded = $state(false);
	let audioUnlocked = $state(false);
	let playedPromptKey = $state<string | null>(null);
	let playingQuestion = $state(false);
	let audioProblem = $state<string | null>(null);
	// Seeded from the loaded card; later card transitions own it.
	// svelte-ignore state_referenced_locally
	let lessonPhase = $state<'watch' | 'play'>(openingPhase(data.workout?.resumeAt ?? 0, 0));
	let demoNotes = $state<number[]>([]);
	/* The new thing: whether it has been sounded, and which chord is sounding. */
	let playingNovelty = $state(false);
	let noveltyHeard = $state(false);
	let soundingChord = $state(-1);
	let demoRun = 0;
	let cardRun = 0;
	let reviewSequence = 0;

	/** Answers gathered during this task, flushed when it finishes. */
	let pending = $state<
		Array<{
			id: string;
			cardId: string;
			rating: ReviewRating;
			correct: boolean;
			latencyMs: number | null;
		}>
	>([]);

	const taskCards = $derived(entry ? (data.cards[entry.index] ?? []) : []);
	/** Where the walk has got to, or nothing once it is off the end of the queue. */
	const step = $derived(queue[position] ?? null);
	/** Which card of the task is showing — its own place, not the queue's. */
	const cardIndex = $derived(step?.at ?? 0);
	/** Whether this is the second look at a card that went wrong the first time. */
	const isRetry = $derived(step?.retry ?? false);
	const currentCard = $derived(step ? (taskCards[step.at] ?? null) : null);
	// Keyed on the place in the queue rather than on the card, so a card put back
	// on the end is posed and sounded again rather than treated as already heard.
	const promptKey = $derived(currentCard ? `${index}:${position}:${currentCard.id}` : null);
	const lessonGuidance = $derived(guidanceAt(index, cardIndex));
	const prompt = $derived(
		currentCard
			? pose(currentCard.direction, currentCard.payload as never, 60, currentCard.keyCenter)
			: null
	);

	/**
	 * How many questions this task asks.
	 *
	 * The queue's own length, which *was* the goal's own count and is now the
	 * count plus whatever went wrong — a run grows by one each time a card is put
	 * back, and saying so is the honest reading of "how far through am I". Falls
	 * back to the composed count for the frame before the queue is seeded.
	 */
	const asks = $derived(queue.length || (task && 'cardIds' in task ? task.cardIds.length : 0));
	/** How many of the questions still ahead are ones being put right. */
	const toPutRight = $derived(stillToPutRight(queue, position));
	const goalLine = $derived(task ? describeGoal(task.goal) : '');

	/** The last thing a mission said about itself, kept on the block that set it. */
	const verdict = $derived.by((): Verdict | null => {
		const result = entry?.result;
		if (typeof result !== 'object' || result === null) return null;
		const value = result as Record<string, unknown>;
		return typeof value.met === 'boolean' && typeof value.says === 'string'
			? (result as Verdict)
			: null;
	});

	/*
	 * The MIDI session is owned by the root layout; only the handlers belong to
	 * this page, and they are cleared on the way out so a chord played elsewhere is
	 * not still being marked here.
	 */
	$effect(() => {
		const stopPedal = session.onPedal((down) => {
			if (!down) return false;
			advanceHandsFree('pedal');
			return true;
		});
		const stopChord = session.onChord(handleChord);
		const stopNote = session.onNote(handleNote);
		return () => {
			stopPedal();
			stopChord();
			stopNote();
		};
	});

	$effect(() => {
		return () => {
			demoRun++;
			cardRun++;
		};
	});

	// The clock starts when the page does; every card transition restarts it.
	$effect(() => {
		untrack(() => {
			askedAt = performance.now();
		});
	});

	/** A task's cards, in the order it composed them, before anything goes wrong. */
	function seedQueue(taskIndex: number) {
		const workoutEntry = data.workout?.tasks[taskIndex];
		return openQueue(workoutEntry ? (data.cards[workoutEntry.index] ?? []).length : 0);
	}

	/**
	 * Put everything a task owns back to the start of a task.
	 *
	 * Called from `finishTask`, in the same statement that moves `index`, rather
	 * than from an effect watching it. An effect runs *after* the render that
	 * changed its dependency, so for one frame `taskCards` was the new task's
	 * while `cardIndex`, `lastMarking` and `answered` were still the old one's —
	 * which is the previous question's chord shape and feedback line painted over
	 * the next question's first card, reported exactly that way. Where the old
	 * walk had gone further than the new task is long, it was worse than a smear:
	 * `currentCard` came back undefined and every derived value that reads a card
	 * had to survive it.
	 */
	function resetTask(taskIndex: number) {
		queue = seedQueue(taskIndex);
		position = 0;
		pending = [];
		audioProblem = null;
		resetCard();
	}

	/** The same, for one question rather than a whole task. */
	function resetCard() {
		answered = false;
		revealed = false;
		lastMarking = null;
		gathered = [];
		passageDone = 0;
		soundingStep = -1;
		naming = false;
		playedRight = null;
		chosenName = null;
		namedRight = null;
		wrongNames = [];
		refused = false;
		refusalRun++;
		showedAnswer = false;
		cardRecorded = false;
		askedAt = performance.now();
		demoRun++;
		cardRun++;
		demoNotes = [];
		lessonPhase = openingPhase(index, cardIndex);
	}

	/** True for the things played one note after another rather than together. */
	const isSequential = $derived(
		(currentCard?.payload as { kind?: string } | undefined)?.kind === 'scale'
	);

	/*
	 * The questions whose answer is a movement rather than a shape.
	 *
	 * A progression, and so far only a progression. `pose` hands the chords over
	 * in order; everything below reads them from there rather than from the
	 * payload's `answerPitchClasses`, which for one of these is the union of every
	 * chord in it — the cluster this page used to sound and then demand back all at
	 * once. For a ii–V–I that union is the whole major scale.
	 *
	 * Kept apart from `isSequential`, which means *one note at a time*: a scale
	 * gathers notes in any order and forgives repeats, and a passage is a series
	 * of chords each of which has to be held together and in turn. The two look
	 * alike from a distance and mark nothing alike.
	 */
	const passage = $derived(prompt?.sequence ?? null);
	const isPassage = $derived((passage?.length ?? 0) > 0);

	/** The chord of the passage being asked for, clamped so the last one survives the finish. */
	const passageChord = $derived(
		passage ? (passage[Math.min(passageDone, passage.length - 1)] ?? null) : null
	);

	/**
	 * Whether the passage is sounded before the answer.
	 *
	 * The rule `pose` states: a question with nothing written down is one for the
	 * ear. `see_play` shows the numerals and stays silent, because playing it
	 * would be reading out the answer to the question printed above it.
	 */
	const soundsPassage = $derived(isPassage && prompt?.visible === null);

	/**
	 * The question whose subject is a key rather than a chord.
	 *
	 * One rule: **the page must not answer it anywhere.** The wheel's key overlay
	 * and the header line that names a card's key are both written for the other
	 * drills, and a pivot is a chord you have to find from what it *does* — a
	 * wheel with the workout's key drawn on it in degrees does half of that for
	 * you. See the note on `route`, which draws its stop blank for the same
	 * reason.
	 *
	 * There were three of these and two were withdrawn; the family kept its shape
	 * so that a second crossing direction inherits the discipline by existing.
	 */
	const isCrossingQuestion = $derived(prompt?.direction === 'pivot_play');

	/**
	 * Whether what you play is marked against the card.
	 *
	 * `answerWith` names the half that *ends* a question, and for a degree that is
	 * the naming — but the chord is played first and marked as it arrives, which is
	 * the whole of "play the IV of E♭, then say what you played". So the marking
	 * follows the material rather than the closing half.
	 */
	const marksPlaying = $derived(
		prompt !== null && (prompt.answerWith === 'play' || prompt.direction === 'degree_play')
	);
	const isChordLesson = $derived(
		marksPlaying && isChordShape(currentCard ? (currentCard as LessonCard) : null)
	);

	/** Whether this question ends with a name rather than with a shape. */
	const needsName = $derived(prompt?.answerWith === 'name');

	/** Whether it ends with a *kind* of chord instead — `hear_quality`, and only that. */
	const needsQuality = $derived(prompt?.answerWith === 'quality');

	/**
	 * Whether the answer is given by pressing one of a row of buttons.
	 *
	 * The two multiple-choice questions run the identical machine — the row opens
	 * when the question is posed, a wrong press keeps the question open and puts
	 * the card back, the first attempt is the one the record hears — and the only
	 * thing that differs between them is what is written on the buttons and what
	 * counts as right. So they share the machine and part company at
	 * `answerChoices` and `matchesAnswer`, rather than the page growing a second
	 * copy of `chooseName` with two words changed.
	 */
	const needsChoice = $derived(needsName || needsQuality);

	/** The shape this card is, which is the whole answer to a quality question. */
	const answerShape = $derived(
		(currentCard?.payload as { shape?: Shape } | undefined)?.shape ?? undefined
	);

	/**
	 * Every shape the ladder has opened, as buttons.
	 *
	 * Not sampled and not shuffled — see `shapeChoices`. Three of them while the
	 * triads are the whole vocabulary, seven once the sevenths are up.
	 */
	const qualityChoices = $derived(
		needsQuality && answerShape ? shapeChoices(answerShape, data.shapes ?? []) : []
	);

	/**
	 * Whether the material may be drawn, lit or lettered yet.
	 *
	 * One rule, in one place: **a question that still owes a name shows nothing of
	 * that name.** The scaffolding this page can put under a scale — the keys lit,
	 * the note names printed along the route, the lit key walking the scale as it
	 * sounds — is all of it teaching, and teaching is the wrong thing to do to a
	 * question whose answer is *what was that*.
	 *
	 * It matters for one card and that card should not exist: `hear_name` on a
	 * scale, which `directionsForItem` now refuses to make. But cards are
	 * insert-only, so every account that reached the relative minor before today
	 * is carrying an *Am scale* naming card that will keep coming round, and the
	 * refusal upstream does nothing for the rows already written. This is what
	 * those rows meet.
	 */
	const answerMayShow = $derived(!needsChoice || answered || showedAnswer);

	/**
	 * A scale being *taught*, as opposed to a scale being asked about.
	 *
	 * `isSequential` is a marking rule — *this is answered one note at a time* —
	 * and it reads the payload's kind and nothing else. The prompt panel took it
	 * for a second meaning it never had, and since it is the first branch in the
	 * chain it claimed every card whose material is a scale, whatever the question
	 * was. So the legacy `hear_name` scale card came up with `Play it.` over `Am
	 * scale` in display type over *Play one note at a time*, and then asked you
	 * which scale that had been, with `Am scale` among the buttons. The question
	 * printed its own answer and then marked you on reading it.
	 *
	 * This is the same distinction `isChordLesson` already draws for chords, in
	 * the same words: a lesson is a thing you are being shown, and you are only
	 * being shown it if playing it is the answer.
	 */
	const isScaleLesson = $derived(isSequential && marksPlaying);

	/**
	 * Whether the notes are on the screen already, which decides whether the
	 * button offering to show them has anything to offer.
	 *
	 * Read off the same condition that actually draws them rather than off the
	 * guidance alone: with the guidance suppressed on a naming question, the old
	 * test still said *notes are shown* and greyed the button out, which would
	 * have taken the last piece of help off the one question that had just lost
	 * all the others.
	 */
	const notesAlreadyShown = $derived(
		(isSequential || isChordLesson) && lessonGuidance.showTargetLabels && answerMayShow
	);

	/** What the right name is, spelled as the card stores it. */
	const answerLabel = $derived(
		(currentCard?.payload as { label?: string } | undefined)?.label ?? ''
	);

	/**
	 * Four names to choose between, three of them wrong.
	 *
	 * Drawn from the rest of the workout's own material so the wrong ones are
	 * things this chord could actually be mistaken for. Four is enough to make a
	 * guess worth a quarter and few enough to read without scanning.
	 */
	const nameChoices = $derived.by(() => {
		if (!needsName || !answerLabel || !currentCard) return [];
		const kind = (currentCard.payload as { kind?: string } | undefined)?.kind;
		const fromBank = Object.values(data.cards)
			.flat()
			.map((card) => {
				const payload = card.payload as { label?: string; kind?: string };
				return { label: payload.label, kind: payload.kind, keyCenter: card.keyCenter };
			})
			.filter((option) => option.kind === kind);
		// The bank first, because those are the things actually being practised —
		// then the rest of the key, which is what makes four buttons possible on an
		// account that owns one triad. See `diatonicNames`.
		const among = [...fromBank, ...diatonicNames(currentCard.keyCenter, kind)];
		return choicesFor(answerLabel, nameNeighbours(answerLabel, among, currentCard.keyCenter));
	});

	/** The row actually on screen, whichever of the two questions is asking. */
	const answerChoices = $derived<string[]>(needsQuality ? qualityChoices : nameChoices);

	/** And what counts as right in it. */
	function matchesAnswer(option: string): boolean {
		return needsQuality ? markShape(answerShape, option as Shape) : markNamed(answerLabel, option);
	}

	/** The right answer, spelled for the feedback line. */
	const answerText = $derived(needsQuality ? (answerShape ?? '') : answerLabel);
	const chordTarget = $derived.by(() => {
		if (!isChordLesson || !currentCard) return [];
		const payload = currentCard.payload as {
			answerPitchClasses: number[];
			answerVoicing?: number[];
		};
		return payload.answerVoicing ?? toVoicing(payload.answerPitchClasses);
	});
	const questionAudio = $derived(
		prompt?.audible ?? (isChordLesson && lessonGuidance.mode === 'guided' ? chordTarget : null)
	);

	/** Whether this question has anything to sound at all. */
	const hasQuestionAudio = $derived(Boolean(questionAudio) || soundsPassage);

	/**
	 * A question that is only a name is waiting for one from the moment it is posed.
	 *
	 * `degree_play` is the exception and stays out until its chord has landed,
	 * because there the naming is the second half of the question rather than the
	 * whole of it.
	 */
	$effect(() => {
		const wants = needsChoice && !marksPlaying && !answered && Boolean(currentCard);
		untrack(() => {
			if (wants && !naming) naming = true;
		});
	});

	/** Once audio has been unlocked by a tap, later questions can play automatically. */
	$effect(() => {
		if (
			!audioUnlocked ||
			!hasQuestionAudio ||
			answered ||
			!promptKey ||
			playedPromptKey === promptKey
		)
			return;
		void playQuestion();
	});

	const wait = (milliseconds: number) =>
		new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

	async function animateScale(notes: number[], noteMilliseconds: number) {
		const run = ++demoRun;
		for (const note of notes) {
			if (run !== demoRun) return;
			demoNotes = [note];
			await wait(noteMilliseconds);
		}
		if (run === demoRun) demoNotes = [];
	}

	/** How long each chord of a passage is held, sounding and on screen. */
	const PASSAGE_SECONDS = 1.15;

	/**
	 * Walk the marker along the passage while it sounds.
	 *
	 * Position and nothing else. `animateScale` lights the *key* each note is on,
	 * because a scale demonstration is teaching where the notes are — but this
	 * runs for `hear_play`, where which notes they are is the question, so all
	 * that moves is which box is glowing. Three chords going past with no way to
	 * tell which one you are hearing is a worse question than it needs to be; the
	 * count and the pulse are not the answer.
	 */
	async function animatePassage(count: number, chordMilliseconds: number) {
		const run = ++demoRun;
		for (let i = 0; i < count; i++) {
			if (run !== demoRun) return;
			soundingStep = i;
			await wait(chordMilliseconds);
		}
		if (run === demoRun) soundingStep = -1;
	}

	async function playQuestion() {
		if (!hasQuestionAudio || !currentCard || !promptKey || playingQuestion) return;
		const thisPromptKey = promptKey;
		const audible = questionAudio ?? [];
		playedPromptKey = thisPromptKey;
		playingQuestion = true;
		audioProblem = null;
		try {
			await startAudio();
			audioUnlocked = true;
			/*
			 * A scale is not a chord. Sounding all seven notes at once produced a tone
			 * cluster nobody could identify, and then demanded all seven back
			 * simultaneously, which is not playable.
			 *
			 * Neither is a progression, and that one was worse: the union of a ii–V–I
			 * is the whole major scale, so the cluster was bigger and what came back
			 * was a question no hand could answer. It is heard the way it is played —
			 * one chord after another, in time — which is `playProgression`, the same
			 * function the chart editor auditions changes with.
			 */
			if (soundsPassage && passage) {
				await playProgression(
					passage.map((chord) => chord.voicing),
					PASSAGE_SECONDS
				);
				await animatePassage(passage.length, PASSAGE_SECONDS * 1000);
			} else if (isSequential) {
				const playing = playSequence(audible, 0.4);
				// The lit key walking the scale is a demonstration, and a demonstration
				// is the wrong answer to *what was that*. See `answerMayShow`.
				const demonstration =
					lessonGuidance.mode === 'guided' && answerMayShow
						? animateScale(audible, 400)
						: wait(audible.length * 400);
				await Promise.all([playing, demonstration]);
				if (lessonPhase === 'watch') lessonPhase = 'play';
			} else if (isChordLesson && lessonGuidance.mode === 'guided') {
				const run = ++demoRun;
				demoNotes = audible;
				await playChord(audible, 1.9);
				await wait(1900);
				if (run === demoRun) demoNotes = [];
				if (lessonPhase === 'watch') lessonPhase = 'play';
			} else {
				/*
				 * The tonic first, where the question has one.
				 *
				 * Only `hear_name` does. It is not part of the answer and is never
				 * marked — it is the reference the question was missing, without which
				 * naming a chord sounded into silence is a test of perfect pitch. Held
				 * shorter than the chord and separated by a real gap, so it reads as
				 * *from here* rather than as the first half of what is being asked.
				 * See `Prompt.anchor`.
				 */
				if (prompt?.anchor) {
					await playChord(prompt.anchor, 1.1);
					await wait(1250);
				}
				await playChord(audible, 1.9);
				await wait(1900);
			}
			askedAt = performance.now();
		} catch (error) {
			if (playedPromptKey === thisPromptKey) playedPromptKey = null;
			audioProblem = error instanceof Error ? error.message : 'Audio could not start.';
		} finally {
			playingQuestion = false;
		}
	}

	// ---- answering ----------------------------------------------------------

	/*
	 * Whether the hands are being listened to.
	 *
	 * The demonstration is a *sound*, not a gate. This used to read
	 * `lessonPhase === 'play'`, so during the watch phase a correct chord played
	 * on a real piano was thrown away and the only way past the screen was the
	 * mouse — on a question whose answer was printed above the keyboard, for
	 * somebody who had already played it. Playing the thing is a better claim to
	 * knowing it than pressing *Watch and listen* ever was, so it counts, and the
	 * phase follows the hands instead of holding them.
	 *
	 * Still not while the demonstration is actually sounding: fingers resting on
	 * the keys through a two-second chord are not an answer, and the phase turns
	 * over by itself the moment it finishes.
	 */
	const listeningToHands = $derived(!playingQuestion);

	function handleNote(note: number) {
		if (!isSequential || !marksPlaying || answered || !listeningToHands || !currentCard) return;
		if (lessonPhase === 'watch') lessonPhase = 'play';

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		const pc = ((note % 12) + 12) % 12;
		gathered = [...new Set([...gathered, pc])];
		const marking = markGathered(expected, gathered);
		lastMarking = marking;
		if (marking.correct) completeAnswer();
	}

	function handleChord(chord: { notes: number[]; held?: number[] }) {
		if (!marksPlaying || answered || naming || !currentCard || isSequential || !listeningToHands)
			return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		/*
		 * Marked against the notes under a finger, not everything sounding.
		 *
		 * With the sustain pedal down the two are different: the cluster keeps the
		 * previous chord alive, exactly as the room hears it, so a correct C major
		 * arrived here as C major plus four notes to lift and was never once marked
		 * right. Every pianist pedals, so on a real piano this drill answered to the
		 * mouse and nothing else — which is the whole of "sometimes it responds to
		 * the piano and sometimes I have to click Next".
		 */
		const played = chord.held ?? chord.notes;
		if (played.length === 0) return;
		if (lessonPhase === 'watch') lessonPhase = 'play';

		/*
		 * A passage is marked where it stands, not all at once.
		 *
		 * `expected` above is the payload's `answerPitchClasses`, and for a
		 * progression that is the union of every chord in it — so this line used to
		 * ask for every note of a ii–V–I at once and never marked one right. The
		 * chords are in the prompt, in order; each is checked as a chord, and a
		 * right one moves the question along.
		 */
		if (isPassage && passage) {
			const marking = markPassage(
				passage.map((step) => step.pitchClasses),
				passageDone,
				played
			);
			lastMarking = marking;
			passageDone = marking.done;
			if (marking.complete) completeAnswer();
			return;
		}

		const marking = markPlayed(toVoicing(expected), played);
		lastMarking = marking;
		if (marking.correct) completeAnswer();
	}

	/**
	 * The played half landed. Either that is the whole question, or a name follows.
	 */
	function completeAnswer() {
		if (needsName) {
			// "Play the chord that degree asks for, then name what you played" — the
			// instruction has always said this and the page used to stop at the
			// halfway point, recording a correct answer for the half it had seen.
			playedRight = true;
			naming = true;
			revealed = true;
			return;
		}
		answered = true;
		revealed = true;
		record(gradeFromPerformance(true, Math.round(performance.now() - askedAt)), true);
		settleThen(() => nextCard());
	}

	/** How long the answer stays on screen before the next question. */
	function settleThen(go: () => void) {
		const run = cardRun;
		setTimeout(
			() => {
				if (run === cardRun) go();
			},
			isSequential || isPassage ? 1150 : isChordLesson ? 950 : 650
		);
	}

	/**
	 * A name was chosen, and it is marked.
	 *
	 * **This is the fix for the app's least honest moment.** `hear_name` and the
	 * naming half of a degree had no way to answer at all: the only control was a
	 * button reading "Reveal the name", and pressing it recorded `good` and
	 * `correct: true`. Eighty of one account's hundred and eleven naming answers
	 * were that button. The scheduler believed them and stretched the intervals,
	 * the rung's accuracy was built out of them, and the end screen reported a
	 * percentage made partly of button presses — so the one number the app offers
	 * as feedback was measuring nothing.
	 *
	 * A wrong answer is worth more than a fake right one, so this grades. Both
	 * halves count where there are two: playing the right chord and then calling it
	 * something else is not a question you answered.
	 *
	 * **And a wrong answer is not the end of the question.** It used to be: the
	 * `again` went to the server, the right name lit up for six hundred
	 * milliseconds, and the next question replaced it — so the whole of the
	 * feedback was a flash you had to be looking at, and the one moment a learner
	 * is most able to take a correction in was spent scrolling past it. The grade
	 * still goes off at the first attempt, because that is the honest one and the
	 * scheduler must not be told otherwise; what changes is that the *question*
	 * stays open. The name you tried goes dark, the row says no, and you choose
	 * again from what is left until the right one is under your hand — and the
	 * card is put back on the end of the run for a second look. See `putBack`.
	 */
	function chooseName(option: string) {
		if (!currentCard || answered || wrongNames.includes(option)) return;

		if (!matchesAnswer(option)) {
			// The first attempt is the one the record hears, whatever happens next.
			record('again', false);
			chosenName = option;
			namedRight = false;
			wrongNames = [...wrongNames, option];
			refuse();
			putBack();
			return;
		}

		chosenName = option;
		namedRight = true;
		answered = true;
		revealed = true;

		// Right at the first time of asking, with nothing given away and nothing
		// tried and refused, is the only thing that counts as knowing it.
		const correct =
			wrongNames.length === 0 && playedRight !== false && !showedAnswer && !cardRecorded;
		record(
			correct ? gradeFromPerformance(true, Math.round(performance.now() - askedAt)) : 'again',
			correct
		);
		settleThen(() => nextCard());
	}

	/**
	 * Say no, briefly, and in the one place the answer was given.
	 *
	 * A head shake rather than a word: left, right, back, over in a third of a
	 * second. It is the smallest thing that can carry *no* without the page
	 * having to raise its voice, it lands on the row of names where the mistake
	 * was made, and the feedback line under the keyboard says the rest.
	 */
	function refuse() {
		const run = ++refusalRun;
		refused = true;
		setTimeout(() => {
			if (run === refusalRun) refused = false;
		}, 420);
	}

	/** Put this card back on the end of the run. The rule is in `queue.ts`. */
	function putBack() {
		if (currentCard) queue = putBackAt(queue, position);
	}

	/**
	 * Write an answer down — unless this is the second look, which writes nothing.
	 *
	 * A card put back was already graded when it went wrong, and the answer it
	 * gets now comes after being told what it was. Recording that too would turn
	 * one wrong answer into fifty per cent and quietly hand the scheduler an
	 * interval it has not earned, which is the same failure as the button that
	 * used to grade itself correct — see above. The second look is practice. The
	 * first one is the measurement.
	 */
	function record(rating: ReviewRating, correct: boolean) {
		if (!currentCard || cardRecorded || isRetry) return;
		cardRecorded = true;
		const reviewId =
			typeof globalThis.crypto?.randomUUID === 'function'
				? globalThis.crypto.randomUUID()
				: `local-${Date.now()}-${++reviewSequence}`;
		pending = [
			...pending,
			{
				id: reviewId,
				cardId: currentCard.id,
				rating,
				correct,
				latencyMs: Math.round(performance.now() - askedAt)
			}
		];
	}

	function nextCard() {
		const next = position + 1;
		position = next;
		resetCard();

		// Done when done: the goal is a count of questions, and the last answer is
		// what meets it. The queue is what says how many there are, so a run with
		// something put back on the end of it finishes when *that* is answered
		// rather than when the composed list runs out.
		if (next >= queue.length) void finishTask({ asked: pending.length });
	}

	/**
	 * Give up and be shown it.
	 *
	 * Not the same as skipping: you see the notes, so the next time round is a real
	 * attempt rather than another blank. It still counts as needing help, which is
	 * exactly what the scheduler should know — and the next time round is now a
	 * real thing rather than a figure of speech, because being shown it puts the
	 * card back on the end of the run.
	 */
	function showAnswer() {
		if (!currentCard || showedAnswer || answered) return;
		showedAnswer = true;
		revealed = true;
		lessonPhase = 'play';
		// A question that ends in a name still ends in one after being shown: the
		// grade is already settled, and picking the name you were just told is how
		// the answer gets connected to the sound rather than merely revealed.
		if (needsChoice) naming = true;
		record('again', false);
		putBack();
	}

	const cardContext = $derived(parseKey(currentCard?.keyCenter ?? workout?.keyCenter ?? 'C'));
	const answerPitchClasses = $derived(
		(currentCard?.payload as { answerPitchClasses?: number[] } | undefined)?.answerPitchClasses ??
			[]
	);

	/** Note names for the current answer, spelled in the card's own key. */
	const answerNotes = $derived.by(() => {
		return answerPitchClasses.map((pc) => formatNote(spell(pc, cardContext), { unicode: true }));
	});
	const liveChordMarking = $derived.by(() => {
		// The fingers, not the room: the same reason `handleChord` marks against
		// `held`. Reading `live` here told a pedalling player to lift four notes
		// that no finger was on, under a chord they had in fact just played.
		if (!isChordLesson || session.held.length === 0) return null;
		return markPlayed(chordTarget, session.held);
	});
	/** The same live reading for a passage, against the one chord it is waiting on. */
	const livePassageMarking = $derived.by(() => {
		if (!isPassage || answered || !passageChord || session.held.length === 0) return null;
		return markPlayed(passageChord.pitchClasses, session.held);
	});
	const activeMarking = $derived(liveChordMarking ?? livePassageMarking ?? lastMarking);

	/** What is still missing, as note names rather than a bare count. */
	const missingNotes = $derived(
		(activeMarking?.missing ?? []).map((pc) =>
			formatNote(spell(pc, cardContext), { unicode: true })
		)
	);
	const extraNotes = $derived(
		(activeMarking?.extra ?? []).map((pc) => formatNote(spell(pc, cardContext), { unicode: true }))
	);

	/**
	 * The notes this card is made of, whether or not the question sounds them.
	 *
	 * `prompt.audible` is what a question *plays*, and half the directions play
	 * nothing on purpose: a scale asked as `see_play` prints its name and waits.
	 * Everything that draws the material was reading the prompt, so on those
	 * questions it drew nothing — the route above the keyboard came up empty and
	 * the keyboard fell back to the hard-coded C3–E5 window the octave fix was
	 * meant to have retired, which put B, B♭, A, A♭, G, G♭ and F off the
	 * right-hand end again. Half the scale questions in the app, and only ever
	 * the silent half, which is why it survived the fix.
	 */
	const cardMaterial = $derived(currentCard ? materialOf(currentCard.payload as never, 60) : []);
	const scaleTarget = $derived(isSequential ? (prompt?.audible ?? cardMaterial) : []);
	const scaleRouteNotes = $derived.by(() => {
		return scaleTarget.map((note) => formatNote(spell(note, cardContext), { unicode: true }));
	});
	/**
	 * The chord a passage puts on the keyboard, and only once it has been asked for.
	 *
	 * Never while the question is open. On `see_play` the numerals are printed and
	 * the spelling is the exercise; on `hear_play` nothing is written down at all,
	 * so lighting the keys would answer both halves at once.
	 */
	const passageTarget = $derived(
		isPassage && (showedAnswer || answered) ? (passageChord?.voicing ?? []) : []
	);
	const targetNotes = $derived.by(() => {
		if (isPassage) return passageTarget;
		// `answerMayShow` first: a scale asked as a *name* gets no lit keys, whatever
		// the guidance would otherwise have offered it.
		if (isSequential && answerMayShow && (lessonGuidance.showTarget || showedAnswer || answered))
			return scaleTarget;
		if (
			isChordLesson &&
			(lessonPhase === 'watch' || lessonGuidance.showTarget || showedAnswer || answered)
		)
			return chordTarget;
		if (!isSequential && showedAnswer && currentCard) {
			const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
			return toVoicing(expected);
		}
		return [];
	});
	const foundTargetNotes = $derived.by(() => {
		if (isPassage) {
			if (passageTarget.length === 0) return [];
			const missing = new Set(answered ? [] : (activeMarking?.missing ?? []));
			return passageTarget.filter((note) => !missing.has(((note % 12) + 12) % 12));
		}
		if (isSequential)
			return scaleTarget.filter((note) => gathered.includes(((note % 12) + 12) % 12));
		if (!isChordLesson || (!activeMarking && !answered)) return [];
		const missing = new Set(answered ? [] : (activeMarking?.missing ?? []));
		return chordTarget.filter((note) => !missing.has(((note % 12) + 12) % 12));
	});
	// How far along the *walk* is, not how far into the composed list — the two
	// stopped being the same number the day a card could be put back.
	const questionProgress = $derived(asks ? Math.min(1, (position + (answered ? 1 : 0)) / asks) : 0);
	const chordPromptName = $derived.by(() => {
		if (!isChordLesson || !currentCard) return '';
		const label = (currentCard.payload as { label: string }).label;
		if (lessonPhase === 'watch' || lessonGuidance.mode !== 'recall' || showedAnswer || answered)
			return label;
		return prompt?.visible ?? 'Listen, then play';
	});
	const chordPromptContext = $derived.by(() => {
		if (!isChordLesson || !prompt?.visible || prompt.visible === chordPromptName) return null;
		return prompt.visible;
	});
	const chordRoles = ['root', 'third', 'fifth', 'seventh'];
	/**
	 * Which key and which topic this question came from.
	 *
	 * "Question 3 of 10" says how far through you are and nothing about what you
	 * are being asked, which on a queue deliberately spread across keys and rungs
	 * is the more useful half. Both facts are already on the card — the key it was
	 * generated in and the skill it belongs to — so this is a label rather than a
	 * lookup, and it says nothing at all for a card whose skill names nothing.
	 */
	/**
	 * The line the run leads with, where the board pinned one.
	 *
	 * Read off `workout.choice`, which is what the picker actually posted, so the
	 * header and the home page cannot describe the same run differently.
	 */
	const leadingLine = $derived.by(() => {
		const choice = workout?.choice;
		if (!choice) return null;
		if (choice.kind === 'rung') return rungById(choice.rungId)?.label ?? null;
		return progressionById(choice.progressionId)?.name ?? null;
	});

	/* -- Where on the network this run actually is -------------------------
	 *
	 * The workout page named its run — `from C · the relative minor` — and then
	 * said nothing about any individual question except a caption in the far
	 * corner. So the one screen where the keys are being played was the one the
	 * map had never reached, and the answer to *which key is this* had to be
	 * inferred from the chord symbol.
	 *
	 * What follows is one row of the network, in the map's own marks: the line
	 * this question is on, the stops the task calls at, and the one being served.
	 * Nothing new is measured — `Makeup.keys` has carried the calling points since
	 * the day a task learned to say what it was made of. */

	/** The station a key name belongs to, so both halves of a relative pair land on one stop. */
	const stationFor = (key: string) => stationHolding(key) ?? key;

	/** A stop, drawn from the same standings the network and the profile read. */
	function stopAt(key: string) {
		const station = stationFor(key);
		const standing = data.keys.find((entry) => entry.key === station);
		return {
			key: station,
			pc: standing?.pc ?? 0,
			fill: standing?.fill ?? 0,
			built: (standing?.reached ?? 0) > 0
		};
	}

	/** The station the run leaves from, for the header. */
	const departureStop = $derived(stopAt(workout?.keyCenter ?? 'C'));

	/** The station this question is at. Null where saying so would be the answer. */
	const hereStation = $derived(
		currentCard && !isCrossingQuestion ? stationFor(currentCard.keyCenter) : null
	);

	/**
	 * The line, the stops, and whether the stops may be named.
	 *
	 * A drill's line is the *current card's* skill rather than the task's, because
	 * a queue leads with what was pinned and then runs on — so the line genuinely
	 * changes under you, and a strip that named only the pinned one would go back
	 * to describing the run instead of the question. The stops do not change: they
	 * are what the task calls at, in the order it reaches them.
	 */
	const route = $derived.by(() => {
		if (!task) return null;

		if (task.kind === 'mission') {
			return {
				line: 'Play along',
				stops: [stopAt(task.mission.keyCenter)],
				anonymous: false
			};
		}

		if (task.kind === 'new_thing') {
			return {
				line: 'A new thing',
				stops: [stopAt(workout?.keyCenter ?? 'C')],
				anonymous: false
			};
		}

		/*
		 * The key question keeps its stops unnamed, and that is the whole of it.
		 *
		 * The wheel already refuses to draw this question's key and the prompt
		 * names both keys itself; a row of named roundels over the top would hand the
		 * answer over more plainly than either of them could have leaked it. One
		 * blank stop is the honest drawing: you are at a station, and which one is
		 * the question.
		 */
		if (task.kind === 'crossing') {
			return {
				line: skillLabel(currentCard?.skillCode) ?? 'Where are we?',
				stops: [{ key: '?', pc: 0, fill: 0, built: true }],
				anonymous: true
			};
		}

		const keys = 'makeup' in task ? (task.makeup?.keys ?? []) : [];
		const stations: string[] = [];
		for (const key of keys) {
			const station = stationFor(key);
			if (!stations.includes(station)) stations.push(station);
		}
		// A workout composed before tasks carried their makeup has no calling
		// points to draw, so the strip falls back to the one station it is sure of.
		if (stations.length === 0) stations.push(stationFor(workout?.keyCenter ?? 'C'));

		/*
		 * And the line goes unnamed on a progression that is *heard*.
		 *
		 * A progression's skill is named after its numerals — `prog:ii-V-I` reads
		 * back as "ii7 – V7 – Imaj7" — so printing it here would put the answer an
		 * inch above the question. The key stays, because every other ear question
		 * shows the key and the key is not what is being asked. `see_play` keeps
		 * the whole line: it has the numerals in the prompt already.
		 */
		return {
			line: soundsPassage
				? 'A progression'
				: (skillLabel(currentCard?.skillCode) ?? leadingLine ?? ''),
			stops: stations.map(stopAt),
			anonymous: false
		};
	});

	/*
	 * The caption that used to sit in the corner naming the key and the topic is
	 * gone, and the strip above says both.
	 *
	 * It said `C · the scale` in the far corner while the header said
	 * `from C · the relative minor`, and the two were about different things — one
	 * about the question, one about the run — with nothing marking which. Two
	 * quiet lines of mono saying nearly the same words within an inch of each
	 * other is how a page ends up read as saying neither.
	 *
	 * Every refusal it carried moved with it: the key question draws its stop
	 * blank, and a progression that is heard goes unnamed. See `route` above.
	 */

	/**
	 * The chords the new thing is made of, so it can be seen and heard.
	 *
	 * Derived from the same material the instruction is written from, and by the
	 * same functions the drill room builds cards with — a rung's items, a
	 * progression's realised steps. Nothing new is invented here; what was
	 * missing was not the notes but anywhere to show them.
	 *
	 * A groove has none, which is why it keeps a different offer: there is no
	 * chord to sound, only a rhythm section to go and play over.
	 */
	const noveltyChords = $derived.by(
		(): Array<{ label: string; degree?: string; notes: number[] }> => {
			if (task?.kind !== 'new_thing') return [];
			const novelty = task.novelty;

			if (novelty.kind === 'rung') {
				const stage = stageByKey(novelty.key);
				if (!stage) return [];
				return itemsForRung(novelty.rungId, stage).map((item) => ({
					label: item.label,
					degree: item.degree,
					notes: item.answerVoicing ?? toVoicing(item.answerPitchClasses)
				}));
			}

			if (novelty.kind === 'progression') {
				const progression = progressionById(novelty.progressionId);
				if (!progression) return [];
				return realiseProgression(progression, novelty.keyCenter).steps.map((step) => ({
					label: step.symbol,
					degree: step.numeral,
					notes: step.voicing
				}));
			}

			return [];
		}
	);

	/**
	 * The rung this new thing would open, when the new thing is a rung.
	 *
	 * `chooseNovelty` builds a rung novelty out of `nextCell`, and `nextCell` is
	 * by construction the cell `deepen` opens — the same cell `?/advance` reaches
	 * through `openLadder`. So the two cannot name different rungs, and the
	 * primary button can say *Open the home chord* and be telling the truth about
	 * what pressing it does. Null for a progression or a groove, which leave the
	 * ladder where it is.
	 */
	const opensRung = $derived.by((): { rungId: string; label: string } | null => {
		if (task?.kind !== 'new_thing' || task.novelty.kind !== 'rung') return null;
		const rung = rungById(task.novelty.rungId);
		return rung ? { rungId: rung.id, label: rung.label } : null;
	});

	/** The chord currently sounding, lit on the wheel so the ear has somewhere to look. */
	const noveltyHighlights = $derived.by((): Highlight[] => {
		const chord = noveltyChords[soundingChord];
		if (!chord) return [];
		const pcs = [...new Set(chord.notes.map((n) => ((n % 12) + 12) % 12))];
		return pcs.length ? [{ cells: cellsFor(pcs, pcs[0], config, GEOMETRY), strength: 0.9 }] : [];
	});

	/**
	 * Play the new thing, one chord at a time.
	 *
	 * Chord by chord rather than through `playProgression`, because this is the
	 * one place the *shape* is the lesson: each one lights on the wheel as it
	 * sounds, which is the whole difference between hearing a progression and
	 * being shown one. A scale arrives as a single item of seven notes and is
	 * spread the same way, so the rung that opens an account demonstrates itself.
	 */
	async function playNovelty() {
		if (playingNovelty || noveltyChords.length === 0) return;
		const chords = noveltyChords;
		playingNovelty = true;
		audioProblem = null;
		try {
			await startAudio();
			audioUnlocked = true;
			const single = chords.length === 1 && chords[0].notes.length > 3;
			if (single) {
				// One item made of many notes: a scale. Heard as a line.
				soundingChord = 0;
				await playSequence(chords[0].notes, 0.4);
				await wait(chords[0].notes.length * 400);
			} else {
				for (let i = 0; i < chords.length; i++) {
					soundingChord = i;
					await playChord(chords[i].notes, 1.15);
					await wait(1150);
				}
			}
			noveltyHeard = true;
		} catch (error) {
			audioProblem = error instanceof Error ? error.message : 'Audio could not start.';
		} finally {
			soundingChord = -1;
			playingNovelty = false;
		}
	}

	/**
	 * What the wheel shows during a key question: nothing, until it is answered.
	 *
	 * The same rule as the prompt — no key, no degrees, no scale outline — and
	 * then the tonic once the answer is out, so the reveal has somewhere to land.
	 */
	const keyAnswerHighlights = $derived.by((): Highlight[] => {
		if (!currentCard || !(revealed || answered)) return [];
		const pcs = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		return pcs.length ? [{ cells: cellsFor(pcs, pcs[0], config, GEOMETRY), strength: 0.9 }] : [];
	});

	/**
	 * The stretch of keyboard this question actually needs.
	 *
	 * It was `from={48} count={29}` — C3 to E5 — which is a sensible-looking
	 * window and wrong for seven of the twelve keys. A one-octave scale is
	 * thirteen semitones starting on its own tonic, so B major runs to B5 and
	 * falls off the right-hand end; the ladder as a whole asks for notes from 47
	 * to 83 and this showed 48 to 76. Found by playing the G scale and watching
	 * the F♯ and the G go missing.
	 *
	 * Read off the card rather than off the moment, so it does not move under the
	 * hands while a scale is being played one note at a time — every card in a
	 * task shares a key and a skill, so within a task the window holds still.
	 * Snapped down to a C so the octaves read normally, and never smaller than the
	 * twenty-nine keys this has always been, so nothing shrinks the keys for a
	 * question that fits.
	 */
	const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

	const keyboard = $derived.by(() => {
		/*
		 * The notes this question will actually put on the keyboard.
		 *
		 * Deliberately not `payload.answerVoicing`. `drill.ts` rebuilds a scale's
		 * voicing from its stored root before posing it, so what sounds and what is
		 * lit can differ from what the card has on disk — and older cards hold a
		 * scale that wraps back an octave partway up, which dragged this window a
		 * long way left and pushed the exercise into the right-hand half. What is
		 * posed is what the player sees, so that is what the window is cut to.
		 */
		const notes = [
			...(prompt?.audible ?? []),
			// What the card is about, which for a silent question is the only thing
			// on this list that says anything at all. See `cardMaterial`.
			...cardMaterial,
			...scaleTarget,
			...chordTarget,
			...targetNotes,
			...demoNotes,
			// The whole passage, not the chord being asked for, so the keyboard does
			// not slide sideways between one chord and the next. A window is a range
			// and says nothing about which notes are in it.
			...(passage?.flatMap((chord) => chord.voicing) ?? [])
		];
		if (notes.length === 0) return { from: 48, count: 29 };

		const lowest = Math.min(...notes);
		const highest = Math.max(...notes);
		const needed = highest - lowest + 1;
		const width = Math.max(29, needed + 4);

		// Put the material in the middle of whatever window it gets, then let the
		// left edge fall back to the nearest white key — a keyboard drawn from a
		// black key has a floating sharp with no white key under half of it. The
		// old rule snapped the edge down to a C, which threw away most of an
		// octave and left every scale above C sitting in the right-hand half.
		let from = lowest - Math.floor((width - needed) / 2);
		while (!WHITE_PITCH_CLASSES.has(((from % 12) + 12) % 12)) from--;

		return { from, count: Math.max(29, highest - from + 3) };
	});

	const guidanceTitle = $derived.by(() => {
		if (isPassage && passage) {
			if (answered) return 'All the way through';
			if (playingQuestion) return 'Listen to the whole thing';
			return passageDone === 0
				? (prompt?.instruction ?? '')
				: `Chord ${passageDone + 1} of ${passage.length}`;
		}
		if (isScaleLesson) {
			if (lessonPhase === 'watch') return 'Watch the scale move';
			if (lessonGuidance.mode === 'guided') return 'Your turn — follow the lights';
			if (lessonGuidance.mode === 'supported') return 'Again — with fewer hints';
			return 'Now play it from memory';
		}
		// The correction, at the top of the screen, for as long as the question is
		// still open — which is now until it is answered rather than for the six
		// hundred milliseconds it used to take to disappear.
		if (naming && namedRight === false && !answered) return 'Not that one — try again';
		if (naming) return playedRight ? 'Now name what you played' : 'Name what you heard';
		if (isChordLesson) {
			if (lessonPhase === 'watch') return 'Watch the chord land';
			if (lessonGuidance.mode === 'guided') return 'Your turn — copy the shape';
			if (lessonGuidance.mode === 'supported') return 'Again — keep the shape';
			return 'Now build it from memory';
		}
		return prompt?.instruction ?? '';
	});
	const selectedDevice = $derived(
		session.devices.find((device) => device.id === session.selectedId)
	);
	const listeningLine = $derived.by(() => {
		if (session.status === 'requesting') return 'Connecting to your piano…';
		if (session.status === 'ready' && selectedDevice) return `Listening to ${selectedDevice.name}`;
		if (session.status === 'ready') return 'Listening — play your piano or the screen keys';
		if (session.unavailableReason) return 'Screen keys are listening';
		return 'Listening — screen keys work now';
	});
	const feedbackLine = $derived.by(() => {
		/*
		 * A refused name, named.
		 *
		 * The one line on this page that has to say *no* out loud. It names what
		 * was tried rather than what was wanted, because the answer is still on
		 * the screen with one fewer wrong option beside it and reading it out here
		 * would end the question the same way the old flash-and-move-on did.
		 */
		if (needsChoice && !answered && namedRight === false && chosenName) {
			return `${chosenName} — no. One of the others.`;
		}
		if (answered && needsChoice) {
			return namedRight ? `${answerText} — that is the one` : `It was ${answerText}`;
		}
		/*
		 * A passage counts in chords, because that is the unit it is answered in.
		 *
		 * It has to come before the lines below, which are written for a single
		 * shape: "every note found" over a ii–V–I would be counting the union
		 * again, in words this time.
		 */
		if (isPassage && passage) {
			const total = passage.length;
			if (answered) return `${answerLabel} — all ${total} chords, in order`;
			if (playingQuestion) return 'Listen — the whole progression first';
			const at = `Chord ${Math.min(passageDone + 1, total)} of ${total}`;
			const wanted = passageChord?.symbol ?? '';
			if (extraNotes.length) return `${at} · lift ${extraNotes.join(' ')}`;
			if (missingNotes.length) return `${at} · add ${missingNotes.join(' ')}`;
			if (showedAnswer && wanted) return `${at} · ${wanted}`;
			return passageDone === 0 ? `${at} · play when you are ready` : `${at} · keep going`;
		}
		if (answered && currentCard) {
			const label = (currentCard.payload as { label: string }).label;
			return isChordLesson ? `${label} — chord complete` : `${label} — every note found`;
		}
		if (playingQuestion) {
			if (isChordLesson && lessonGuidance.mode === 'guided')
				return 'Watch every note land together';
			if (isScaleLesson && lessonGuidance.mode === 'guided') return 'Follow the moving key';
			return 'Listen first';
		}
		// Said out loud because the two halves of the drill room look alike and want
		// different things: one wants your hands, one wants an answer off the
		// screen, and a player who has just played the right chord at a question
		// that was never listening deserves to be told which is which.
		if (naming) return playedRight ? 'That is the chord — now name it' : 'Choose the name';
		// Said as an offer rather than an instruction, because it is one now: the
		// demonstration is there to be taken and playing the thing skips it.
		if (lessonPhase === 'watch') return 'Hear it first, or play it if you know it';
		if (isScaleLesson && gathered.length) {
			return `${gathered.length} of ${answerNotes.length} notes found${missingNotes[0] ? ` · next, find ${missingNotes[0]}` : ''}`;
		}
		if (isChordLesson && activeMarking) {
			const found = answerNotes.length - missingNotes.length;
			if (extraNotes.length)
				return `${found} of ${answerNotes.length} notes fit · lift ${extraNotes.join(' ')}`;
			if (missingNotes.length)
				return `${found} of ${answerNotes.length} notes held · add ${missingNotes.join(' ')}`;
		}
		if (lastMarking && !lastMarking.correct) {
			return missingNotes.length
				? `Still find ${missingNotes.join(' ')}`
				: 'Try that shape once more';
		}
		return isChordLesson
			? `Play all ${answerNotes.length} notes together`
			: 'Play when you are ready';
	});

	/** Whether this question has a sounding still to come. See `advanceHandsFree`. */
	const questionUnheard = $derived(
		Boolean(prompt) &&
			!answered &&
			hasQuestionAudio &&
			!playingQuestion &&
			playedPromptKey !== promptKey
	);
	/**
	 * ...and whether the *foot* may be the thing that asks for it.
	 *
	 * Only once something has already unlocked audio. Browsers start a sound only
	 * from a user gesture, and a MIDI message is not one — the spacebar is, which
	 * is why it can always do this and the pedal can only do it afterwards.
	 * Advertising otherwise would put "pedal · hear it" under a pedal that
	 * answers with an audio error.
	 */
	const pedalHears = $derived(questionUnheard && audioUnlocked);

	function skipCard() {
		if (currentCard && !answered) {
			record('again', false);
			putBack();
		}
		nextCard();
	}

	/**
	 * Pedal or spacebar: whatever "next" means for the task showing.
	 *
	 * **The two are no longer the same key, and that is a bug fix rather than a
	 * preference.** Both used to land on `skipCard`, which records `again` and
	 * moves on — so touching the sustain pedal during a question marked it wrong.
	 * Pianists pedal continuously; one account had forty-three failed `hear_play`
	 * answers, most of them at under three seconds, which is not somebody failing
	 * to find a C major triad. The rung's accuracy was built out of those, and the
	 * accuracy is what decides whether the app ever offers to move on — so the
	 * pedal was quietly holding the ladder shut.
	 *
	 * A spacebar press is unambiguous: nothing about playing the piano involves
	 * one, so it can still mean "I am stuck, show me". A pedal press is part of
	 * playing, so while a question is waiting for your hands it means nothing at
	 * all. Once the question is answered both mean the same thing again, which is
	 * when hands-free actually matters.
	 */
	function advanceHandsFree(source: 'pedal' | 'key') {
		if (!task || busy || finished) return;
		if (task.kind === 'mission') {
			// Once the band has heard an attempt, Space and the pedal follow the
			// primary action on screen: continue. Reopening Play Along here made an
			// unmet mission an invisible loop with no hands-free way through it.
			if (verdict) void finishTask(verdict);
			else void playMission(task.mission);
			return;
		}
		if (task.kind === 'new_thing') {
			// The same rule the mission keeps: the pedal follows the primary control
			// on screen. While there is something to hear, hearing it is what the
			// screen is offering, and claiming to have tried it is not.
			//
			// Where the primary control opens a rung it is a form post, and the
			// pedal deliberately does *not* reach it: moving the ladder is the one
			// decision on this screen that outlives the workout, and a foot resting
			// on a sustain pedal should not be able to make it. Hands-free stops at
			// finishing the task, which is what it has always meant here.
			if (noveltyChords.length && !noveltyHeard) void playNovelty();
			else if (!opensRung) void finishTask({ tried: true });
			return;
		}
		if (prompt && !answered) {
			/*
			 * The rule the other two tasks keep: the pedal follows the primary
			 * control on screen.
			 *
			 * While a question has something to hear that has not been heard yet,
			 * that control is *hear it* — and reaching for the mouse to press it was
			 * the one interruption left in a page built so both hands could stay on
			 * the piano. Hearing a question is not a claim about anything, so the
			 * foot is welcome to it.
			 *
			 * The first sounding only. *Hear it again* is a button and stays one:
			 * a pianist's foot is down more often than it is up, and a pedal that
			 * retriggered the question would talk over the answer.
			 *
			 * Past that, a pedal press still means nothing while the question waits
			 * for your hands, and Space still means "I am stuck, show me": nothing
			 * about playing the piano involves a spacebar.
			 */
			if (questionUnheard && (source === 'key' || pedalHears)) {
				void playQuestion();
				return;
			}
			if (source === 'key') showAnswer();
			return;
		}
		if (currentCard) nextCard();
	}

	function onKeydown(event: KeyboardEvent) {
		if (!shouldHandleSpace(event)) return;
		event.preventDefault();
		advanceHandsFree('key');
	}

	// ---- task transitions ---------------------------------------------------

	async function post(body: Record<string, unknown>) {
		const response = await fetch('/api/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(await response.text());
		return response.json();
	}

	/**
	 * Write the task down and move to the next one.
	 *
	 * The last task finishing ends the workout, which is where the end screen's
	 * figures are worked out — from rows, on the server, once.
	 */
	async function finishTask(result: unknown = null) {
		if (!data.workout || !entry || busy) return;
		busy = true;
		problem = null;
		try {
			await post({
				action: 'finish-task',
				sessionId: data.workout.id,
				index: entry.index,
				reviews: pending,
				result
			});
			await stopAll();

			const next = index + 1;
			if (next >= total) await endWorkout();
			else {
				// Moved and cleared in one breath, before anything renders. See
				// `resetTask` for what a frame of the two disagreeing looked like.
				index = next;
				resetTask(next);
				// A new task has a new new-thing, which nobody has heard yet.
				noveltyHeard = false;
				soundingChord = -1;
				await invalidateAll();
			}
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not save that task.';
		} finally {
			busy = false;
		}
	}

	async function endWorkout() {
		if (!data.workout) return;
		report = (await post({ action: 'finish', sessionId: data.workout.id })) as WorkoutReport;
		await invalidateAll();
	}

	/**
	 * Hand off to the band.
	 *
	 * The block is opened first, because the run has to be able to name it: that
	 * id is what makes the verdict traceable to the chords that earned it. The
	 * parameters are the ones `/backing` learned to read beside the `?chart=` it
	 * has always taken — strip them and the same URL is an ordinary visit.
	 */
	async function playMission(mission: Mission) {
		if (!data.workout || !entry || !task || task.kind !== 'mission' || busy) return;
		busy = true;
		problem = null;
		try {
			const { blockId } = (await post({
				action: 'begin-task',
				sessionId: data.workout.id,
				index: entry.index
			})) as { blockId: string };

			const params = new URLSearchParams({
				chart: mission.chartSlug,
				key: mission.keyCenter,
				bpm: String(mission.bpmFloor),
				groove: mission.groove,
				block: blockId
			});

			if (task.goal.kind === 'choruses') {
				params.set('goal', 'choruses');
				params.set('choruses', String(task.goal.count));
			} else if (task.goal.kind === 'guide_tones') {
				params.set('goal', 'guide_tones');
				params.set('percent', String(task.goal.percent));
				params.set('choruses', String(task.goal.choruses));
			}

			await stopAll();
			await goto(`/backing?${params}`);
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not open that mission.';
			busy = false;
		}
	}

	async function leave() {
		// Costs nothing: every finished task is already saved, and the workout stays
		// open to be picked up later.
		await stopAll();
		await goto('/');
	}

	/**
	 * Stop here, and be told what it came to.
	 *
	 * Deliberately not the same button as leaving, and the difference is the
	 * point: leaving keeps the workout open to be picked up later, and this closes
	 * it. Until this existed there was no way out of a workout except playing
	 * every task in it to the end — `activeWorkout` has no time bound, so an open
	 * one stays open indefinitely, and the home page offers the open one and hides
	 * the picker behind it. A workout begun by accident therefore followed you
	 * around for good, and pressing start again only handed back the same one.
	 *
	 * Reported by the owner, who opened one to look at the screen and could not
	 * get rid of it. A room this app puts you in has to have a door.
	 *
	 * Stopping costs nothing and hides nothing. Every task already finished is
	 * already on record, and this writes the same report finishing writes, over
	 * whatever actually happened — which for a workout nobody played is a report
	 * that honestly says very little.
	 */
	async function endNow() {
		if (!data.workout || busy) return;
		busy = true;
		problem = null;
		try {
			stoppedShort = !data.workout.complete;
			await stopAll();
			await endWorkout();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not close that workout.';
		} finally {
			busy = false;
		}
	}

	// ---- the wheel ----------------------------------------------------------

	/**
	 * The wheel, and the answer drawn on it once the question has given it away.
	 *
	 * The test used to be `prompt.visible` — *has this question got anything
	 * written on it at all* — which is true of `see_play`, where the chord's name
	 * is the prompt and lighting its notes tells you nothing you were not just
	 * told, and equally true of `degree_play`, where what is written is `vi — C`
	 * and the notes are the entire question. So the wheel sat there with A, C and
	 * E lit under a question asking which chord the sixth degree is, and then
	 * asking you to name what you had played.
	 *
	 * The honest test is not whether the prompt says something but whether it says
	 * *this*: the answer goes on the wheel when the question has already named it,
	 * and otherwise not until it is out. `keyAnswerHighlights` has held the second
	 * half of that rule since the crossing question arrived; this is the same rule,
	 * for every other question on the page.
	 */
	const highlights = $derived.by((): Highlight[] => {
		const shapes: Highlight[] = [{ cells: keyView.scaleCells, strength: 0.4, outline: true }];

		const named = Boolean(answerLabel) && prompt?.visible === answerLabel;
		if ((named || revealed) && currentCard) {
			const pcs = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
			if (pcs.length)
				shapes.push({ cells: cellsFor(pcs, pcs[0], config, GEOMETRY), strength: 0.9 });
		}
		return shapes;
	});

	const virtual = (type: 'noteon' | 'noteoff', note: number) =>
		session.push(
			type === 'noteon'
				? { type: 'noteon', note, velocity: 90, time: performance.now() }
				: ({ type: 'noteoff', note, time: performance.now() } as MidiEvent)
		);

	const progress = $derived(total ? `${Math.min(index + 1, total)} of ${total}` : '');
	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');
</script>

<svelte:head><title>Workout · Roundel</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-6">
	{#if finished && report}
		<!-- What changed, and nothing the rows cannot say ---------------------- -->
		<div class="grid flex-1 place-items-center text-center">
			<div class="max-w-lg">
				<!-- Stopping early is a thing you are allowed to do, so it is stated
				     plainly and never as a shortfall. Nothing punishes. -->
				<h1 class="font-display text-ink mb-4 text-4xl font-semibold tracking-tight">
					{stoppedShort ? 'Stopped there.' : 'Done.'}
				</h1>
				<ul class="mb-6 flex flex-col gap-2">
					{#each report.says as line, i (i)}
						<li class="text-ink-muted leading-relaxed">{line}</li>
					{/each}
				</ul>

				<!--
					Where it went, drawn.

					The bookend to the board's *calls at*: that row is a forecast made
					before anything was answered, and this is the register. Same marks,
					same order, at each end of the same twenty minutes.
				-->
				{#if report.calledAt.length}
					<div class="mb-7 flex justify-center">
						<RouteStrip line="Called at" stops={report.calledAt.map(stopAt)} />
					</div>
				{/if}
				<div class="flex flex-wrap justify-center gap-3">
					<a href="/" class="bg-ink text-ground rounded-lg px-5 py-3 font-semibold">Another one</a>
					<a href="/backing" class="border-ground-line rounded-lg border px-5 py-3 font-semibold"
						>Play along</a
					>
				</div>
			</div>
		</div>
	{:else if !data.workout}
		<div class="grid flex-1 place-items-center text-center">
			<div>
				<p class="text-ink-muted mb-4">No workout.</p>
				<a href="/" class="bg-ink text-ground rounded-lg px-5 py-3 font-semibold">Back</a>
			</div>
		</div>
	{:else if task}
		<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
				<!--
					Where the run left from, as the roundel the network draws.

					The board that started this said *departs C* over a roundel; the page
					it hands off to said `from C` in mono and drew nothing. Same fact,
					two vocabularies, one press apart.
				-->
				<Roundel
					inline
					size={2}
					name={departureStop.key}
					pc={departureStop.pc}
					fill={departureStop.fill}
					built={departureStop.built}
					departs
					title="Departs {glyph(departureStop.key)}"
				/>
				<h1 class="font-display text-ink text-lg font-semibold tracking-tight">{task.title}</h1>
				<!--
					What this run is, said the way the board that started it said it.

					This used to be `Task 1 of 3 · F`, which reads as *this task is in F*
					and is not what the key centre means: it is where the run departs
					from and what the play-along and the crossing questions are set in,
					while the drill queues lead there and then carry on into every other
					key the frontier has opened. Somebody who pinned F, pressed depart
					and was handed a G scale had two true things on screen and no
					sentence joining them.
				-->
				<span class="text-ink-muted font-mono text-xs">
					Task {progress} · from {glyph(workout?.keyCenter ?? '')}{leadingLine
						? ` · ${leadingLine.toLowerCase()}`
						: ''}{workout?.stationOnly ? ' · this station only' : ''}
				</span>
				<!-- What is new here and what is coming round again, in the one place
				     somebody is actually about to answer the questions. Composed by
				     `taskTags` so this and the home page's preview cannot disagree. -->
				{#each taskTags(task) as label (label)}
					<span class="task-tag">{label}</span>
				{/each}
			</div>
			<div class="flex items-center gap-2 sm:gap-4">
				<!-- The goal, in view for as long as the task runs. -->
				<span class="text-ink-dim font-mono text-[0.7rem]">{goalLine}</span>
				<!--
					Three ways out, and they had all three been drawn as captions.

					Dim mono text with no edge, in the corner of a header, for the
					controls somebody goes *looking* for — reported, correctly, as hard
					to find. They wear the board's own chip now, which is the shape this
					app already uses for a small control, and stopping wears it a step
					stronger because it is the one that ends the run.
				-->
				<button
					class="task-action"
					onclick={() => finishTask({ skipped: true })}
					aria-label="Skip task"
					disabled={busy}>skip</button
				>
				<!-- Two different exits, each named for what it actually does. One
				     button called "leave" kept the workout open, which is how a
				     workout opened to look at the screen ended up following somebody
				     around all day. -->
				<button class="task-action" onclick={leave} aria-label="Keep workout for later"
					>later</button
				>
				<button
					class="task-action is-exit"
					onclick={endNow}
					aria-label="Stop workout"
					disabled={busy}>stop</button
				>
			</div>
		</header>

		<nav class="workout-rail" aria-label="Workout progress">
			<ol>
				{#each data.workout.tasks as item, taskIndex (taskIndex)}
					<li
						class:is-current={taskIndex === index}
						class:is-done={item.finished || taskIndex < index}
					>
						<span class="task-marker" aria-hidden="true"
							>{item.finished || taskIndex < index ? '✓' : taskIndex + 1}</span
						>
						<span>{item.task.title}</span>
					</li>
				{/each}
			</ol>
		</nav>

		<!--
			One row of the network: the line this question is on, the stops the task
			calls at, and the one being served.

			The answer to *what am I doing and which keys am I handling*, which this
			page could not give — it named the run in the header and then left every
			individual question to be placed from the chord symbol. The marks are the
			map's own, so a key means the same thing here as it does on the board that
			composed this run.
		-->
		{#if route}
			<div class="route-bar">
				<RouteStrip
					line={route.line}
					stops={route.stops}
					here={hereStation}
					anonymous={route.anonymous}
				/>
			</div>
		{/if}

		<p class="task-instruction">{task.instruction}</p>

		<!-- The mission: the real page, under a constraint --------------------- -->
		{#if task.kind === 'mission'}
			<section class="flex flex-1 flex-col items-center justify-center gap-6 text-center">
				<h2 class="font-display text-ink text-3xl font-semibold tracking-tight">
					{task.mission.chartName}
				</h2>
				<p class="text-ink-muted font-mono text-sm">
					{glyph(task.mission.keyCenter)} · {task.mission.groove} · ≥{task.mission.bpmFloor} BPM
				</p>

				{#if verdict}
					<p class="verdict" class:is-met={verdict.met} aria-live="polite">{verdict.says}</p>
				{/if}

				<div class="flex flex-wrap items-center justify-center gap-3">
					{#if verdict}
						<button
							class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
							onclick={() => finishTask(verdict)}
							disabled={busy}
							aria-describedby="mission-hands-free"
						>
							{busy ? 'saving…' : 'Continue workout'}
						</button>
						<button
							class="border-ground-line text-ink rounded-2xl border px-6 py-4 font-semibold disabled:opacity-40"
							onclick={() => task.kind === 'mission' && playMission(task.mission)}
							disabled={busy}>Play again</button
						>
					{:else}
						<button
							class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
							onclick={() => task.kind === 'mission' && playMission(task.mission)}
							disabled={busy}
							aria-describedby="mission-hands-free"
						>
							{busy ? 'opening…' : 'Play mission'}
						</button>
					{/if}
				</div>
				<span id="mission-hands-free" class="text-ink-dim font-mono text-[0.7rem]">
					<kbd>Space</kbd> / pedal · {verdict ? 'continue workout' : 'open play along'}
				</span>
			</section>

			<!-- One new thing ---------------------------------------------------- -->
		{:else if task.kind === 'new_thing'}
			<section class="flex flex-1 flex-col items-center justify-center gap-7 text-center">
				<!--
					What the new thing actually is, before anyone is asked whether they
					tried it.

					This used to be a sentence, a wheel drawn in the workout's key, and a
					button saying **Tried it** — which reads as a receipt for something
					that never happened. Somebody meeting the app for the first time was
					shown the words "twelve-bar blues in C" and one control, in the past
					tense, claiming they had played it.

					So the chords come first. A rung's are the shapes it teaches, a
					progression's are its steps in order, and both can be sounded. The
					confirmation waits behind the offer instead of standing in for it.
				-->
				{#if noveltyChords.length}
					<ol class="novelty-chords">
						{#each noveltyChords as chord, i (`${chord.label}-${i}`)}
							<li class:is-sounding={soundingChord === i}>
								<span class="novelty-symbol">{chord.label}</span>
								{#if chord.degree}<span class="novelty-degree">{chord.degree}</span>{/if}
							</li>
						{/each}
					</ol>
				{/if}

				<Wheel
					{config}
					active={keyView.pitchClasses}
					degrees={keyView.degrees}
					highlights={noveltyHighlights.length ? noveltyHighlights : highlights}
					lit={session.live.map((n) => n % 12)}
					size={340}
					interactive={false}
				/>

				{#if audioProblem}
					<p class="audio-problem">{audioProblem}</p>
				{/if}

				<!--
					The controls, and which of them is the big one.

					**This is where the ladder stopped moving.** The new thing was the
					next rung — *the home chord, in C* — and the primary button under it
					said **Tried it**, which finishes the task and forgets. Opening the
					rung was a bordered afterthought beside it, and on a first workout it
					was not on the screen at all, because `openNext` waits for the
					standing rung to look solid and nothing had been answered yet. So the
					obvious path was the one that stood still: depart, meet the home
					chord, press the black button, and arrive back at an identical
					workout. Three times over, which is how it was reported.

					So when the new thing is a rung, **opening it is the primary
					action**. The button says which rung, it is the same form post that
					has always moved the ladder, and finishing without it is still there,
					quietly, for somebody who wants to sit on a rung longer. Nothing has
					become automatic and nothing is a gate: the difference is that the
					button doing what the screen describes is now the one that looks like
					it.
				-->
				<div class="flex flex-wrap items-center justify-center gap-3">
					{#if noveltyChords.length && !noveltyHeard}
						<button
							class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
							onclick={playNovelty}
							disabled={busy || playingNovelty}
							aria-describedby="new-thing-hands-free"
						>
							{playingNovelty ? 'Playing…' : 'Hear it'}
						</button>
					{:else if opensRung}
						<form method="POST" action="?/advance">
							<input type="hidden" name="sessionId" value={data.workout.id} />
							<input type="hidden" name="index" value={entry?.index} />
							<button
								class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
								disabled={busy}
								aria-describedby="new-thing-hands-free"
							>
								Open {opensRung.label.toLowerCase()}
							</button>
						</form>
					{:else}
						<button
							class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
							onclick={() => finishTask({ tried: true })}
							disabled={busy}
							aria-describedby="new-thing-hands-free">Tried it</button
						>
					{/if}

					{#if noveltyChords.length && noveltyHeard}
						<button
							class="border-ground-line text-ink rounded-2xl border px-6 py-4 font-semibold disabled:opacity-40"
							onclick={playNovelty}
							disabled={busy || playingNovelty}
						>
							{playingNovelty ? 'Playing…' : 'Hear it again'}
						</button>
					{/if}

					{#if opensRung && noveltyHeard}
						<button
							class="text-ink-dim hover:text-ink rounded-2xl px-4 py-4 font-semibold transition-colors disabled:opacity-40"
							onclick={() => finishTask({ tried: true })}
							disabled={busy}>Not yet</button
						>
					{/if}

					{#if task.novelty.kind === 'groove'}
						<a
							class="border-ground-line text-ink rounded-2xl border px-6 py-4 font-semibold"
							href="/backing">Open play along</a
						>
					{/if}

					<!--
						The other way on: the same offer, for a new thing that is not a
						rung. A progression or a groove leaves the ladder where it is, so
						on those the invitation to open more still rides beside them —
						which is what it was written for. Suppressed when the primary
						button above is already this exact move, or the screen would offer
						it twice.
					-->
					{#if workout?.openNext && !opensRung}
						<form method="POST" action="?/advance">
							<input type="hidden" name="sessionId" value={data.workout.id} />
							<input type="hidden" name="index" value={entry?.index} />
							<button
								class="border-ground-line hover:border-ink-dim rounded-2xl border px-6 py-4 font-semibold transition-colors"
							>
								{workout.openNext.move === 'deeper'
									? `Open ${workout.openNext.label.toLowerCase()}`
									: `Take it into ${glyph(workout.openNext.key)}`}
							</button>
						</form>
					{/if}
				</div>

				{#if workout?.openNext}
					<p class="open-offer">
						{#if workout.openNext.move === 'deeper'}
							<strong>{workout.openNext.label}</strong> is next — {workout.openNext.teaches}
						{:else}
							<strong>{workout.openNext.label}</strong> in {glyph(workout.openNext.key)} is next — the
							same idea somewhere new, which is where it stops being a shape you memorised.
						{/if}
						<span>
							{workout.openNext.solid
								? `${workout.openNext.from.correct} of ${workout.openNext.from.reviews} right on ${workout.openNext.from.label.toLowerCase()}.`
								: `You have answered ${workout.openNext.from.label.toLowerCase()} ${workout.openNext.from.reviews} times. Moving on is a suggestion, and nothing here is taken away.`}
						</span>
					</p>
				{/if}
				<span id="new-thing-hands-free" class="text-ink-dim font-mono text-[0.7rem]">
					<kbd>Space</kbd> / pedal · {noveltyChords.length && !noveltyHeard
						? 'hear it'
						: opensRung
							? 'opening a rung is a button, not a pedal'
							: 'next'}
				</span>
			</section>

			<!-- The questions the band cannot ask -------------------------------- -->
		{:else if currentCard && prompt}
			<section class="question-stage" class:is-success={answered}>
				<div class="question-heading">
					<div>
						<p class="phase-label">{guidanceTitle}</p>
						<h2>Question {Math.min(position + 1, asks)} of {asks}</h2>
					</div>
					<div class="text-right">
						<!--
							The second look, named where the round count is named.

							A card put back on the end of the run arrives looking exactly like
							a card that was always there, and it is not one: it is the one you
							got wrong, come round again. Said plainly and once, in the corner
							the phase labels already own, because it is context rather than a
							verdict — nothing here is a telling-off.
						-->
						{#if isRetry}
							<span class="round-label is-retry">a second look</span>
						{:else if (isSequential || isChordLesson) && lessonGuidance.rounds > 1}
							<span class="round-label"
								>round {lessonGuidance.round} of {lessonGuidance.rounds}</span
							>
						{:else if toPutRight}
							<span class="round-label">{toPutRight} to put right</span>
						{/if}
					</div>
				</div>

				<div
					class="question-progress"
					role="progressbar"
					aria-label="Questions answered"
					aria-valuemin="0"
					aria-valuemax={asks}
					aria-valuenow={Math.min(position + (answered ? 1 : 0), asks)}
				>
					<span style:transform={`scaleX(${questionProgress})`}></span>
				</div>

				<div class="question-core">
					<div class="prompt-panel">
						{#if isScaleLesson}
							<p class="prompt-kicker">
								{lessonPhase === 'watch' ? 'See it. Hear it.' : 'Play it.'}
							</p>
							<p class="prompt-name">{(currentCard.payload as { label: string }).label}</p>
							<p class="prompt-copy">
								{lessonPhase === 'watch'
									? 'Watch each note cross the piano — or start playing, and it is yours now.'
									: lessonGuidance.mode === 'recall'
										? 'The lights are gone. Build the same shape from memory.'
										: 'Play one note at a time. Every correct key stays lit.'}
							</p>
							{#if prompt.audible}
								<button class="hear-button" onclick={playQuestion} disabled={playingQuestion}>
									{playingQuestion
										? 'Playing the scale…'
										: lessonPhase === 'watch'
											? 'Watch and listen'
											: 'Hear it again'}
								</button>
							{/if}
						{:else if isChordLesson}
							<p class="prompt-kicker">
								{lessonPhase === 'watch'
									? 'See it. Hear it.'
									: lessonGuidance.mode === 'recall'
										? 'Remember it. Build it.'
										: 'Hold it together.'}
							</p>
							<p class="prompt-name">{chordPromptName}</p>
							{#if chordPromptContext}
								<p class="chord-context">{chordPromptContext}</p>
							{/if}
							<p class="prompt-copy">
								{lessonPhase === 'watch'
									? 'Watch the notes arrive together — or play the shape now, if you already have it.'
									: lessonGuidance.mode === 'guided'
										? 'The note names and keys stay visible while your hand learns the chord.'
										: lessonGuidance.mode === 'supported'
											? 'The shape stays on the keyboard, but the note names are gone.'
											: 'No keys are marked this time. Build the same chord from memory.'}
							</p>
							{#if questionAudio}
								<button class="hear-button" onclick={playQuestion} disabled={playingQuestion}>
									{playingQuestion
										? 'Playing the chord…'
										: lessonPhase === 'watch'
											? 'Watch and listen'
											: 'Hear the chord again'}
								</button>
							{/if}
						{:else if isPassage && passage}
							<!--
								A progression, posed as the movement it is.

								Two questions share this branch and differ in one line. `see_play`
								prints the numerals, which is the progression's own name, and asks
								for the spelling; `hear_play` prints nothing and plays it. Both are
								answered chord by chord on the route beside this panel.
							-->
							<p class="prompt-kicker">
								{prompt.visible ? 'Read it. Play it through.' : 'Hear it. Play it back.'}
							</p>
							{#if prompt.visible}
								<p class="prompt-name prompt-passage">{prompt.visible}</p>
							{:else if revealed}
								<p class="prompt-name prompt-passage">
									{(currentCard.payload as { label: string }).label}
								</p>
							{/if}
							<p class="prompt-copy">{prompt.instruction}</p>
							{#if soundsPassage}
								<button class="hear-button" onclick={playQuestion} disabled={playingQuestion}>
									{playingQuestion
										? 'Playing the progression…'
										: audioUnlocked
											? 'Hear it again'
											: 'Hear the progression'}
								</button>
							{/if}
						{:else if prompt.direction === 'pivot_play'}
							<p class="prompt-kicker">Turn the corner</p>
							<p class="pivot-functions">{prompt.visible}</p>
							<p class="prompt-copy">{prompt.instruction}</p>
						{:else if prompt.visible}
							<p class="prompt-name">{prompt.visible}</p>
						{:else if revealed}
							<p class="prompt-name">{(currentCard.payload as { label: string }).label}</p>
						{:else}
							<p class="prompt-copy">{prompt.instruction}</p>
							<button class="hear-button" onclick={playQuestion} disabled={playingQuestion}>
								{playingQuestion ? 'Playing…' : audioUnlocked ? 'Hear it again' : 'Hear question'}
							</button>
						{/if}
					</div>

					{#if isSequential}
						<ol
							class="note-route"
							aria-label="Scale notes"
							style:--steps={scaleRouteNotes.length || 8}
						>
							{#each scaleRouteNotes as note, noteIndex (noteIndex)}
								<li
									class:is-found={gathered.includes(
										(((scaleTarget[noteIndex] ?? -1) % 12) + 12) % 12
									)}
									class:is-demo={demoNotes.includes(scaleTarget[noteIndex])}
									style:--note-color={`var(--pc-${(((scaleTarget[noteIndex] ?? 0) % 12) + 12) % 12})`}
								>
									<!-- The note names, unless naming is the question. See `answerMayShow`. -->
									<span
										>{(lessonGuidance.showTargetLabels && answerMayShow) || showedAnswer
											? note
											: noteIndex + 1}</span
									>
								</li>
							{/each}
						</ol>
					{:else if isChordLesson}
						{#if lessonGuidance.mode !== 'recall' || showedAnswer || answered}
							<ol class="chord-shape" aria-label="Chord tones">
								{#each answerNotes as note, noteIndex (noteIndex)}
									{@const pc = answerPitchClasses[noteIndex] ?? 0}
									<li
										class:is-found={foundTargetNotes.some(
											(target) => ((target % 12) + 12) % 12 === pc
										)}
										class:is-demo={demoNotes.some((target) => ((target % 12) + 12) % 12 === pc)}
										style:--note-color={`var(--pc-${pc})`}
									>
										<span class="chord-note">
											{lessonGuidance.showTargetLabels || showedAnswer || answered
												? note
												: [1, 3, 5, 7][noteIndex]}
										</span>
										<span class="chord-role">{chordRoles[noteIndex]}</span>
									</li>
								{/each}
							</ol>
						{:else}
							<div class="memory-cue">
								<span aria-hidden="true">· · ·</span>
								<p>Listen to the shape in your head, then put it under your hand.</p>
							</div>
						{/if}
					{:else if isPassage && passage}
						<!--
							Where you are in the progression, and how far there is to go.

							The same job `note-route` does for a scale, in chords. What each box
							says depends on what the question has already given away: the numeral
							when it is printed above anyway, its position when nothing is, and the
							chord symbol once the answer is out — which is the moment a numeral
							and a spelling are worth seeing side by side.
						-->
						<ol class="passage-route" aria-label="Chords in order">
							{#each passage as step, stepIndex (stepIndex)}
								<li
									class:is-done={stepIndex < passageDone}
									class:is-current={stepIndex === passageDone && !answered}
									class:is-sounding={soundingStep === stepIndex}
								>
									<span class="passage-symbol">
										{showedAnswer || answered
											? step.symbol
											: prompt.visible
												? step.numeral
												: stepIndex + 1}
									</span>
									{#if showedAnswer || answered}
										<span class="passage-numeral">{step.numeral}</span>
									{/if}
								</li>
							{/each}
						</ol>
					{:else}
						<!--
							The wheel, and for a key question a *blank* one.

							Everywhere else it draws the workout's key with its degrees
							named, which is the context you are working in. When the question
							is which key you are in, that context is a wrong answer drawn
							large: it lit C and called it I while a cadence in G was playing.
							So the overlay comes off and what is left is the twelve notes and
							whatever your hands are doing — which is the right amount of help.
						-->
						<Wheel
							{config}
							active={isCrossingQuestion ? [] : keyView.pitchClasses}
							degrees={isCrossingQuestion ? undefined : keyView.degrees}
							highlights={isCrossingQuestion ? keyAnswerHighlights : highlights}
							lit={session.live.map((n) => n % 12)}
							size={280}
							interactive={false}
						/>
					{/if}
				</div>

				{#if audioProblem}
					<p class="audio-problem">{audioProblem}</p>
				{/if}

				{#if needsChoice && naming}
					<!--
						The naming half, with something to answer it with.

						There was no control here but "Reveal the name", which recorded a
						correct answer for pressing it — see `chooseName`. Four buttons is
						the smallest honest replacement: the right name, and three the
						record says you could actually confuse it with.
					-->
					<div
						class="name-choices"
						class:is-shapes={needsQuality}
						class:is-refused={refused}
						role="group"
						aria-label={needsQuality ? 'What kind of chord was that?' : 'What was it?'}
					>
						{#each answerChoices as option (option)}
							<button
								class="name-choice"
								class:is-picked={chosenName === option}
								class:is-right={answered && matchesAnswer(option)}
								class:is-wrong={wrongNames.includes(option)}
								disabled={answered || wrongNames.includes(option)}
								onclick={() => chooseName(option)}
							>
								{option}
							</button>
						{/each}
					</div>
				{/if}

				<div class="question-actions">
					<button
						class="secondary-action"
						onclick={showAnswer}
						disabled={showedAnswer || notesAlreadyShown}
					>
						{notesAlreadyShown ? 'Notes are shown' : 'Show the notes'}
					</button>
					<button class="quiet-action" onclick={skipCard}>
						{showedAnswer ? 'Next question' : 'Skip this question'}
					</button>
				</div>
			</section>
		{:else}
			<section class="grid flex-1 place-items-center">
				<p class="text-ink-dim font-mono text-sm">
					{busy ? 'saving…' : 'That was the last of them.'}
				</p>
			</section>
		{/if}

		<!-- Every task whose answer is played needs somewhere to play it. The
		     crossing task was missed when it was added, which on a machine with no
		     MIDI keyboard made its questions unanswerable — so this asks whether the
		     task holds cards rather than naming the kinds that do, and the next one
		     added inherits a keyboard by existing. -->
		{#if 'cardIds' in task}
			<footer class="keyboard-stage" class:is-success={answered}>
				<div class="keyboard-status">
					<p><span class="listening-dot"></span>{listeningLine}</p>
					<p class="keyboard-feedback" aria-live="polite" aria-atomic="true">{feedbackLine}</p>
				</div>
				<!-- Wide enough to play a scale in one hand without running out of
				     keyboard, which 25 keys was not. -->
				<Keyboard
					lit={session.live}
					target={targetNotes}
					found={foundTargetNotes}
					demo={demoNotes}
					labelTargets={notesAlreadyShown}
					onnoteon={(n) => virtual('noteon', n)}
					onnoteoff={(n) => virtual('noteoff', n)}
					from={keyboard.from}
					count={keyboard.count}
				/>
			</footer>

			<!--
				The pedal is named here for exactly the things it does, and while a
				question is waiting for your hands it does nothing — it used to mark
				the question wrong and move on, which is not a thing to advertise.
				What it *has* got back is the one control a question can offer before
				it has been answered: sounding it. See `advanceHandsFree`.
			-->
			<div class="hands-free-line">
				<span>
					{#if answered}
						<kbd>Space</kbd> / pedal · next
					{:else if questionUnheard}
						<kbd>Space</kbd>{pedalHears ? ' / pedal' : ''} · hear it
					{:else}
						<kbd>Space</kbd> · show me
					{/if}
				</span>
				<span>
					{answered
						? 'Moving on…'
						: questionUnheard
							? 'Or play it — the demonstration is not a gate'
							: naming
								? 'Answer on the screen'
								: 'Keep both hands on the piano — the pedal is yours'}
				</span>
			</div>
		{/if}

		{#if problem}
			<p class="mt-3 font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
		{/if}
	{:else}
		<div class="grid flex-1 place-items-center text-center">
			<div>
				<button
					class="bg-ink text-ground rounded-lg px-5 py-3 font-semibold disabled:opacity-40"
					onclick={endWorkout}
					disabled={busy}>Finish</button
				>
			</div>
		</div>
	{/if}
</main>

<style>
	kbd {
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 4px;
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font: inherit;
	}

	/*
	 * A mission's last word, drawn in weight rather than hue: a met goal in full
	 * ink and a missed one dimmed. Nothing goes red — a mission short of its bar
	 * is a mission to play again, not a telling-off — and a verdict has no pitch
	 * in it, so it does not get a colour.
	 */
	.verdict {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		line-height: 1.5;
		max-width: 32rem;
		color: var(--color-ink-dim);
	}

	.verdict.is-met {
		color: var(--color-ink);
	}

	.workout-rail {
		margin-bottom: 1rem;
		border-block: 1px solid var(--color-ground-line);
		padding-block: 0.65rem;
	}

	.workout-rail ol {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
		gap: 0.5rem;
	}

	.workout-rail li {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.25;
	}

	.workout-rail li.is-current {
		color: var(--color-ink);
		font-weight: 600;
	}

	.workout-rail li.is-done {
		color: var(--color-ink-muted);
	}

	.task-marker {
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		flex: none;
		place-items: center;
		border: 1px solid var(--color-ground-line);
		border-radius: 999px;
		font-variant-numeric: tabular-nums;
	}

	.is-current .task-marker {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-ground);
	}

	.task-tag {
		flex: none;
		padding: 0.05rem 0.4rem;
		border-radius: 999px;
		border: 1px solid var(--color-ground-line);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		letter-spacing: 0.03em;
		color: var(--color-ink-dim);
		white-space: nowrap;
	}

	/* Between the route table and the question: context, at the weight of
	   context. It sits above the prompt because it is what the prompt is about,
	   and it never competes with it. */
	/* The board's chip, so a control looks the same wherever it is. */
	.task-action {
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-muted);
		transition:
			background 120ms ease,
			border-color 120ms ease,
			color 120ms ease;
	}

	.task-action:hover:not(:disabled) {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.task-action:disabled {
		opacity: 0.4;
	}

	.task-action.is-exit {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.task-action.is-exit:hover:not(:disabled) {
		background: var(--color-ground-overlay);
	}

	.route-bar {
		margin: 0.55rem 0 0.1rem;
		padding: 0.5rem 0.15rem;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
		border-bottom: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
	}

	.task-instruction {
		max-width: 62ch;
		margin-bottom: 1.25rem;
		color: var(--color-ink-muted);
		font-size: 1rem;
		line-height: 1.55;
	}

	.question-stage {
		display: flex;
		flex: 1;
		flex-direction: column;
		justify-content: center;
		gap: 1rem;
		min-height: 20rem;
		padding-block: 0.5rem 1rem;
	}

	.question-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.phase-label,
	.round-label,
	.prompt-kicker {
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.phase-label {
		margin-bottom: 0.2rem;
		color: var(--color-ink-muted);
		font-size: 0.76rem;
	}

	/* Where this question came from. Dim ink, because a key's *name* is not a
	   swatch and this line is a label rather than a pitch. */
	/* Two numerals and two keys, read as a phrase rather than shouted as a chord
	   name — the whole question is that they are one chord, not two. */
	.pivot-functions {
		font-family: var(--font-mono);
		font-size: 1.15rem;
		line-height: 1.4;
		color: var(--color-ink);
		text-wrap: balance;
	}

	.question-heading h2 {
		font-family: var(--font-display);
		font-size: 1.45rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.1;
		color: var(--color-ink);
		font-variant-numeric: tabular-nums;
	}

	.round-label {
		padding-bottom: 0.15rem;
		color: var(--color-ink-dim);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}

	.question-progress {
		height: 0.4rem;
		overflow: hidden;
		border-radius: 999px;
		background: var(--color-ground-raised);
	}

	.question-progress span {
		display: block;
		width: 100%;
		height: 100%;
		transform-origin: left center;
		border-radius: inherit;
		background: var(--color-ink);
		transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
	}

	.question-core {
		display: grid;
		grid-template-columns: minmax(15rem, 0.9fr) minmax(18rem, 1.1fr);
		align-items: center;
		gap: 2rem;
		min-height: 11rem;
		padding-block: 0.75rem;
	}

	.prompt-panel {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.7rem;
	}

	.prompt-kicker {
		color: var(--color-ink-dim);
		font-size: 0.7rem;
	}

	.prompt-name {
		color: var(--color-ink);
		font-family: var(--font-display);
		font-size: clamp(2.25rem, 7vw, 4rem);
		font-weight: 600;
		letter-spacing: -0.04em;
		line-height: 0.95;
	}

	.prompt-copy {
		max-width: 38ch;
		color: var(--color-ink-muted);
		font-size: 1rem;
		line-height: 1.55;
	}

	/* A progression's name is a phrase, not a symbol, so it does not get the size
	   a single chord name gets — `ii7 – V7 – Imaj7` at four rem wraps to three
	   lines and stops reading as one movement. */
	.prompt-passage {
		font-size: clamp(1.6rem, 4vw, 2.4rem);
		letter-spacing: -0.02em;
		line-height: 1.15;
		text-wrap: balance;
	}

	.chord-context {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
	}

	.hear-button,
	.secondary-action,
	.quiet-action {
		min-height: 2.75rem;
		border-radius: 10px;
		padding: 0.65rem 1rem;
		font-weight: 600;
		transition:
			transform 120ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 120ms linear,
			color 120ms linear;
	}

	.hear-button,
	.secondary-action {
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink);
	}

	.quiet-action {
		color: var(--color-ink-dim);
	}

	.hear-button:active,
	.secondary-action:active,
	.quiet-action:active {
		transform: scale(0.98);
	}

	.hear-button:focus-visible,
	.secondary-action:focus-visible,
	.quiet-action:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 3px;
	}

	/*
	 * The naming answers.
	 *
	 * Wide targets set in the chart face, because the question is "which of these
	 * is it" and the symbols are what is being compared — small buttons with a
	 * label beside them would make it a reading task. Right and wrong are marked
	 * with the same two pitch-class colours the rest of the app answers in, so the
	 * feedback reads without being read.
	 */
	/*
	 * The invitation to open more ladder.
	 *
	 * Under the buttons rather than above them, and set as a sentence rather than
	 * a badge: it is a suggestion about what to do next, and a suggestion that
	 * shouts is a demand. The second half says why it is being offered, because
	 * "twelve of fifteen right" and "you have answered this eighty-five times" are
	 * different invitations.
	 */
	/* The new thing, laid out as chords rather than described as one.

	   A row, in reading order, because a progression *is* an order and a rung's
	   shapes are read the same way. The chord sounding lights up, which is the
	   whole reason the notes are on screen: hearing four symbols go past teaches
	   nothing, watching the one you are hearing teaches which is which. */
	.novelty-chords {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		max-width: 40rem;
		margin: 0 auto;
		padding: 0;
		list-style: none;
	}

	.novelty-chords li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		min-width: 4.5rem;
		padding: 0.55rem 0.8rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 10px;
		background: var(--color-ground-raised);
		transition:
			border-color 160ms var(--ease-wheel),
			transform 160ms var(--ease-wheel);
	}

	.novelty-chords li.is-sounding {
		border-color: var(--color-ink-dim);
		transform: translateY(-2px);
	}

	.novelty-symbol {
		font-family: var(--font-display);
		font-size: 1.2rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--color-ink);
	}

	.novelty-degree {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
	}

	@media (prefers-reduced-motion: reduce) {
		.novelty-chords li {
			transition: none;
		}

		.novelty-chords li.is-sounding {
			transform: none;
		}
	}

	.open-offer {
		max-width: 44ch;
		margin: 0 auto;
		color: var(--color-ink-muted);
		font-size: 0.9rem;
		line-height: 1.6;
		text-wrap: pretty;
	}

	.open-offer span {
		display: block;
		margin-top: 0.35rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.name-choices {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
		gap: 0.6rem;
		width: 100%;
		max-width: 34rem;
		margin: 0 auto;
	}

	/*
	 * The quality row, which holds words rather than symbols.
	 *
	 * `Cmaj7` is five characters and `dominant seventh` is sixteen, so the column
	 * that fits the naming buttons cuts these in half. Wider columns, a smaller
	 * face and a break opportunity at the space: every shape this app offers is
	 * one or two words, so two short lines in a button is the worst case and it
	 * is a tidy one. There are up to seven of these rather than four, which the
	 * `auto-fit` grid already handles by adding rows.
	 */
	.name-choices.is-shapes {
		grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
		max-width: 38rem;
	}

	.name-choices.is-shapes .name-choice {
		font-size: 0.95rem;
		line-height: 1.25;
		text-wrap: balance;
		hyphens: auto;
	}

	.name-choice {
		min-height: 3.25rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		padding: 0.7rem 0.5rem;
		color: var(--color-ink);
		font-size: 1.15rem;
		font-weight: 600;
		transition:
			transform 120ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 120ms linear,
			background-color 120ms linear;
	}

	.name-choice:not(:disabled):hover {
		border-color: var(--color-ink-dim);
	}

	.name-choice:not(:disabled):active {
		transform: scale(0.98);
	}

	.name-choice:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 3px;
	}

	.name-choice.is-right {
		border-color: var(--pc-7);
		background: color-mix(in oklab, var(--pc-7) 16%, transparent);
	}

	.name-choice.is-wrong {
		border-color: var(--pc-0);
		background: color-mix(in oklab, var(--pc-0) 16%, transparent);
	}

	/* Disabled only because the question is over, so nothing is dimmed to
	   unreadable — the answer has to stay legible while it settles. */
	.name-choice:disabled {
		opacity: 0.75;
	}

	.name-choice.is-right:disabled,
	.name-choice.is-picked:disabled {
		opacity: 1;
	}

	/*
	 * A name that has been tried and refused stays on the screen and stops being
	 * an option. Legible, because knowing what you *thought* it was is half of
	 * knowing what it is; struck through, because the question is still open and
	 * three buttons that all look answerable is not the state it is in.
	 */
	.name-choice.is-wrong:disabled {
		opacity: 0.6;
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	/*
	 * No, said the way a person says it.
	 *
	 * Left, right, back, over in four hundred milliseconds — a head shake on the
	 * row where the answer was given. Nothing flashes and nothing turns the page
	 * red; this is the whole of the app's vocabulary for a wrong answer and it is
	 * deliberately smaller than the vocabulary for a right one. Reduced motion
	 * gets the colour on the button and the line under the keyboard, which were
	 * always the parts carrying the meaning.
	 */
	.name-choices.is-refused {
		animation: refuse 400ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
	}

	@keyframes refuse {
		0%,
		100% {
			transform: translateX(0);
		}
		15% {
			transform: translateX(-0.5rem);
		}
		40% {
			transform: translateX(0.4rem);
		}
		65% {
			transform: translateX(-0.25rem);
		}
		85% {
			transform: translateX(0.12rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.name-choices.is-refused {
			animation: none;
		}
	}

	/* Not a badge and not a warning: the same mono corner label the rounds use,
	   because coming back to a question is a fact about where you are in the run.
	   Full ink, because it is the one thing on the line worth reading twice. */
	.round-label.is-retry {
		color: var(--color-ink);
	}

	/*
	 * As many stops as the scale has, and never one wider than the column it is
	 * in.
	 *
	 * Eight columns of at least two rem each is nine centimetres of hard floor
	 * inside a track whose own floor is eighteen rem, so between those two
	 * numbers the row simply ran past the right-hand edge — the same complaint as
	 * the keyboard window, one element up, and the reason it read as *the scale
	 * runs off the screen* wherever the panel got narrow. `minmax(0, 1fr)` cannot
	 * do that: the circles get smaller instead, which is what a row of eight
	 * things in a small space is supposed to do. And the count is the scale's own,
	 * so a six-note scale stops leaving two empty columns on the end.
	 */
	.note-route {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--steps, 8), minmax(0, 1fr));
		gap: 0.5rem;
		align-items: center;
		width: 100%;
	}

	.note-route::before {
		content: '';
		position: absolute;
		z-index: 0;
		top: 50%;
		left: 5%;
		right: 5%;
		height: 1px;
		background: var(--color-ground-line);
	}

	.note-route li {
		position: relative;
		z-index: 1;
		display: grid;
		aspect-ratio: 1;
		min-width: 0;
		place-items: center;
		border: 2px solid var(--color-ground-line);
		border-radius: 999px;
		background: var(--color-ground);
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		font-weight: 600;
		transition:
			transform 150ms cubic-bezier(0.25, 1, 0.5, 1),
			opacity 150ms linear;
	}

	.note-route li.is-found,
	.note-route li.is-demo {
		border-color: var(--note-color);
		background: var(--note-color);
		color: var(--color-ground);
	}

	.note-route li.is-demo {
		transform: translateY(-0.4rem) scale(1.08);
	}

	.chord-shape {
		position: relative;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(3.75rem, 1fr));
		gap: 0.6rem;
		align-items: center;
		width: 100%;
		max-width: 28rem;
		justify-self: center;
	}

	.chord-shape::before {
		content: '';
		position: absolute;
		z-index: 0;
		top: 2rem;
		left: 7%;
		right: 7%;
		height: 1px;
		background: var(--color-ground-line);
	}

	.chord-shape li {
		position: relative;
		z-index: 1;
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
		transition:
			transform 180ms cubic-bezier(0.25, 1, 0.5, 1),
			opacity 120ms linear;
	}

	.chord-note {
		display: grid;
		width: 4rem;
		max-width: 100%;
		aspect-ratio: 1;
		place-items: center;
		border: 2px solid var(--note-color);
		border-radius: 999px;
		background: color-mix(in oklab, var(--note-color) 24%, var(--color-ground));
		color: var(--color-ink);
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		transition:
			background 120ms linear,
			color 120ms linear;
	}

	.chord-role {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.65rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.chord-shape li.is-found .chord-note,
	.chord-shape li.is-demo .chord-note {
		background: var(--note-color);
		color: var(--color-ground);
	}

	.chord-shape li.is-demo {
		transform: translateY(-0.35rem);
	}

	/*
	 * The progression, as a row of chords with a place in it.
	 *
	 * Built like `.novelty-chords` on the new-thing screen, because it is the same
	 * object seen twice — there to be heard, here to be answered — and a player
	 * who has just been shown a ii–V–I should recognise the shape of the thing
	 * they are being asked for. What it adds is a state: chords behind you, the
	 * one being asked for, and the one sounding while the question plays.
	 */
	.passage-route {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		max-width: 28rem;
		justify-self: center;
		padding: 0;
		list-style: none;
	}

	.passage-route li {
		display: flex;
		min-width: 4rem;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 10px;
		background: var(--color-ground-raised);
		color: var(--color-ink-dim);
		transition:
			border-color 160ms cubic-bezier(0.25, 1, 0.5, 1),
			color 160ms linear,
			transform 160ms cubic-bezier(0.25, 1, 0.5, 1);
	}

	/* Done in full ink and pending dimmed, which is the same weight-not-hue rule
	   the verdict keeps: a chord you have not reached yet is not a mistake. */
	.passage-route li.is-done {
		border-color: var(--color-ink-muted);
		color: var(--color-ink);
	}

	.passage-route li.is-current {
		border-color: var(--color-ink);
		color: var(--color-ink);
	}

	.passage-route li.is-sounding {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
		transform: translateY(-2px);
	}

	.passage-symbol {
		color: inherit;
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.passage-numeral {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.memory-cue {
		display: flex;
		max-width: 23rem;
		justify-self: center;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		color: var(--color-ink-dim);
		text-align: center;
	}

	.memory-cue span {
		color: var(--color-ink-muted);
		font-family: var(--font-display);
		font-size: 3rem;
		letter-spacing: 0.35em;
		line-height: 0.8;
	}

	.memory-cue p {
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.audio-problem {
		color: var(--pc-0);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.question-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}

	.keyboard-stage {
		position: relative;
		margin-top: 0.75rem;
		padding: 1rem 1rem 0.65rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 16px;
		background: var(--color-ground-raised);
		transition:
			transform 200ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 150ms linear;
	}

	.keyboard-stage.is-success {
		transform: translateY(-0.2rem);
		border-color: var(--color-ink-muted);
	}

	.keyboard-status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.keyboard-status p:first-child {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-ink-muted);
	}

	.listening-dot {
		width: 0.55rem;
		height: 0.55rem;
		flex: none;
		border: 2px solid var(--color-ink);
		border-radius: 999px;
		background: var(--color-ground);
	}

	.keyboard-feedback {
		color: var(--color-ink);
		font-weight: 600;
		text-align: right;
	}

	.hands-free-line {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.65rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	@media (hover: hover) {
		.hear-button:hover,
		.secondary-action:hover {
			border-color: var(--color-ink-muted);
		}

		.quiet-action:hover {
			color: var(--color-ink);
		}
	}

	@media (max-width: 720px) {
		.workout-rail ol {
			display: flex;
			overflow-x: auto;
			padding-bottom: 0.2rem;
		}

		.workout-rail li {
			min-width: max-content;
		}

		.question-core {
			grid-template-columns: minmax(0, 1fr);
			gap: 1.25rem;
		}

		.prompt-panel {
			align-items: center;
			text-align: center;
		}

		.note-route {
			gap: 0.25rem;
		}

		.note-route li {
			font-size: 0.72rem;
		}

		.chord-shape {
			grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
			gap: 0.35rem;
		}

		.passage-route {
			gap: 0.35rem;
		}

		.passage-route li {
			min-width: 3.25rem;
			padding: 0.45rem 0.5rem;
		}

		.chord-note {
			width: 3.25rem;
			font-size: 1rem;
		}

		.keyboard-status,
		.hands-free-line {
			align-items: flex-start;
			flex-direction: column;
		}

		.keyboard-feedback {
			text-align: left;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.question-progress span,
		.note-route li,
		.chord-shape li,
		.passage-route li,
		.chord-note,
		.keyboard-stage,
		.hear-button,
		.name-choice,
		.secondary-action,
		.quiet-action {
			transition: none;
		}

		.note-route li.is-demo,
		.chord-shape li.is-demo,
		.passage-route li.is-sounding,
		.keyboard-stage.is-success {
			transform: none;
		}
	}
</style>
