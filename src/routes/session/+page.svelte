<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import Timer from '$lib/session/Timer.svelte';
	import { MidiSession } from '$lib/midi/session.svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { playChord, playSequence, startAudio, stopAll } from '$lib/audio/engine';
	import { markPlayed, pose, toVoicing } from '$lib/session/drill';
	import { recognise } from '$lib/music/recognise';
	import { gradeFromPerformance } from '$lib/srs/scheduler';
	import { parseKey } from '$lib/music/key';
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

	const session = new MidiSession();
	let busy = $state(false);
	let problem = $state<string | null>(null);

	// ---- per-block state --------------------------------------------------
	let cardIndex = $state(0);
	let askedAt = $state(0);
	let answered = $state(false);
	let lastMarking = $state<{ correct: boolean; missing: number[]; extra: number[] } | null>(null);
	let namedChord = $state<string | null>(null);
	let revealed = $state(false);
	let atomShowing = $state<'from' | 'to'>('from');
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

	$effect(() => {
		session.detect();
		session.startVirtual();
		session.onPedal((down) => down && advanceHandsFree());
		return () => session.destroy();
	});

	// Reset the per-block state whenever the block changes.
	$effect(() => {
		void index;
		cardIndex = 0;
		answered = false;
		revealed = false;
		lastMarking = null;
		namedChord = null;
		pending = [];
		atomShowing = 'from';
		askedAt = performance.now();
	});

	/** Play the question, if it has one. */
	$effect(() => {
		if (!prompt?.audible || answered) return;
		void playQuestion();
	});

	async function playQuestion() {
		if (!prompt?.audible) return;
		await startAudio();
		if (prompt.direction === 'hear_play' || prompt.direction === 'hear_name') {
			await playChord(prompt.audible, 1.9);
		}
		askedAt = performance.now();
	}

	// ---- answering --------------------------------------------------------

	session.onChord((chord) => {
		if (!block) return;

		if (block.type === 'name_what_you_play') {
			namedChord = recognise(chord.notes, { key: context })[0]?.symbol ?? null;
			return;
		}

		if (!prompt || prompt.answerWith !== 'play' || answered || !currentCard) return;

		const expected = (currentCard.payload as { answerPitchClasses: number[] }).answerPitchClasses;
		const marking = markPlayed(toVoicing(expected), chord.notes);
		lastMarking = marking;

		if (marking.correct) {
			answered = true;
			record(gradeFromPerformance(true, Math.round(performance.now() - askedAt)), true);
			setTimeout(nextCard, 550);
		}
	});

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
		cardIndex = cardIndex + 1;
		askedAt = performance.now();
	}

	function skipCard() {
		if (currentCard && !answered) record('again', false);
		nextCard();
	}

	/** Pedal or spacebar: whatever "next" means for the block showing. */
	function advanceHandsFree() {
		if (!block) return;
		if (block.type === 'new_atom') {
			atomShowing = atomShowing === 'from' ? 'to' : 'from';
			return;
		}
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

		if (block?.type === 'new_atom' && data.atom) {
			const pcs =
				atomShowing === 'from' ? data.atom.fromPitchClasses : data.atom.toPitchClasses;
			shapes.push({
				cells: cellsFor(pcs, pcs[0] ?? 0, config, GEOMETRY),
				strength: 1
			});
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
				<span class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
					{progress} · {plan?.keyCenter}
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

		<p class="text-ink-muted mb-6 text-sm leading-relaxed">{block.instruction}</p>

		<!-- ---------------------------------------------------------------- -->
		{#if block.type === 'new_atom' && data.atom}
			<section class="flex flex-1 flex-col items-center gap-6">
				<h2 class="font-display text-ink text-center text-3xl font-semibold tracking-tight">
					{data.atom.title}
				</h2>
				<p class="text-ink-muted max-w-2xl text-center text-lg leading-relaxed">
					{data.atom.explanation}
				</p>

				<div class="flex items-center gap-3">
					{#each ['from', 'to'] as const as which (which)}
						<button
							class="border-ground-line hover:border-ink-dim rounded-lg border px-4 py-2 font-mono text-xs transition-colors"
							class:is-selected={atomShowing === which}
							onclick={() => (atomShowing = which)}
						>
							{which === 'from' ? 'what you play' : 'the change'}
						</button>
					{/each}
				</div>

				<p class="font-display text-ink text-2xl">
					{(atomShowing === 'from' ? data.atom.fromSymbols : data.atom.toSymbols).join('  ·  ')}
				</p>

				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={380} interactive={false} />

				<p class="text-ink-dim text-center font-mono text-xs">
					Listen for: {data.atom.listenFor}
				</p>
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
					{#if data.atom}
						Use <strong class="text-ink">{data.atom.title.toLowerCase()}</strong> if it comes. If it
						does not, play anyway.
					{:else}
						Play freely in {plan?.keyCenter}.
					{/if}
				</p>
				<Wheel {config} active={keyView.pitchClasses} degrees={keyView.degrees} {highlights}
					lit={session.live.map((n) => n % 12)} size={380} interactive={false} />
				<p class="text-ink-dim font-mono text-xs">
					Backing tracks arrive in M7; for now this is you and a wheel.
				</p>
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

				{#if lastMarking && !lastMarking.correct}
					<p class="text-ink-dim font-mono text-xs">
						{lastMarking.missing.length ? `missing ${lastMarking.missing.length}` : ''}
						{lastMarking.extra.length ? `· ${lastMarking.extra.length} extra` : ''}
					</p>
				{:else if answered}
					<p class="font-mono text-xs" style="color: var(--pc-5)">yes</p>
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
						class="text-ink-dim hover:text-ink px-4 py-2.5 font-mono text-xs transition-colors"
						onclick={skipCard}>skip this one</button
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
			<Keyboard
				lit={session.live}
				onnoteon={(n) => virtual('noteon', n)}
				onnoteoff={(n) => virtual('noteoff', n)}
				count={25}
				showLabels={false}
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
