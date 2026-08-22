<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { midi as session } from '$lib/midi/shared.svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { playChord, playSequence, startAudio, stopAll } from '$lib/audio/engine';
	import { markGathered, markPlayed, pose, toVoicing } from '$lib/session/drill';
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
	 * Three to five tasks in order, each with a goal that can be met rather than a
	 * clock that runs out. A task ends when its goal is met — ten questions
	 * answered, a mission's bar cleared, one new thing tried — and nothing here
	 * counts down at anything.
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
	let audioUnlocked = $state(false);
	let playedPromptId = $state<string | null>(null);
	let playingQuestion = $state(false);
	let audioProblem = $state<string | null>(null);

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
		return () => {
			stopPedal();
			stopChord();
		};
	});

	// Reset the per-task state whenever the task changes.
	$effect(() => {
		void index;
		cardIndex = 0;
		answered = false;
		revealed = false;
		lastMarking = null;
		gathered = [];
		showedAnswer = false;
		pending = [];
		askedAt = performance.now();
		audioProblem = null;
	});

	/** Once audio has been unlocked by a tap, later questions can play automatically. */
	$effect(() => {
		const promptId = currentCard?.id;
		if (!audioUnlocked || !prompt?.audible || answered || !promptId || playedPromptId === promptId)
			return;
		void playQuestion();
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

	async function playQuestion() {
		if (!prompt?.audible || !currentCard || playingQuestion) return;
		const promptId = currentCard.id;
		playedPromptId = promptId;
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
			if (isSequential) await playSequence(prompt.audible, 0.4);
			else await playChord(prompt.audible, 1.9);
			askedAt = performance.now();
		} catch (error) {
			if (playedPromptId === promptId) playedPromptId = null;
			audioProblem = error instanceof Error ? error.message : 'Audio could not start.';
		} finally {
			playingQuestion = false;
		}
	}

	// ---- answering ----------------------------------------------------------

	function handleChord(chord: { notes: number[] }) {
		if (!marksPlaying || answered || !currentCard) return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;

		let marking;
		if (isSequential) {
			// Built up over time: the notes arrive one at a time, so they are gathered
			// rather than compared as a single handful.
			gathered = [...new Set([...gathered, ...chord.notes.map((n) => ((n % 12) + 12) % 12)])];
			marking = markGathered(expected, gathered);
		} else {
			marking = markPlayed(toVoicing(expected), chord.notes);
		}
		lastMarking = marking;

		if (marking.correct) {
			answered = true;
			// The symbol, once the chord is right: a degree question is only closed by
			// naming what was played, and being shown it is how that gets checked
			// without anybody taking a hand off the keys to type.
			revealed = true;
			record(gradeFromPerformance(true, Math.round(performance.now() - askedAt)), true);
			setTimeout(nextCard, 650);
		}
	}

	function record(rating: ReviewRating, correct: boolean) {
		if (!currentCard) return;
		pending = [
			...pending,
			{
				id: crypto.randomUUID(),
				cardId: currentCard.id,
				rating,
				correct,
				latencyMs: Math.round(performance.now() - askedAt)
			}
		];
	}

	function nextCard() {
		const next = cardIndex + 1;
		answered = false;
		revealed = false;
		lastMarking = null;
		gathered = [];
		showedAnswer = false;
		askedAt = performance.now();
		cardIndex = next;

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
		record('again', false);
	}

	/** Note names for the current answer, in the key you are in. */
	const answerNotes = $derived.by(() => {
		const payload = currentCard?.payload as { answerPitchClasses?: number[] } | undefined;
		if (!payload?.answerPitchClasses) return [];
		return payload.answerPitchClasses.map((pc) =>
			formatNote(spell(pc, context), { unicode: true })
		);
	});

	/** What is still missing, as note names rather than a bare count. */
	const missingNotes = $derived(
		(lastMarking?.missing ?? []).map((pc) => formatNote(spell(pc, context), { unicode: true }))
	);

	function skipCard() {
		if (currentCard && !answered) record('again', false);
		nextCard();
	}

	/** Pedal or spacebar: whatever "next" means for the task showing. */
	function advanceHandsFree() {
		if (!task || busy || finished) return;
		if (task.kind === 'mission') {
			void playMission(task.mission);
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
		<header class="mb-5 flex flex-wrap items-center justify-between gap-3">
			<div class="flex min-w-0 flex-wrap items-baseline gap-2 sm:gap-3">
				<h1 class="font-display text-ink text-lg font-semibold tracking-tight">{task.title}</h1>
				<span class="text-ink-muted font-mono text-[0.7rem]">
					{progress} · {glyph(workout?.keyCenter ?? '')}
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

		<p class="text-ink-muted mb-6 text-sm leading-relaxed">{task.instruction}</p>

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

				<button
					class="bg-ink text-ground rounded-2xl px-8 py-4 text-lg font-semibold disabled:opacity-40"
					onclick={() => task.kind === 'mission' && playMission(task.mission)}
					disabled={busy}
					aria-describedby="mission-hands-free"
				>
					{busy ? 'opening…' : verdict ? 'Play it again' : 'Play it'}
				</button>
				<span id="mission-hands-free" class="text-ink-dim font-mono text-[0.7rem]">
					<kbd>Space</kbd> / pedal · open play along
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
			<section class="flex flex-1 flex-col items-center justify-center gap-6">
				<span class="text-ink-dim font-mono text-xs">
					{cardIndex + 1} / {asks} · {prompt.instruction}
				</span>

				<div class="grid min-h-[9rem] place-items-center">
					{#if prompt.visible}
						<span class="font-display text-ink text-6xl font-semibold">{prompt.visible}</span>
					{:else if revealed}
						<span class="font-display text-ink text-6xl font-semibold"
							>{(currentCard.payload as { label: string }).label}</span
						>
					{:else}
						<button
							class="border-ground-line hover:border-ink-dim rounded-lg border px-5 py-3 font-mono text-sm transition-colors disabled:opacity-50"
							onclick={playQuestion}
							disabled={playingQuestion}
						>
							{playingQuestion ? 'playing…' : audioUnlocked ? 'play it again' : 'hear question'}
						</button>
					{/if}
				</div>

				{#if audioProblem}
					<p class="font-mono text-xs" style="color: var(--pc-0)">{audioProblem}</p>
				{/if}

				{#if revealed && answered}
					<!-- The naming half, closed: what you played, spelled. -->
					<p class="font-mono text-xs" style="color: var(--pc-5)">
						{(currentCard.payload as { label: string }).label}
					</p>
				{:else if showedAnswer}
					<p class="text-ink-muted font-display text-xl">{answerNotes.join('  ')}</p>
				{:else if lastMarking && !lastMarking.correct}
					<!-- Names, not counts: "missing 4" tells you nothing you can act on. -->
					<p class="text-ink-dim font-mono text-xs">
						{missingNotes.length ? `still need ${missingNotes.join(' ')}` : ''}
						{lastMarking.extra.length ? ` · ${lastMarking.extra.length} not in it` : ''}
					</p>
				{/if}

				{#if isSequential && gathered.length && !answered}
					<p class="text-ink-dim font-mono text-[0.7rem]">
						{gathered.length} of {answerNotes.length} so far
					</p>
				{/if}

				<Wheel
					{config}
					active={keyView.pitchClasses}
					degrees={keyView.degrees}
					{highlights}
					lit={session.live.map((n) => n % 12)}
					size={320}
					interactive={false}
				/>

				<div class="flex gap-3">
					{#if prompt.answerWith === 'name' && !marksPlaying && !revealed}
						<button
							class="bg-ink text-ground rounded-lg px-5 py-2.5 text-sm font-semibold"
							onclick={advanceHandsFree}>Got it</button
						>
					{/if}
					<button
						class="border-ground-line hover:border-ink-dim rounded-lg border px-4 py-2.5 font-mono text-xs transition-colors"
						onclick={showAnswer}
						disabled={showedAnswer}>show</button
					>
					<button
						class="text-ink-dim hover:text-ink px-4 py-2.5 font-mono text-xs transition-colors"
						onclick={skipCard}>{showedAnswer ? 'next' : 'skip'}</button
					>
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
			<footer class="mt-6 flex items-center justify-between gap-4">
				<!-- Wide enough to play a scale in one hand without running out of
				     keyboard, which 25 keys was not. -->
				<Keyboard
					lit={session.live}
					onnoteon={(n) => virtual('noteon', n)}
					onnoteoff={(n) => virtual('noteoff', n)}
					from={48}
					count={29}
				/>
			</footer>

			<div class="mt-4 flex items-center justify-between">
				<span class="text-ink-dim font-mono text-[0.7rem]"><kbd>Space</kbd> / pedal · next</span>
				<span class="text-ink-dim font-mono text-[0.7rem]">
					{Math.min(cardIndex, asks)} of {asks} answered
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
</style>
