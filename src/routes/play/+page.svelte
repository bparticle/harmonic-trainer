<script lang="ts">
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { midi as session } from '$lib/midi/shared.svelte';
	import type { ChordEvent, MidiEvent } from '$lib/midi/cluster';
	import { recognise, type Candidate } from '$lib/music/recognise';
	import { key as makeKey, parseKey } from '$lib/music/key';
	import { formatNote, formatPitch } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { chordCells, keyOverlay } from '$lib/wheel/overlays';
	import { mod12, pitchClassAt, type Highlight, type WheelGeometry } from '$lib/wheel/geometry';
	import { shouldHandleSpace } from '$lib/shortcuts';

	/*
	 * Live naming.
	 *
	 * A chord is detected, held back for the reveal delay, and only then named.
	 * The point is to give the ear a moment to get there first — so the score
	 * that matters is how often you had it before the screen did, and how long
	 * it took. Naming latency is the best proxy for fluency there is.
	 */

	let { data } = $props();

	const GEOMETRY: WheelGeometry = { outerRadius: 330, ringWidth: 52 };
	const config = $derived(data.settings.wheelConfig);

	let keyName = $state('C');
	const context = $derived(parseKey(keyName));
	const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

	// The slider owns this once the page is up; it is only seeded from settings.
	// svelte-ignore state_referenced_locally
	let revealDelayMs = $state(data.settings.prefs.revealDelayMs);
	let current = $state<{ chord: ChordEvent; candidates: Candidate[]; at: number } | null>(null);
	let revealed = $state(false);
	let guessedAt = $state<number | null>(null);
	let revealTimer: ReturnType<typeof setTimeout> | null = null;

	/** Scoring for this sitting. Persisted properly once the session engine lands in M5. */
	let attempts = $state(0);
	let hits = $state(0);
	let latencies = $state<number[]>([]);

	const hitRate = $derived(attempts ? Math.round((hits / attempts) * 100) : 0);
	const medianLatency = $derived.by(() => {
		if (!latencies.length) return null;
		const sorted = [...latencies].sort((a, b) => a - b);
		return Math.round(sorted[Math.floor(sorted.length / 2)]);
	});

	function onChord(chord: ChordEvent) {
		if (chord.notes.length < 3) return;

		if (revealTimer) clearTimeout(revealTimer);
		attempts += 1;
		revealed = false;
		guessedAt = null;
		current = {
			chord,
			candidates: recognise(chord.notes, { key: context }),
			at: performance.now()
		};
		revealTimer = setTimeout(() => (revealed = true), revealDelayMs);
	}

	/** "I had it" — the only thing the app can honestly measure about a guess. */
	function claim() {
		if (!current || revealed || guessedAt !== null) return;
		guessedAt = performance.now();
		latencies = [...latencies, Math.round(guessedAt - current.at)];
		hits += 1;
		revealed = true;
		if (revealTimer) clearTimeout(revealTimer);
	}

	/*
	 * The session itself is owned by the root layout and outlives this page —
	 * only the handlers are ours. They are cleared on the way out so a chord
	 * played on another screen does not still be marked by a page nobody is
	 * looking at.
	 */
	$effect(() => {
		session.onChord(onChord);
		// Sustain pedal is navigation: it claims the current chord so both hands
		// can stay on the keys.
		session.onPedal((down) => down && claim());
		return () => {
			session.onChord(null);
			session.onPedal(null);
		};
	});

	function onKeydown(event: KeyboardEvent) {
		if (!shouldHandleSpace(event)) return;
		event.preventDefault();
		claim();
	}

	// The on-screen keyboard feeds exactly the same pipeline as the hardware.
	const virtual = (type: 'noteon' | 'noteoff', note: number) => {
		const event: MidiEvent =
			type === 'noteon'
				? { type: 'noteon', note, velocity: 90, time: performance.now() }
				: { type: 'noteoff', note, time: performance.now() };
		session.push(event);
	};

	/**
	 * A one-line warning when the headline name is not simply the notes under the
	 * hand — most importantly when it names a root that was never played.
	 */
	const caveat = $derived.by(() => {
		const top = current?.candidates[0];
		if (!top || !revealed) return null;
		if (top.interpretation === 'rootless') {
			return `rootless — no ${formatPitch(top.chord.root, true)} played`;
		}
		if (top.interpretation === 'quartal') return 'stacked fourths, named by its shape';
		if (top.interpretation === 'upper-structure') return 'a triad over a different bass';
		if (top.interpretation === 'slash') return 'the bass note is not a chord tone';
		if (top.omitted.includes(5)) return 'fifth not played';
		return null;
	});

	/**
	 * Turning the wheel sets the key, exactly as it does on the physical object:
	 * the index mark at the top is fixed, and you rotate to bring the key you
	 * want underneath it.
	 */
	function onWheelRotate(steps: number) {
		const pc = pitchClassAt({ ring: 0, position: mod12(-steps) }, config);
		keyName = formatNote(spell(pc, makeKey('C')));
	}

	const keyView = $derived(keyOverlay(context, config, GEOMETRY));

	const highlights = $derived.by((): Highlight[] => {
		// The key's seven notes outlined, so turning the wheel visibly moves
		// something rather than only relabelling a corner of the screen. The block
		// sits under the index mark, which is how you read a key off the object.
		const shapes: Highlight[] = [{ cells: keyView.scaleCells, strength: 0.45, outline: true }];
		if (current && revealed && current.candidates.length) {
			shapes.push({
				cells: chordCells(current.candidates[0].chord, config, GEOMETRY),
				strength: 1
			});
		}
		return shapes;
	});

	const noteNames = $derived(
		session.live.map((n) => formatNote(spell(n % 12, context), { unicode: true }))
	);
</script>

<svelte:head><title>Play · Harmonic Trainer</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-5 py-6">
	<!-- Device management lives in the header's cog, on every page. -->
	<section class="mb-5 flex items-center gap-3">
		{#if session.unavailableReason}
			<p class="text-ink-muted max-w-2xl text-xs leading-relaxed">
				{session.unavailableReason}
			</p>
		{/if}
	</section>

	<div class="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
		<section class="flex flex-col items-center gap-6">
			<!-- Practice mode: huge type, readable across the room. -->
			<button
				class="border-ground-line hover:border-ink-dim flex min-h-[13rem] w-full max-w-2xl
				       items-center justify-center rounded-2xl border px-6 py-8 transition-colors"
				onclick={claim}
				aria-label="I had it"
			>
				{#if !current}
					<span class="text-ink-dim font-mono text-sm">Play something.</span>
				{:else if !revealed}
					<span class="text-ink-dim font-display text-[7rem] leading-none font-semibold">?</span>
				{:else}
					<div class="flex flex-col items-center gap-2">
						<ChordSymbol chord={current.candidates[0].chord} size="clamp(3rem, 11vw, 7rem)" />
						{#if caveat}
							<!-- If the name involves a note that was never played, say so here,
							     where the name is, not in a panel off to the side. -->
							<span class="text-ink-muted font-mono text-xs">{caveat}</span>
						{/if}
						{#if current.candidates.length > 1}
							<span class="text-ink-dim mt-1 font-mono text-xs">
								or {current.candidates
									.slice(1, 3)
									.map((c) => c.symbol)
									.join(' · ')}
							</span>
						{/if}
					</div>
				{/if}
			</button>

			<p class="text-ink-dim text-center font-mono text-xs">
				{#if current && !revealed}
					Hit the pedal or the spacebar the moment you have it.
				{:else}
					Reveal is held back {(revealDelayMs / 1000).toFixed(1)}s so your ear goes first. Turn the
					wheel to change key.
				{/if}
			</p>

			<!--
				The key is the figure, carrying its degree numerals; what you are
				actually playing is ringed on top of it. That way the pattern stays
				learnable while still showing where your hands landed inside it.
			-->
			<Wheel
				{config}
				active={keyView.pitchClasses}
				degrees={keyView.degrees}
				{highlights}
				lit={session.live.map((n) => n % 12)}
				size={420}
				onrotate={onWheelRotate}
			/>

			<Keyboard
				lit={session.live}
				onnoteon={(n) => virtual('noteon', n)}
				onnoteoff={(n) => virtual('noteoff', n)}
			/>
		</section>

		<aside class="flex flex-col gap-6">
			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					Key context
				</h2>
				<div class="grid grid-cols-6 gap-1">
					{#each KEYS as name (name)}
						<button
							class="border-ground-line hover:border-ink-dim font-display rounded border px-1 py-2 text-sm font-semibold transition-colors"
							class:is-selected={keyName === name}
							onclick={() => (keyName = name)}>{name.replace('b', '♭').replace('#', '♯')}</button
						>
					{/each}
				</div>
			</section>

			<section>
				<div class="mb-2 flex items-baseline justify-between">
					<h2 class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
						Reveal delay
					</h2>
					<span class="text-ink-muted font-mono text-xs">{(revealDelayMs / 1000).toFixed(1)}s</span>
				</div>
				<input
					type="range"
					min="0"
					max="6000"
					step="250"
					bind:value={revealDelayMs}
					class="w-full"
					aria-label="Reveal delay"
				/>
			</section>

			<section class="border-ground-line bg-ground-raised rounded-lg border p-4">
				<h2 class="text-ink-dim mb-3 font-mono text-[0.65rem] tracking-widest uppercase">
					This sitting
				</h2>
				<dl class="flex flex-col gap-2 font-mono text-xs">
					<div class="flex justify-between">
						<dt class="text-ink-dim">named before reveal</dt>
						<dd class="text-ink-muted">{hits} of {attempts}{attempts ? ` · ${hitRate}%` : ''}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-ink-dim">median latency</dt>
						<dd class="text-ink-muted">{medianLatency === null ? '—' : `${medianLatency} ms`}</dd>
					</div>
				</dl>
				<p class="text-ink-dim mt-3 text-[0.7rem] leading-relaxed">
					How long it takes to name a chord tracks fluency far better than whether you can name it
					at all.
				</p>
			</section>

			{#if session.live.length}
				<section>
					<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
						Sounding
					</h2>
					<div class="flex flex-wrap gap-1">
						{#each session.live as note, i (note)}
							<span
								class="font-display rounded px-2 py-0.5 text-sm font-semibold"
								style="background: var(--pc-{note % 12}); color: var(--pc-{note % 12}-ink)"
								>{noteNames[i]}</span
							>
						{/each}
					</div>
				</section>
			{/if}

			{#if current && revealed && current.candidates.length}
				<section>
					<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
						Readings
					</h2>
					<ul class="flex flex-col gap-2">
						{#each current.candidates.slice(0, 4) as candidate (candidate.symbol)}
							<li class="border-ground-line rounded border px-3 py-2">
								<div class="flex items-baseline justify-between gap-2">
									<ChordSymbol chord={candidate.chord} size="1.1rem" />
									<span class="text-ink-dim font-mono text-[0.7rem]"
										>{Math.round(candidate.confidence * 100)}%</span
									>
								</div>
								{#if candidate.reasoning.length}
									<p class="text-ink-dim mt-1 text-[0.7rem] leading-relaxed">
										{candidate.reasoning.join('; ')}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>
	</div>
</main>

<style>
	.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	input[type='range'] {
		accent-color: var(--color-ink-muted);
	}
</style>
