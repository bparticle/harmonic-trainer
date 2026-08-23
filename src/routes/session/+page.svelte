<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { midi as session } from '$lib/midi/shared.svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { playChord, playSequence, startAudio, stopAll } from '$lib/audio/engine';
	import { markGathered, markPlayed, pose, toVoicing } from '$lib/session/drill';
	import { guidanceFor, guidanceKey, isChordShape, type LessonCard } from '$lib/session/lesson';
	import { gradeFromPerformance } from '$lib/srs/scheduler';
	import { parseKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { describeGoal, type Verdict } from '$lib/practice/goal';
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
	let cardIndex = $state(0);
	let askedAt = $state(0);
	let answered = $state(false);
	let lastMarking = $state<{ correct: boolean; missing: number[]; extra: number[] } | null>(null);
	let revealed = $state(false);
	/** Pitch classes played since this card was posed, for the ones built up over time. */
	let gathered = $state<number[]>([]);
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
	const currentCard = $derived(taskCards[cardIndex] ?? null);
	const promptKey = $derived(currentCard ? `${index}:${cardIndex}:${currentCard.id}` : null);
	const lessonGuidance = $derived(guidanceAt(index, cardIndex));
	const prompt = $derived(
		currentCard
			? pose(currentCard.direction, currentCard.payload as never, 60, currentCard.keyCenter)
			: null
	);

	/**
	 * How many questions this task asks.
	 *
	 * The queue's own length, which is the goal's own count — the composer set
	 * both from the same number, and reading it off the cards keeps the progress on
	 * screen honest if a card ever fails to load.
	 */
	const asks = $derived(
		task && (task.kind === 'ear' || task.kind === 'function') ? task.cardIds.length : 0
	);
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
			advanceHandsFree();
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

	// Reset the per-task state whenever the task changes.
	$effect(() => {
		const taskIndex = index;
		untrack(() => {
			cardIndex = 0;
			answered = false;
			revealed = false;
			lastMarking = null;
			gathered = [];
			showedAnswer = false;
			cardRecorded = false;
			pending = [];
			askedAt = performance.now();
			audioProblem = null;
			demoRun++;
			cardRun++;
			demoNotes = [];
			lessonPhase = openingPhase(taskIndex, 0);
		});
	});

	/** True for the things played one note after another rather than together. */
	const isSequential = $derived(
		(currentCard?.payload as { kind?: string } | undefined)?.kind === 'scale'
	);

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

	/** Once audio has been unlocked by a tap, later questions can play automatically. */
	$effect(() => {
		if (!audioUnlocked || !questionAudio || answered || !promptKey || playedPromptKey === promptKey)
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

	async function playQuestion() {
		if (!questionAudio || !currentCard || !promptKey || playingQuestion) return;
		const thisPromptKey = promptKey;
		const audible = questionAudio;
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
			 */
			if (isSequential) {
				const sequence = playSequence(audible, 0.4);
				const demonstration =
					lessonGuidance.mode === 'guided'
						? animateScale(audible, 400)
						: wait(audible.length * 400);
				await Promise.all([sequence, demonstration]);
				if (lessonPhase === 'watch') lessonPhase = 'play';
			} else if (isChordLesson && lessonGuidance.mode === 'guided') {
				const run = ++demoRun;
				demoNotes = audible;
				await playChord(audible, 1.9);
				await wait(1900);
				if (run === demoRun) demoNotes = [];
				if (lessonPhase === 'watch') lessonPhase = 'play';
			} else {
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

	function handleNote(note: number) {
		if (
			!isSequential ||
			!marksPlaying ||
			answered ||
			playingQuestion ||
			lessonPhase !== 'play' ||
			!currentCard
		)
			return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		const pc = ((note % 12) + 12) % 12;
		gathered = [...new Set([...gathered, pc])];
		const marking = markGathered(expected, gathered);
		lastMarking = marking;
		if (marking.correct) completeAnswer();
	}

	function handleChord(chord: { notes: number[] }) {
		if (
			!marksPlaying ||
			answered ||
			!currentCard ||
			isSequential ||
			playingQuestion ||
			lessonPhase !== 'play'
		)
			return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		const marking = markPlayed(toVoicing(expected), chord.notes);
		lastMarking = marking;
		if (marking.correct) completeAnswer();
	}

	function completeAnswer() {
		answered = true;
		revealed = true;
		record(gradeFromPerformance(true, Math.round(performance.now() - askedAt)), true);
		const run = cardRun;
		setTimeout(
			() => {
				if (run === cardRun) nextCard();
			},
			isSequential ? 1150 : isChordLesson ? 950 : 650
		);
	}

	function record(rating: ReviewRating, correct: boolean) {
		if (!currentCard || cardRecorded) return;
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
		cardRun++;
		const next = cardIndex + 1;
		answered = false;
		revealed = false;
		lastMarking = null;
		gathered = [];
		showedAnswer = false;
		cardRecorded = false;
		askedAt = performance.now();
		demoRun++;
		demoNotes = [];
		cardIndex = next;
		lessonPhase = openingPhase(index, next);

		// Done when done: the goal is a count of questions, and the last answer is
		// what meets it. Nothing here waits for a timer or for a button.
		if (next >= taskCards.length) void finishTask({ asked: pending.length });
	}

	/**
	 * Give up and be shown it.
	 *
	 * Not the same as skipping: you see the notes, so the next time round is a real
	 * attempt rather than another blank. It still counts as needing help, which is
	 * exactly what the scheduler should know.
	 */
	function showAnswer() {
		if (!currentCard || showedAnswer) return;
		showedAnswer = true;
		revealed = true;
		lessonPhase = 'play';
		record('again', false);
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
		if (!isChordLesson || session.live.length === 0) return null;
		return markPlayed(chordTarget, session.live);
	});
	const activeMarking = $derived(liveChordMarking ?? lastMarking);

	/** What is still missing, as note names rather than a bare count. */
	const missingNotes = $derived(
		(activeMarking?.missing ?? []).map((pc) =>
			formatNote(spell(pc, cardContext), { unicode: true })
		)
	);
	const extraNotes = $derived(
		(activeMarking?.extra ?? []).map((pc) => formatNote(spell(pc, cardContext), { unicode: true }))
	);

	const scaleTarget = $derived(isSequential ? (prompt?.audible ?? []) : []);
	const targetNotes = $derived.by(() => {
		if (isSequential && (lessonGuidance.showTarget || showedAnswer || answered)) return scaleTarget;
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
		if (isSequential)
			return scaleTarget.filter((note) => gathered.includes(((note % 12) + 12) % 12));
		if (!isChordLesson || (!activeMarking && !answered)) return [];
		const missing = new Set(answered ? [] : (activeMarking?.missing ?? []));
		return chordTarget.filter((note) => !missing.has(((note % 12) + 12) % 12));
	});
	const questionProgress = $derived(
		asks ? Math.min(1, (cardIndex + (answered ? 1 : 0)) / asks) : 0
	);
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
	const guidanceTitle = $derived.by(() => {
		if (isSequential) {
			if (lessonPhase === 'watch') return 'Watch the scale move';
			if (lessonGuidance.mode === 'guided') return 'Your turn — follow the lights';
			if (lessonGuidance.mode === 'supported') return 'Again — with fewer hints';
			return 'Now play it from memory';
		}
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
		if (answered && currentCard) {
			const label = (currentCard.payload as { label: string }).label;
			return isChordLesson ? `${label} — chord complete` : `${label} — every note found`;
		}
		if (playingQuestion) {
			if (isChordLesson && lessonGuidance.mode === 'guided')
				return 'Watch every note land together';
			if (isSequential && lessonGuidance.mode === 'guided') return 'Follow the moving key';
			return 'Listen first';
		}
		if (lessonPhase === 'watch') return 'Start with a demonstration';
		if (isSequential && gathered.length) {
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

	function skipCard() {
		if (currentCard && !answered) record('again', false);
		nextCard();
	}

	/** Pedal or spacebar: whatever "next" means for the task showing. */
	function advanceHandsFree() {
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
			void finishTask({ tried: true });
			return;
		}
		if (prompt && !answered) {
			if (prompt.answerWith === 'name' && !marksPlaying && !revealed) {
				revealed = true;
				record('good', true);
				return;
			}
			skipCard();
			return;
		}
		if (currentCard) nextCard();
	}

	function onKeydown(event: KeyboardEvent) {
		if (!shouldHandleSpace(event)) return;
		event.preventDefault();
		advanceHandsFree();
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
				index = next;
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

	const highlights = $derived.by((): Highlight[] => {
		const shapes: Highlight[] = [{ cells: keyView.scaleCells, strength: 0.4, outline: true }];

		if ((prompt?.visible || revealed) && currentCard) {
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

<svelte:head><title>Workout · Harmonic Trainer</title></svelte:head>
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
				<ul class="mb-7 flex flex-col gap-2">
					{#each report.says as line, i (i)}
						<li class="text-ink-muted leading-relaxed">{line}</li>
					{/each}
				</ul>
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
			<div class="flex min-w-0 flex-wrap items-baseline gap-2 sm:gap-3">
				<h1 class="font-display text-ink text-lg font-semibold tracking-tight">{task.title}</h1>
				<span class="text-ink-muted font-mono text-xs">
					Task {progress} · {glyph(workout?.keyCenter ?? '')}
				</span>
			</div>
			<div class="flex items-center gap-2 sm:gap-4">
				<!-- The goal, in view for as long as the task runs. -->
				<span class="text-ink-dim font-mono text-[0.7rem]">{goalLine}</span>
				<button
					class="text-ink-dim hover:text-ink rounded-md px-2 py-2 font-mono text-xs transition-colors"
					onclick={() => finishTask({ skipped: true })}
					aria-label="Skip task"
					disabled={busy}>skip</button
				>
				<!-- Two different exits, each named for what it actually does. One
				     button called "leave" kept the workout open, which is how a
				     workout opened to look at the screen ended up following somebody
				     around all day. -->
				<button
					class="text-ink-dim hover:text-ink rounded-md px-2 py-2 font-mono text-xs transition-colors"
					onclick={leave}
					aria-label="Keep workout for later">later</button
				>
				<button
					class="text-ink-dim hover:text-ink rounded-md px-2 py-2 font-mono text-xs transition-colors"
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
				<Wheel
					{config}
					active={keyView.pitchClasses}
					degrees={keyView.degrees}
					{highlights}
					lit={session.live.map((n) => n % 12)}
					size={340}
					interactive={false}
				/>

				<div class="flex flex-wrap items-center justify-center gap-3">
					<button
						class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
						onclick={() => finishTask({ tried: true })}
						disabled={busy}
						aria-describedby="new-thing-hands-free">Tried it</button
					>

					<!-- The one place "ready to move on" is said out loud. A form post
					     rather than a fetch, because moving the ladder is a decision the
					     server owns and the page has nothing to keep afterwards. -->
					{#if task.novelty.kind === 'rung'}
						<form method="POST" action="?/advance">
							<input type="hidden" name="sessionId" value={data.workout.id} />
							<input type="hidden" name="index" value={entry?.index} />
							<input type="hidden" name="key" value={task.novelty.key} />
							<input type="hidden" name="rung" value={task.novelty.rungId} />
							<button
								class="border-ground-line hover:border-ink-dim rounded-2xl border px-6 py-4 font-semibold transition-colors"
								>Move the ladder here</button
							>
						</form>
					{/if}
				</div>
				<span id="new-thing-hands-free" class="text-ink-dim font-mono text-[0.7rem]">
					<kbd>Space</kbd> / pedal · next
				</span>
			</section>

			<!-- The questions the band cannot ask -------------------------------- -->
		{:else if currentCard && prompt}
			<section class="question-stage" class:is-success={answered}>
				<div class="question-heading">
					<div>
						<p class="phase-label">{guidanceTitle}</p>
						<h2>Question {Math.min(cardIndex + 1, asks)} of {asks}</h2>
					</div>
					{#if (isSequential || isChordLesson) && lessonGuidance.rounds > 1}
						<span class="round-label">round {lessonGuidance.round} of {lessonGuidance.rounds}</span>
					{/if}
				</div>

				<div
					class="question-progress"
					role="progressbar"
					aria-label="Questions answered"
					aria-valuemin="0"
					aria-valuemax={asks}
					aria-valuenow={Math.min(cardIndex + (answered ? 1 : 0), asks)}
				>
					<span style:transform={`scaleX(${questionProgress})`}></span>
				</div>

				<div class="question-core">
					<div class="prompt-panel">
						{#if isSequential}
							<p class="prompt-kicker">
								{lessonPhase === 'watch' ? 'See it. Hear it.' : 'Play it.'}
							</p>
							<p class="prompt-name">{(currentCard.payload as { label: string }).label}</p>
							<p class="prompt-copy">
								{lessonPhase === 'watch'
									? 'Watch each note cross the piano. Then the keyboard becomes yours.'
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
									? 'Watch the notes arrive together. Then copy that shape on your piano.'
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
						<ol class="note-route" aria-label="Scale notes">
							{#each answerNotes as note, noteIndex (noteIndex)}
								<li
									class:is-found={gathered.includes(
										(((scaleTarget[noteIndex] ?? -1) % 12) + 12) % 12
									)}
									class:is-demo={demoNotes.includes(scaleTarget[noteIndex])}
									style:--note-color={`var(--pc-${(((scaleTarget[noteIndex] ?? 0) % 12) + 12) % 12})`}
								>
									<span
										>{lessonGuidance.showTargetLabels || showedAnswer ? note : noteIndex + 1}</span
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
					{:else}
						<Wheel
							{config}
							active={keyView.pitchClasses}
							degrees={keyView.degrees}
							{highlights}
							lit={session.live.map((n) => n % 12)}
							size={280}
							interactive={false}
						/>
					{/if}
				</div>

				{#if audioProblem}
					<p class="audio-problem">{audioProblem}</p>
				{/if}

				<div class="question-actions">
					{#if prompt.answerWith === 'name' && !marksPlaying && !revealed}
						<button class="primary-action" onclick={advanceHandsFree}>Reveal the name</button>
					{/if}
					<button
						class="secondary-action"
						onclick={showAnswer}
						disabled={showedAnswer ||
							((isSequential || isChordLesson) && lessonGuidance.showTargetLabels)}
					>
						{(isSequential || isChordLesson) && lessonGuidance.showTargetLabels
							? 'Notes are shown'
							: 'Show the notes'}
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

		{#if task.kind === 'ear' || task.kind === 'function'}
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
					labelTargets={(isSequential || isChordLesson) && lessonGuidance.showTargetLabels}
					onnoteon={(n) => virtual('noteon', n)}
					onnoteoff={(n) => virtual('noteoff', n)}
					from={48}
					count={29}
				/>
			</footer>

			<div class="hands-free-line">
				<span><kbd>Space</kbd> / pedal · next</span>
				<span>{answered ? 'Moving on…' : 'Keep both hands on the piano'}</span>
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

	.chord-context {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
	}

	.hear-button,
	.primary-action,
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

	.primary-action {
		background: var(--color-ink);
		color: var(--color-ground);
	}

	.quiet-action {
		color: var(--color-ink-dim);
	}

	.hear-button:active,
	.primary-action:active,
	.secondary-action:active,
	.quiet-action:active {
		transform: scale(0.98);
	}

	.hear-button:focus-visible,
	.primary-action:focus-visible,
	.secondary-action:focus-visible,
	.quiet-action:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 3px;
	}

	.note-route {
		position: relative;
		display: grid;
		grid-template-columns: repeat(7, minmax(2.5rem, 1fr));
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
		min-width: 2.75rem;
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
			gap: 0.3rem;
		}

		.note-route li {
			min-width: 2.35rem;
			font-size: 0.72rem;
		}

		.chord-shape {
			grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
			gap: 0.35rem;
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
		.chord-note,
		.keyboard-stage,
		.hear-button,
		.primary-action,
		.secondary-action,
		.quiet-action {
			transition: none;
		}

		.note-route li.is-demo,
		.chord-shape li.is-demo,
		.keyboard-stage.is-success {
			transform: none;
		}
	}
</style>
