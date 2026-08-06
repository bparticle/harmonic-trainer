<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import BackingControls from '$lib/components/BackingControls.svelte';
	import Timer from '$lib/session/Timer.svelte';
	import { midi as session } from '$lib/midi/shared.svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { playChord, playSequence, startAudio, stopAll } from '$lib/audio/engine';
	import { markGathered, markPlayed, pose, toVoicing } from '$lib/session/drill';
	import { recognise } from '$lib/music/recognise';
	import { gradeFromPerformance } from '$lib/srs/scheduler';
	import { parseKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { chordCells, keyOverlay } from '$lib/wheel/overlays';
	import type { Highlight, WheelGeometry } from '$lib/wheel/geometry';
	import { cellsFor } from '$lib/wheel/geometry';
	import type { ReviewRating } from '$lib/server/db/schema';

	/*
	 * The daily session.
	 *
	 * Six blocks, each with a visible timer and a skip. Advancing never needs the
	 * mouse: the sustain pedal or the spacebar moves you on, because both hands
	 * are on the keys and reaching for a trackpad breaks the thing being
	 * practised.
	 *
	 * Results are written as each block finishes rather than at the end, so
	 * walking away halfway still records everything up to that point.
	 */

	let { data } = $props();

	const GEOMETRY: WheelGeometry = { outerRadius: 330, ringWidth: 52 };
	const config = $derived(data.settings.wheelConfig);
	const plan = $derived(data.session?.plan ?? null);
	const context = $derived(parseKey(plan?.keyCenter ?? 'C'));
	const keyView = $derived(keyOverlay(context, config, GEOMETRY));

	// Seeded from where the server says to resume; from then on the block
	// transitions own it.
	// svelte-ignore state_referenced_locally
	let index = $state(data.session?.resumeAt ?? 0);
	const block = $derived(plan?.blocks[index] ?? null);

	/*
	 * Held separately from the loaded data. Ending a session clears it from the
	 * server's "today" query, so relying on `data.session` alone dropped you onto
	 * "no session running" the moment you finished one — which reads as though
	 * the last twenty minutes had been thrown away.
	 */
	let justFinished = $state(false);
	const finished = $derived(
		justFinished || (Boolean(plan) && index >= (plan?.blocks.length ?? 0))
	);
	const summary = $state({ keyCenter: '', blocks: 0 });

	let busy = $state(false);
	let problem = $state<string | null>(null);

	// ---- per-block state --------------------------------------------------
	let cardIndex = $state(0);
	let askedAt = $state(0);
	let answered = $state(false);
	let lastMarking = $state<{ correct: boolean; missing: number[]; extra: number[] } | null>(null);
	let namedChord = $state<string | null>(null);
	let revealed = $state(false);
	/** Pitch classes played since this card was posed, for the ones you build up over time. */
	let gathered = $state<number[]>([]);
	let showedAnswer = $state(false);
	let logRatings = $state<Record<string, ReviewRating>>({});

	/** Reviews gathered during this block, flushed when it finishes. */
	let pending = $state<
		Array<{ cardId: string; rating: ReviewRating; correct: boolean; latencyMs: number | null }>
	>([]);

	const blockCards = $derived(block ? (data.cards[block.type] ?? []) : []);
	const currentCard = $derived(blockCards[cardIndex] ?? null);
	const prompt = $derived(
		currentCard ? pose(currentCard.direction, currentCard.payload as never) : null
	);

	/*
	 * The session is owned by the root layout; only the handlers belong to this
	 * page, and they are cleared on the way out so a chord played elsewhere is
	 * not still being marked here.
	 */
	$effect(() => {
		session.onPedal((down) => down && advanceHandsFree());
		session.onChord(handleChord);
		return () => {
			session.onPedal(null);
			session.onChord(null);
		};
	});

	// Reset the per-block state whenever the block changes.
	$effect(() => {
		void index;
		cardIndex = 0;
		answered = false;
		revealed = false;
		lastMarking = null;
		namedChord = null;
		gathered = [];
		showedAnswer = false;
		pending = [];
		askedAt = performance.now();
	});

	/** Play the question, if it has one. */
	$effect(() => {
		if (!prompt?.audible || answered) return;
		void playQuestion();
	});

	/** True for the things you play one note after another rather than together. */
	const isSequential = $derived(
		(currentCard?.payload as { kind?: string } | undefined)?.kind === 'scale'
	);

	async function playQuestion() {
		if (!prompt?.audible) return;
		await startAudio();
		/*
		 * A scale is not a chord. Sounding all seven notes at once produced a tone
		 * cluster nobody could identify, on the gentlest card in the app — and
		 * then demanded all seven back simultaneously, which is not playable.
		 */
		if (isSequential) await playSequence(prompt.audible, 0.4);
		else await playChord(prompt.audible, 1.9);
		askedAt = performance.now();
	}

	// ---- answering --------------------------------------------------------

	function handleChord(chord: { notes: number[] }) {
		if (!block) return;

		if (block.type === 'name_what_you_play') {
			namedChord = recognise(chord.notes, { key: context })[0]?.symbol ?? null;
			return;
		}

		if (!prompt || prompt.answerWith !== 'play' || answered || !currentCard) return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;

		let marking;
		if (isSequential) {
			// Built up over time: the notes arrive one at a time, so they are
			// gathered rather than compared as a single handful.
			gathered = [...new Set([...gathered, ...chord.notes.map((n) => ((n % 12) + 12) % 12)])];
			marking = markGathered(expected, gathered);
		} else {
			marking = markPlayed(toVoicing(expected), chord.notes);
		}
		lastMarking = marking;

		if (marking.correct) {
			answered = true;
			record(gradeFromPerformance(true, Math.round(performance.now() - askedAt)), true);
			setTimeout(nextCard, 550);
		}
	}

	function record(rating: ReviewRating, correct: boolean) {
		if (!currentCard) return;
		pending = [
			...pending,
			{
				cardId: currentCard.id,
				rating,
				correct,
				latencyMs: Math.round(performance.now() - askedAt)
			}
		];
	}

	function nextCard() {
		answered = false;
		revealed = false;
		lastMarking = null;
		gathered = [];
		showedAnswer = false;
		cardIndex = cardIndex + 1;
		askedAt = performance.now();
	}

	/**
	 * Give up and be shown it.
	 *
	 * Not the same as skipping: you see the notes, so the next time round is a
	 * real attempt rather than another blank. It still counts as needing help,
	 * which is exactly what the scheduler should know.
	 */
	function showAnswer() {
		if (!currentCard || showedAnswer) return;
		showedAnswer = true;
		record('again', false);
	}

	/** Note names for the current answer, in the key you are in. */
	const answerNotes = $derived.by(() => {
		const payload = currentCard?.payload as
			| { answerPitchClasses?: number[]; detail?: string }
			| undefined;
		if (!payload?.answerPitchClasses) return [];
		return payload.answerPitchClasses.map((pc) => formatNote(spell(pc, context), { unicode: true }));
	});

	/** What is still missing, as note names rather than a bare count. */
	const missingNotes = $derived(
		(lastMarking?.missing ?? []).map((pc) => formatNote(spell(pc, context), { unicode: true }))
	);

	function skipCard() {
		if (currentCard && !answered) record('again', false);
		nextCard();
	}

	/** Pedal or spacebar: whatever "next" means for the block showing. */
	function advanceHandsFree() {
		if (!block) return;
		if (prompt && !answered) {
			if (prompt.answerWith === 'name' && !revealed) {
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
		if (event.key === ' ') {
			event.preventDefault();
			advanceHandsFree();
		}
	}

	// ---- block transitions -------------------------------------------------

	async function finishBlock(result: unknown = null) {
		if (!data.session || !block || busy) return;
		busy = true;
		problem = null;
		try {
			const response = await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					action: 'finish-block',
					sessionId: data.session.id,
					blockType: block.type,
					reviews: pending,
					result
				})
			});
			if (!response.ok) throw new Error(await response.text());
			await stopAll();
			index = index + 1;
			if (index >= (plan?.blocks.length ?? 0)) await endSession();
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not save that block.';
		} finally {
			busy = false;
		}
	}

	async function endSession() {
		if (!data.session) return;
		summary.keyCenter = plan?.keyCenter ?? '';
		summary.blocks = plan?.blocks.length ?? 0;
		justFinished = true;
		await fetch('/api/session', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				action: 'finish',
				sessionId: data.session.id,
				result: { completed: true }
			})
		});
		await invalidateAll();
	}

	async function abandon() {
		// Costs nothing: every finished block is already saved.
		await goto('/');
	}

	// ---- wheel -------------------------------------------------------------

	const highlights = $derived.by((): Highlight[] => {
		const shapes: Highlight[] = [
			{ cells: keyView.scaleCells, strength: 0.4, outline: true }
		];

		if (block?.type === 'new_atom' && data.progression) {
			const pcs = data.progression.steps[0]?.pitchClasses ?? [];
			if (pcs.length) {
				shapes.push({ cells: cellsFor(pcs, pcs[0], config, GEOMETRY), strength: 1 });
			}
		} else if (prompt?.visible && currentCard) {
			const pcs = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
			shapes.push({ cells: cellsFor(pcs, pcs[0] ?? 0, config, GEOMETRY), strength: 0.9 });
		}
		return shapes;
	});

	const virtual = (type: 'noteon' | 'noteoff', note: number) =>
		session.push(
			type === 'noteon'
				? { type: 'noteon', note, velocity: 90, time: performance.now() }
				: ({ type: 'noteoff', note, time: performance.now() } as MidiEvent)
		);

	const progress = $derived(
		plan ? `${Math.min(index + 1, plan.blocks.length)} of ${plan.blocks.length}` : ''
	);

	// What this session is about, echoed back. A session that does not say what
	// it is for is hard to tell apart from one that decided at random.
	const focusLabel = $derived(data.progression?.name ?? data.rung?.label ?? null);
</script>

<svelte:head><title>Session · Harmonic Trainer</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-6">
	{#if finished}
		<div class="grid flex-1 place-items-center text-center">
			<div class="max-w-md">
				<h1 class="font-display text-ink mb-3 text-4xl font-semibold tracking-tight">Done.</h1>
				<p class="text-ink-muted mb-6 leading-relaxed">
					{summary.blocks || plan?.blocks.length} blocks in {summary.keyCenter ||
						plan?.keyCenter}. Everything is recorded.
				</p>
				<a href="/" class="bg-ink text-ground rounded-lg px-5 py-3 font-semibold">Home</a>
			</div>
		</div>
	{:else if !data.session}
		<div class="grid flex-1 place-items-center text-center">
			<div>
				<p class="text-ink-muted mb-4">No session running.</p>
				<a href="/" class="bg-ink text-ground rounded-lg px-5 py-3 font-semibold">Back</a>
			</div>
		</div>
	{:else if block}
		<header class="mb-5 flex items-center justify-between gap-4">
			<div class="flex items-baseline gap-3">
				<h1 class="font-display text-ink text-lg font-semibold tracking-tight">{block.title}</h1>
				<span class="text-ink-muted font-mono text-[0.7rem]">
					{progress} · {plan?.keyCenter}{focusLabel ? ` · ${focusLabel}` : ''}
				</span>
			</div>
			<div class="flex items-center gap-4">
				<Timer seconds={block.duration} />
				<button
					class="text-ink-dim hover:text-ink font-mono text-xs transition-colors"
					onclick={() => finishBlock({ skipped: true })}
					disabled={busy}>skip</button
				>
				<button
					class="text-ink-dim hover:text-ink font-mono text-xs transition-colors"
					onclick={abandon}>leave</button
				>
			</div>
		</header>

		<!-- The rung's own words win where it has them: it knows what you are
		     actually doing better than a generic block description does. -->
		<p class="text-ink-muted mb-6 text-sm leading-relaxed">
			{block.type === 'wheel_warmup' && data.rung ? data.rung.instruction : block.instruction}
		</p>

		<!-- ---------------------------------------------------------------- -->
		{#if block.type === 'new_atom' && (data.rung || data.progression)}
			<section class="flex flex-1 flex-col items-center gap-6">
				<h2 class="font-display text-ink text-center text-3xl font-semibold tracking-tight">
					{data.progression?.name ?? data.rung?.label}
				</h2>
				<p class="text-ink-muted max-w-2xl text-center text-lg leading-relaxed">
					{data.progression?.describes ?? data.rung?.teaches}
				</p>
				<p class="text-ink-dim max-w-xl text-center text-sm leading-relaxed">
					{data.progression?.listenFor ?? data.rung?.instruction}
				</p>

				{#if data.progression}
					<p class="font-display text-ink text-2xl">
						{data.progression.steps.map((s) => s.symbol).join('  ·  ')}
					</p>
				{/if}

				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={380} interactive={false} />
			</section>

		<!-- ---------------------------------------------------------------- -->
		{:else if block.type === 'name_what_you_play'}
			<section class="flex flex-1 flex-col items-center justify-center gap-6">
				<div class="grid min-h-[10rem] place-items-center">
					{#if namedChord}
						<span class="font-display text-ink text-7xl font-semibold">{namedChord}</span>
					{:else}
						<span class="text-ink-dim font-mono text-sm">Play something.</span>
					{/if}
				</div>
				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={340} interactive={false} />
			</section>

		<!-- ---------------------------------------------------------------- -->
		{:else if block.type === 'apply'}
			<section class="flex flex-1 flex-col items-center justify-center gap-6">
				<p class="text-ink-muted max-w-xl text-center leading-relaxed">
					Play freely in {plan?.keyCenter}. Use
					<strong class="text-ink">{(data.progression?.name ?? data.rung?.label ?? 'it').toLowerCase()}</strong>
					if it comes. If it does not, play anyway.
				</p>
				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={300} interactive={false} />

				{#if plan}
					<BackingControls keyName={plan.keyCenter} />
				{/if}
			</section>

		<!-- ---------------------------------------------------------------- -->
		{:else if block.type === 'log'}
			<section class="flex flex-1 flex-col gap-4">
				<p class="text-ink-muted text-sm">How did this session feel overall?</p>
				<div class="flex flex-wrap gap-2">
					{#each ['again', 'hard', 'good', 'easy'] as const as rating (rating)}
						<button
							class="border-ground-line hover:border-ink-dim flex-1 rounded-lg border px-4 py-4 font-display text-lg font-semibold transition-colors"
							class:is-selected={logRatings.session === rating}
							onclick={() => (logRatings = { ...logRatings, session: rating })}>{rating}</button
						>
					{/each}
				</div>
			</section>

		<!-- ---------------------------------------------------------------- -->
		{:else if currentCard && prompt}
			<section class="flex flex-1 flex-col items-center justify-center gap-6">
				<span class="text-ink-dim font-mono text-xs">
					{cardIndex + 1} / {blockCards.length} · {prompt.instruction}
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
							class="text-ink-dim hover:text-ink font-mono text-sm transition-colors"
							onclick={playQuestion}>play it again</button
						>
					{/if}
				</div>

				{#if showedAnswer}
					<p class="text-ink-muted font-display text-xl">{answerNotes.join('  ')}</p>
				{:else if lastMarking && !lastMarking.correct}
					<!-- Names, not counts: "missing 4" tells you nothing you can act on. -->
					<p class="text-ink-dim font-mono text-xs">
						{missingNotes.length ? `still need ${missingNotes.join(' ')}` : ''}
						{lastMarking.extra.length ? ` · ${lastMarking.extra.length} not in it` : ''}
					</p>
				{:else if answered}
					<p class="font-mono text-xs" style="color: var(--pc-5)">yes</p>
				{/if}

				{#if isSequential && gathered.length && !answered}
					<p class="text-ink-dim font-mono text-[0.7rem]">
						{gathered.length} of {answerNotes.length} so far
					</p>
				{/if}

				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={320} interactive={false} />

				<div class="flex gap-3">
					{#if prompt.answerWith === 'name' && !revealed}
						<button
							class="bg-ink text-ground rounded-lg px-5 py-2.5 text-sm font-semibold"
							onclick={advanceHandsFree}>I have it</button
						>
					{/if}
					<button
						class="border-ground-line hover:border-ink-dim rounded-lg border px-4 py-2.5 font-mono text-xs transition-colors"
						onclick={showAnswer}
						disabled={showedAnswer}>show me</button
					>
					<button
						class="text-ink-dim hover:text-ink px-4 py-2.5 font-mono text-xs transition-colors"
						onclick={skipCard}>{showedAnswer ? 'next' : 'skip this one'}</button
					>
				</div>
			</section>
		{:else}
			<section class="grid flex-1 place-items-center">
				<p class="text-ink-dim font-mono text-sm">
					{blockCards.length ? 'Block finished.' : 'Nothing due for this block today.'}
				</p>
			</section>
		{/if}

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
			<span class="text-ink-dim font-mono text-[0.7rem]">
				Pedal or spacebar moves you on.
			</span>
			<button
				class="bg-ink text-ground rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-40"
				onclick={() => finishBlock({ answered: pending.length })}
				disabled={busy}
			>
				{busy ? 'saving…' : index === (plan?.blocks.length ?? 0) - 1 ? 'Finish' : 'Next block'}
			</button>
		</div>

		{#if problem}
			<p class="mt-3 font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
		{/if}
	{/if}
</main>

<style>
	.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}
</style>
