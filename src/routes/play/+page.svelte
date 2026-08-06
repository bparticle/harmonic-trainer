<script lang="ts">
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import Wheel from '$lib/wheel/Wheel.svelte';
	import { MidiSession } from '$lib/midi/session.svelte';
	import { encodeSmf } from '$lib/midi/smf';
	import type { ChordEvent, MidiEvent } from '$lib/midi/cluster';
	import { recognise, type Candidate } from '$lib/music/recognise';
	import { key as makeKey, parseKey } from '$lib/music/key';
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { chordCells } from '$lib/wheel/overlays';
	import type { Highlight, WheelGeometry } from '$lib/wheel/geometry';

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

	const session = new MidiSession();

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

	let recording = $state(false);
	let takeStatus = $state<string | null>(null);

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

	// Kept in an effect so a change to the stored preferences reaches a live
	// session rather than only applying on the next page load.
	$effect(() => {
		session.windowMs = data.settings.prefs.chordClusterWindowMs;
		session.latencyOffsetMs = data.settings.prefs.midiLatencyOffsetMs;
	});

	$effect(() => {
		session.detect();
		session.onChord(onChord);
		// Sustain pedal is navigation: it claims the current chord so both hands
		// can stay on the keys.
		session.onPedal((down) => down && claim());
		session.startVirtual();
		return () => session.destroy();
	});

	function onKeydown(event: KeyboardEvent) {
		if (event.key === ' ') {
			event.preventDefault();
			claim();
		}
	}

	// The on-screen keyboard feeds exactly the same pipeline as the hardware.
	const virtual = (type: 'noteon' | 'noteoff', note: number) => {
		const event: MidiEvent =
			type === 'noteon'
				? { type: 'noteon', note, velocity: 90, time: performance.now() }
				: { type: 'noteoff', note, time: performance.now() };
		session.push(event);
	};

	let recorded: MidiEvent[] = [];

	function toggleRecording() {
		if (!recording) {
			session.startRecording();
			recording = true;
			takeStatus = null;
			return;
		}
		const { events, durationMs } = session.stopRecording();
		recording = false;
		recorded = events;
		if (events.length === 0) {
			takeStatus = 'Nothing played, nothing saved.';
			return;
		}
		void saveTake(events, durationMs);
	}

	async function saveTake(events: MidiEvent[], durationMs: number) {
		takeStatus = 'Saving…';
		try {
			const bytes = encodeSmf(events);
			let binary = '';
			for (const byte of bytes) binary += String.fromCharCode(byte);
			const response = await fetch('/api/takes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					id: crypto.randomUUID(),
					midiBase64: btoa(binary),
					durationMs,
					tags: ['free-play']
				})
			});
			if (!response.ok) throw new Error(await response.text());
			takeStatus = `Saved ${(durationMs / 1000).toFixed(1)}s, ${events.length} events.`;
		} catch (e) {
			takeStatus = e instanceof Error ? e.message : 'Could not save the take.';
		}
	}

	const highlights = $derived.by((): Highlight[] => {
		if (!current || !revealed || !current.candidates.length) return [];
		return [{ cells: chordCells(current.candidates[0].chord, config, GEOMETRY), strength: 1 }];
	});

	const noteNames = $derived(
		session.live.map((n) => formatNote(spell(n % 12, context), { unicode: true }))
	);
</script>

<svelte:head><title>Play · Harmonic Trainer</title></svelte:head>
<svelte:window onkeydown={onKeydown} />

<main class="mx-auto flex min-h-dvh max-w-[1400px] flex-col px-5 py-6">
	<header class="mb-4 flex items-baseline justify-between gap-4">
		<div class="flex items-baseline gap-4">
			<a href="/" class="font-display text-ink text-lg font-semibold tracking-tight">Harmonic</a>
			<span class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">play</span>
		</div>
		<nav class="flex gap-4 font-mono text-[0.65rem] tracking-widest uppercase">
			<a href="/explore" class="text-ink-dim hover:text-ink transition-colors">explore</a>
			<a href="/settings/wheel" class="text-ink-dim hover:text-ink transition-colors">calibrate</a>
		</nav>
	</header>

	<!-- Device state, stated plainly rather than apologised for. -->
	<section class="border-ground-line bg-ground-raised mb-5 rounded-lg border p-3">
		<div class="flex flex-wrap items-center gap-3">
			<span class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">midi</span>

			{#if session.status === 'ready'}
				<select
					class="border-ground-line bg-ground text-ink-muted rounded border px-2 py-1 font-mono text-xs"
					value={session.selectedId}
					onchange={(e) => session.select(e.currentTarget.value)}
				>
					{#each session.devices as device (device.id)}
						<option value={device.id}>{device.name}</option>
					{/each}
				</select>
				{#if session.devices.length === 0}
					<span class="text-ink-dim font-mono text-xs">connected, but nothing plugged in</span>
				{/if}
			{:else if session.status === 'idle'}
				<button
					class="bg-ink text-ground rounded px-3 py-1 text-xs font-semibold"
					onclick={() => session.connect()}>Connect a keyboard</button
				>
			{:else if session.status === 'requesting'}
				<span class="text-ink-dim font-mono text-xs">asking permission…</span>
			{:else}
				<span class="text-ink-muted max-w-2xl text-xs leading-relaxed"
					>{session.unavailableReason}</span
				>
			{/if}

			<span class="ml-auto flex items-center gap-3">
				{#if session.pedalDown}
					<span class="text-ink-muted font-mono text-[0.65rem] tracking-widest uppercase"
						>pedal</span
					>
				{/if}
				<button
					class="rounded px-3 py-1 font-mono text-xs transition-colors"
					class:is-recording={recording}
					style:background={recording ? 'var(--pc-0)' : 'var(--color-ground-overlay)'}
					style:color={recording ? 'var(--pc-0-ink)' : 'var(--color-ink-muted)'}
					onclick={toggleRecording}
				>
					{recording ? 'stop' : 'record'}
				</button>
			</span>
		</div>
		{#if takeStatus}
			<p class="text-ink-dim mt-2 font-mono text-xs">{takeStatus}</p>
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
					<div class="flex flex-col items-center gap-3">
						<ChordSymbol chord={current.candidates[0].chord} size="clamp(3rem, 11vw, 7rem)" />
						{#if current.candidates.length > 1}
							<span class="text-ink-dim font-mono text-xs">
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
					Reveal is held back {(revealDelayMs / 1000).toFixed(1)}s so your ear goes first.
				{/if}
			</p>

			<Wheel
				{config}
				{context}
				active={[]}
				{highlights}
				lit={session.live.map((n) => n % 12)}
				size={420}
				interactive={false}
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
							onclick={() => (keyName = name)}
							>{name.replace('b', '♭').replace('#', '♯')}</button
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
				<input type="range" min="0" max="6000" step="250" bind:value={revealDelayMs} class="w-full" />
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
