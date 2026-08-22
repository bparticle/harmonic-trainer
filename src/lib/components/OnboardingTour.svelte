<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import type { MidiEvent } from '$lib/midi/cluster';
	import { connectMidi, midi } from '$lib/midi/shared.svelte';
	import { hasConfirmedInput, prefsForExperience, type ExperienceLevel } from '$lib/onboarding';
	import type { Prefs } from '$lib/settings';
	import Keyboard from './Keyboard.svelte';

	let {
		prefs,
		userName,
		request = 0
	}: {
		prefs: Prefs;
		userName: string;
		request?: number;
	} = $props();

	type TourStep = {
		path: string;
		target: string | null;
	};

	const STEPS: TourStep[] = [
		{ path: '/', target: null },
		{ path: '/', target: null },
		{ path: '/', target: 'today' },
		{ path: '/play', target: 'play' },
		{ path: '/backing', target: 'backing' },
		{ path: '/songbook', target: 'songbook' },
		{ path: '/explore', target: 'explore' }
	];

	type PageCopy = {
		eyebrow: string;
		title: string;
		body: string;
		points: string[];
		next: string;
	};

	let open = $state(false);
	let step = $state(0);
	type SetupStage = 'experience' | 'connect' | 'confirm';
	type InputMode = 'midi' | 'screen';
	let setupStage = $state<SetupStage>('experience');
	let inputMode = $state<InputMode>('midi');
	let experience = $state<ExperienceLevel>('beginner');
	let firstRun = $state(false);
	let settingsApplied = $state(false);
	let moving = $state(false);
	let settingsProblem = $state<string | null>(null);
	let connecting = $state(false);
	let pedalRecognised = $state(false);
	let seenRequest = $state(0);
	let card = $state<HTMLElement>();
	let hitId = 0;

	type NoteHit = { id: number; note: number; pc: number; label: string };
	let hits = $state<NoteHit[]>([]);
	const uniqueNotes = $derived(new Set(hits.map((hit) => hit.note)).size);
	const inputConfirmed = $derived(hasConfirmedInput(hits.map((hit) => hit.note)));

	type Spotlight = { left: number; top: number; width: number; height: number };
	let spotlight = $state<Spotlight | null>(null);

	const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
	const current = $derived(STEPS[step]);
	const progressLabel = $derived(`${step + 1} of ${STEPS.length}`);
	const device = $derived(midi.devices.find((entry) => entry.id === midi.selectedId));
	const midiCanTest = $derived(midi.status === 'ready' && Boolean(device));

	const copy = $derived.by((): PageCopy | null => {
		if (step === 2) {
			return {
				eyebrow: 'Today',
				title: 'Choose today’s work',
				body:
					experience === 'beginner'
						? 'Your first suggestion starts gently in C, but every key and exercise remains available.'
						: 'Start from the suggestion or jump straight to any key, rung or progression.',
				points: [
					'Choose a key, a skill or a progression to shape the workout.',
					'Short, standard and long describe how many tasks you will play.',
					'The ladder suggests a next step; it never locks the rest.'
				],
				next: 'Hear your hands'
			};
		}
		if (step === 3) {
			return {
				eyebrow: 'Play',
				title: 'Hear what your hands found',
				body:
					experience === 'beginner'
						? 'Play any chord. Harmonic gives you a moment to name it, then shows what landed.'
						: 'Use this as a quick recognition drill: play, name, then check the reading.',
				points: [
					'The wheel and keyboard light the notes you are holding.',
					'Press the pedal or Space to claim the chord before the reveal.',
					'Change the key or reveal delay without leaving the exercise.'
				],
				next: 'Meet the band'
			};
		}
		if (step === 4) {
			return {
				eyebrow: 'Play along',
				title: 'Put harmony in motion',
				body: 'The rhythm section is generated, so every chart works in any key and at your tempo.',
				points: [
					'Tap a bar to inspect it; tap bars to build a practice loop.',
					'Charts and Setup change the tune, key, feel and band.',
					'The pedal or Space cycles play, pause and resume.'
				],
				next: 'Open the songbook'
			};
		}
		if (step === 5) {
			return {
				eyebrow: 'Songbook',
				title: 'Choose the music',
				body: 'Search the built-in repertoire, filter it by style, or write a chart of your own.',
				points: [
					'Each tune shows the harmony and the keys you have practised.',
					'Open any chart directly in Play along.',
					'Your own charts live beside the built-in songbook.'
				],
				next: 'Explore harmony'
			};
		}
		if (step === 6) {
			return {
				eyebrow: 'Explore',
				title: 'Take the wheel apart',
				body: 'Explore is the study bench: rotate the wheel, light notes, and inspect chords, scales and voice leading.',
				points: [
					'The five page links stay at the top, wherever you are.',
					'Live note colours confirm that the piano is still connected.',
					'Your profile menu holds keyboard, timing, wheel and colour settings—and this tour.'
				],
				next: 'Start practising'
			};
		}
		return null;
	});

	const storageKey = () => `harmonic:onboarding:v1:${encodeURIComponent(userName)}`;

	onMount(() => {
		const stored = localStorage.getItem(storageKey());
		if (stored) {
			try {
				const record = JSON.parse(stored) as { experience?: ExperienceLevel };
				if (record.experience === 'beginner' || record.experience === 'experienced') {
					experience = record.experience;
				}
			} catch {
				// An old or hand-edited value still means the tour was seen.
			}
			return;
		}
		void start(true);
	});

	$effect(() => {
		if (request <= seenRequest) return;
		seenRequest = request;
		void start(false);
	});

	$effect(() => {
		if (!open) return;
		return midi.onNote((note) => {
			if (step !== 0 || setupStage !== 'confirm') return;
			const pc = ((note % 12) + 12) % 12;
			hits = [
				...hits.slice(-11),
				{ id: hitId++, note, pc, label: `${NAMES[pc]}${Math.floor(note / 12) - 1}` }
			];
		});
	});

	$effect(() => {
		if (!open) return;
		return midi.onPedal(
			(down) => {
				if (!down) return false;
				// The tour owns the pedal while it is open. Early presses are consumed
				// rather than leaking through to the real page behind it.
				if (step < 1 || moving) return true;
				if (step === 1) {
					pedalRecognised = true;
					moving = true;
					setTimeout(() => {
						moving = false;
						void jumpTo(2);
					}, 360);
				} else {
					void jumpTo(step + 1);
				}
				return true;
			},
			{ priority: 100 }
		);
	});

	$effect(() => {
		if (!open) return;
		void page.url.pathname;
		void step;
		void measure();
	});

	async function start(isFirstRun: boolean) {
		firstRun = isFirstRun;
		settingsApplied = false;
		settingsProblem = null;
		pedalRecognised = false;
		setupStage = 'experience';
		inputMode = 'midi';
		connecting = false;
		hits = [];
		step = 0;
		open = true;
		if (page.url.pathname !== '/') await goto('/');
		await focusCard();
	}

	async function applyExperience() {
		if (!firstRun || settingsApplied) return;
		settingsProblem = null;
		try {
			const nextPrefs = prefsForExperience(prefs, experience);
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prefs: nextPrefs })
			});
			if (!response.ok) throw new Error(await response.text());
			midi.windowMs = nextPrefs.chordClusterWindowMs;
			midi.latencyOffsetMs = nextPrefs.midiLatencyOffsetMs;
			settingsApplied = true;
			await invalidateAll();
		} catch {
			settingsProblem = 'Your tour will continue, but those starting settings could not be saved.';
		}
	}

	async function beginConnection() {
		if (moving) return;
		moving = true;
		try {
			await applyExperience();
			setupStage = 'connect';
			await focusCard();
		} finally {
			moving = false;
		}
	}

	async function requestMidi() {
		if (connecting || midi.status === 'requesting') return;
		connecting = true;
		try {
			await connectMidi();
			await focusCard();
		} finally {
			connecting = false;
		}
	}

	async function beginConfirmation(mode: InputMode) {
		inputMode = mode;
		hits = [];
		setupStage = 'confirm';
		await focusCard();
	}

	async function backToConnection() {
		hits = [];
		setupStage = 'connect';
		await focusCard();
	}

	async function jumpTo(next: number) {
		if (moving || !open) return;
		if (next >= STEPS.length) {
			finish('completed');
			return;
		}

		moving = true;
		try {
			if (step === 0) await applyExperience();
			if (next === 0 && step !== 0) {
				setupStage = 'experience';
				inputMode = 'midi';
				hits = [];
			}
			step = Math.max(0, next);
			const path = STEPS[step].path;
			if (page.url.pathname !== path) await goto(path);
			await focusCard();
		} finally {
			moving = false;
		}
	}

	function finish(status: 'completed' | 'skipped') {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(
				storageKey(),
				JSON.stringify({ status, experience, inputMode, version: 1, at: new Date().toISOString() })
			);
		}
		open = false;
		spotlight = null;
		firstRun = false;
	}

	async function focusCard() {
		await tick();
		card?.focus({ preventScroll: true });
	}

	async function measure() {
		if (!open || !current.target || typeof document === 'undefined') {
			spotlight = null;
			return;
		}
		await tick();
		requestAnimationFrame(() => {
			const target = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
			if (!target) {
				spotlight = null;
				return;
			}
			const rect = target.getBoundingClientRect();
			const gap = 8;
			const left = Math.max(gap, rect.left - gap);
			const top = Math.max(gap, rect.top - gap);
			const right = Math.min(window.innerWidth - gap, rect.right + gap);
			const bottom = Math.min(window.innerHeight - gap, rect.bottom + gap);
			spotlight = {
				left,
				top,
				width: Math.max(0, right - left),
				height: Math.max(0, bottom - top)
			};
		});
	}

	function virtual(type: 'noteon' | 'noteoff', note: number) {
		midi.push(
			type === 'noteon'
				? { type, note, velocity: 88, time: performance.now() }
				: ({ type, note, time: performance.now() } as MidiEvent)
		);
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		finish('skipped');
	}
</script>

<svelte:window onresize={measure} onscroll={measure} onkeydown={onWindowKeydown} />

{#if open}
	<div class="tour-layer">
		{#if spotlight}
			<div
				class="spotlight"
				style:left={`${spotlight.left}px`}
				style:top={`${spotlight.top}px`}
				style:width={`${spotlight.width}px`}
				style:height={`${spotlight.height}px`}
			></div>
		{:else}
			<div class="scrim"></div>
		{/if}

		<div
			class="tour-card"
			class:is-page={step >= 2}
			class:is-wide={step === 0 && setupStage === 'confirm'}
			role="dialog"
			aria-modal="false"
			aria-labelledby="tour-title"
			tabindex="-1"
			bind:this={card}
		>
			<header class="tour-head">
				<p>First-time tour · {progressLabel}</p>
				<button type="button" onclick={() => finish('skipped')} aria-label="Skip the tour">
					Skip
				</button>
			</header>

			{#if step === 0}
				{#if setupStage === 'experience'}
					<div class="intro-copy">
						<p class="eyebrow">Setup · 1 of 3</p>
						<h2 id="tour-title">Where are you starting?</h2>
						<p>
							This sets the pace of your first workouts. It does not lock keys, exercises or tunes.
						</p>
					</div>

					<fieldset class="experience">
						<legend>Choose a starting pace</legend>
						<button
							type="button"
							class:is-selected={experience === 'beginner'}
							onclick={() => (experience = 'beginner')}
							aria-pressed={experience === 'beginner'}
						>
							<strong>Beginner</strong>
							<span>Start in C · short workouts · 3-second chord reveal</span>
						</button>
						<button
							type="button"
							class:is-selected={experience === 'experienced'}
							onclick={() => (experience = 'experienced')}
							aria-pressed={experience === 'experienced'}
						>
							<strong>Experienced</strong>
							<span>Jump anywhere · standard workouts · 1.5-second reveal</span>
						</button>
					</fieldset>
				{:else if setupStage === 'connect'}
					<div class="intro-copy">
						<p class="eyebrow">Setup · 2 of 3</p>
						<h2 id="tour-title">Connect your piano</h2>
						<p>
							Switch it on first, then let this browser use MIDI. Harmonic never sends notes out.
						</p>
					</div>

					<section class="connection-panel" aria-live="polite" aria-label="MIDI connection">
						{#if midi.status === 'idle'}
							<div class="connection-state">
								<i class="status-mark" aria-hidden="true"></i>
								<span>
									<strong>Not connected yet</strong>
									<small>Press Connect, then allow MIDI when your browser asks.</small>
								</span>
							</div>
						{:else if midi.status === 'requesting'}
							<div class="connection-state">
								<i class="status-mark is-waiting" aria-hidden="true"></i>
								<span>
									<strong>Waiting for permission</strong>
									<small>Choose Allow in the browser prompt.</small>
								</span>
							</div>
						{:else if midi.status === 'ready' && device}
							<div class="connection-state is-ready">
								<i class="status-mark is-ready" aria-hidden="true"></i>
								<span>
									<strong>{device.name}</strong>
									<small>Connected. We will test the notes next.</small>
								</span>
							</div>
							{#if midi.devices.length > 1}
								<label class="device-choice">
									<span>MIDI input</span>
									<select
										value={midi.selectedId}
										onchange={(event) => midi.select(event.currentTarget.value)}
									>
										{#each midi.devices as option (option.id)}
											<option value={option.id}>{option.name}</option>
										{/each}
									</select>
								</label>
							{/if}
						{:else if midi.status === 'ready'}
							<div class="connection-state">
								<i class="status-mark is-waiting" aria-hidden="true"></i>
								<span>
									<strong>MIDI is allowed, but no piano is visible</strong>
									<small>Switch it on or reconnect its cable. This updates automatically.</small>
								</span>
							</div>
						{:else}
							<div class="connection-state">
								<i class="status-mark" aria-hidden="true"></i>
								<span>
									<strong>MIDI is unavailable</strong>
									<small>{midi.unavailableReason}</small>
								</span>
							</div>
						{/if}
					</section>

					{#if settingsProblem}<p class="problem" role="status">{settingsProblem}</p>{/if}
				{:else}
					<div class="intro-copy">
						<p class="eyebrow">Setup · 3 of 3</p>
						<h2 id="tour-title">
							{inputMode === 'midi' ? 'Play any three notes' : 'Try the on-screen keyboard'}
						</h2>
						<p>
							{inputMode === 'midi'
								? 'Watch each note appear below. Three different notes confirms that the full MIDI signal is reaching Harmonic.'
								: 'Click or tap three different keys. You can practise without MIDI and connect a piano later from Settings.'}
						</p>
					</div>

					<div class="midi-status" aria-live="polite">
						{#if inputMode === 'midi'}
							<span class="listening"
								><i></i>Listening only to {device?.name ?? 'your MIDI input'}</span
							>
						{:else}
							<span>On-screen input · computer keys A through semicolon also work</span>
						{/if}
					</div>

					<div
						class="piano-roll"
						role="status"
						aria-live="polite"
						aria-label={`${uniqueNotes} different notes played`}
					>
						<div class="roll-labels" aria-hidden="true">
							{#each NAMES as name (name)}<span>{name}</span>{/each}
						</div>
						<div class="now-line"><span>now</span></div>
						{#each hits as hit, i (hit.id)}
							<span
								class="note-hit"
								aria-hidden="true"
								style:left={`${hit.pc * (100 / 12) + 0.45}%`}
								style:bottom={`${0.8 + (hits.length - 1 - i) * 0.54}rem`}
								style:--note-color={`var(--pc-${hit.pc})`}
								style:--note-ink={`var(--pc-${hit.pc}-ink)`}>{hit.label}</span
							>
						{/each}
						<p class="roll-count">{Math.min(uniqueNotes, 3)} / 3</p>
					</div>

					<div class="tour-keyboard" class:is-passive={inputMode === 'midi'}>
						<Keyboard
							from={48}
							count={17}
							lit={midi.live}
							interactive={inputMode === 'screen'}
							showLabels={false}
							onnoteon={inputMode === 'screen' ? (note) => virtual('noteon', note) : undefined}
							onnoteoff={inputMode === 'screen' ? (note) => virtual('noteoff', note) : undefined}
						/>
					</div>
				{/if}
			{:else if step === 1}
				<div class="pedal-step">
					<div class="pedal" class:is-down={midi.pedalDown || pedalRecognised} aria-hidden="true">
						<span class="pedal-arm"></span>
						<span class="pedal-foot"></span>
					</div>
					<div class="intro-copy">
						<p class="eyebrow">Hands-free next</p>
						<h2 id="tour-title">
							{pedalRecognised
								? 'That’s it.'
								: inputMode === 'midi'
									? 'Press the damper pedal'
									: 'Keep moving without a mouse'}
						</h2>
						<p>
							{inputMode === 'midi'
								? 'From here on, the pedal means the same thing as the primary button: next question, open the play-along, or play and pause the band.'
								: 'Use the large primary button or plain Space for next, play and pause. A damper pedal joins the same path whenever you connect MIDI.'}
						</p>
					</div>
				</div>
			{:else if copy}
				<div class="page-copy">
					<p class="eyebrow">{copy.eyebrow}</p>
					<h2 id="tour-title">{copy.title}</h2>
					<p>{copy.body}</p>
					<ul>
						{#each copy.points as point (point)}<li>{point}</li>{/each}
					</ul>
					<p class="pedal-reminder">
						<span></span>{inputMode === 'midi'
							? 'Pedal works as Next during this tour.'
							: 'Space works as Next during this tour.'}
					</p>
				</div>
			{/if}

			<footer class="tour-footer">
				<nav aria-label="Tour steps">
					{#each STEPS as _, i (i)}
						<button
							type="button"
							class:is-current={i === step}
							onclick={() => jumpTo(i)}
							aria-label={`Go to tour step ${i + 1}`}
							aria-current={i === step ? 'step' : undefined}
						></button>
					{/each}
				</nav>

				<div class="footer-actions">
					{#if step === 0 && setupStage === 'experience'}
						<button type="button" class="next" disabled={moving} onclick={beginConnection}>
							Set my pace <span aria-hidden="true">→</span>
						</button>
					{:else if step === 0 && setupStage === 'connect'}
						{#if midi.status !== 'unsupported' && midi.status !== 'insecure'}
							<button type="button" class="quiet" onclick={() => beginConfirmation('screen')}>
								No MIDI keyboard
							</button>
						{/if}

						{#if midiCanTest}
							<button type="button" class="next" onclick={() => beginConfirmation('midi')}>
								Test the connection <span aria-hidden="true">→</span>
							</button>
						{:else if midi.status === 'idle' || midi.status === 'denied'}
							<button type="button" class="next" disabled={connecting} onclick={requestMidi}>
								{connecting
									? 'Connecting…'
									: midi.status === 'denied'
										? 'Try MIDI again'
										: 'Connect my piano'}
								<span aria-hidden="true">→</span>
							</button>
						{:else if midi.status === 'unsupported' || midi.status === 'insecure'}
							<button type="button" class="next" onclick={() => beginConfirmation('screen')}>
								Use on-screen keyboard <span aria-hidden="true">→</span>
							</button>
						{:else}
							<button type="button" class="next" disabled>
								{midi.status === 'requesting'
									? 'Waiting for permission…'
									: 'Waiting for your piano…'}
							</button>
						{/if}
					{:else if step === 0}
						<button type="button" class="quiet" onclick={backToConnection}
							>Back to connection</button
						>
						<button
							type="button"
							class="next"
							disabled={moving || !inputConfirmed}
							onclick={() => jumpTo(1)}
						>
							{inputMode === 'midi' ? 'MIDI confirmed' : 'Keyboard works'}
							<span aria-hidden="true">→</span>
						</button>
					{:else}
						<button type="button" class="next" disabled={moving} onclick={() => jumpTo(step + 1)}>
							{step === 1 ? 'Use Next instead' : copy?.next}
							<span aria-hidden="true">→</span>
						</button>
					{/if}
				</div>
			</footer>
		</div>
	</div>
{/if}

<style>
	.tour-layer {
		position: fixed;
		inset: 0;
		z-index: 80;
		pointer-events: none;
	}

	.scrim,
	.spotlight {
		position: fixed;
		pointer-events: none;
	}

	.scrim {
		inset: 0;
		background: color-mix(in oklab, var(--color-ground) 76%, transparent);
	}

	.spotlight {
		border: 1px solid var(--color-ink-dim);
		border-radius: 12px;
		box-shadow: 0 0 0 9999px color-mix(in oklab, var(--color-ground) 78%, transparent);
		transition:
			left 220ms var(--ease-wheel),
			top 220ms var(--ease-wheel),
			width 220ms var(--ease-wheel),
			height 220ms var(--ease-wheel);
	}

	.tour-card {
		position: fixed;
		top: 50%;
		left: 50%;
		width: min(39rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		transform: translate(-50%, -50%);
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: var(--color-ground-raised);
		box-shadow: 0 24px 80px color-mix(in oklab, var(--color-ground) 86%, transparent);
		color: var(--color-ink);
		pointer-events: auto;
		outline: none;
	}

	.tour-card.is-wide {
		width: min(48rem, calc(100vw - 2rem));
	}

	.tour-card.is-page {
		top: auto;
		right: clamp(1rem, 3vw, 2.5rem);
		bottom: clamp(1rem, 3vw, 2.5rem);
		left: auto;
		width: min(27rem, calc(100vw - 2rem));
		transform: none;
	}

	.tour-head,
	.tour-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.85rem 1rem;
	}

	.tour-head {
		border-bottom: 1px solid var(--color-ground-line);
	}

	.tour-head p,
	.tour-head button,
	.eyebrow {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.tour-head p,
	.eyebrow {
		color: var(--color-ink-dim);
	}

	.tour-head button {
		min-height: 36px;
		padding: 0 0.35rem;
		color: var(--color-ink-muted);
		letter-spacing: 0.03em;
		text-transform: none;
	}

	.intro-copy,
	.page-copy {
		padding: 1.45rem 1.5rem 1.1rem;
	}

	.intro-copy h2,
	.page-copy h2 {
		margin-top: 0.3rem;
		font-family: var(--font-display);
		font-size: clamp(1.7rem, 4vw, 2.4rem);
		font-weight: 600;
		letter-spacing: -0.035em;
		line-height: 1.05;
	}

	.intro-copy > p:last-child,
	.page-copy > p:not(.eyebrow):not(.pedal-reminder) {
		max-width: 38rem;
		margin-top: 0.75rem;
		color: var(--color-ink-muted);
		font-size: 0.94rem;
		line-height: 1.55;
	}

	.experience {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		padding: 0 1.5rem 1.5rem;
	}

	.experience legend {
		grid-column: 1 / -1;
		margin-bottom: 0.2rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.experience button {
		display: flex;
		min-height: 88px;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.28rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		color: var(--color-ink-muted);
		text-align: left;
		transition:
			border-color 140ms ease,
			background 140ms ease;
	}

	.experience button.is-selected {
		border-color: var(--color-ink-dim);
		background: var(--color-ground-overlay);
		color: var(--color-ink);
	}

	.experience strong {
		font-size: 0.95rem;
	}

	.experience span {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.66rem;
		line-height: 1.45;
	}

	.problem {
		margin: 0 1.5rem 1rem;
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.connection-panel {
		display: grid;
		gap: 0.9rem;
		margin: 0 1.5rem 1.5rem;
		padding: 1rem 0;
		border-top: 1px solid var(--color-ground-line);
		border-bottom: 1px solid var(--color-ground-line);
	}

	.connection-state {
		display: flex;
		min-height: 48px;
		align-items: center;
		gap: 0.8rem;
		padding: 0 0.25rem;
	}

	.connection-state span {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.18rem;
	}

	.connection-state strong {
		color: var(--color-ink);
		font-size: 0.86rem;
		font-weight: 600;
	}

	.connection-state small {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.66rem;
		line-height: 1.45;
	}

	.status-mark {
		width: 10px;
		height: 10px;
		flex: none;
		border: 1px solid var(--color-ink-dim);
		border-radius: 50%;
	}

	.status-mark.is-waiting {
		background: var(--color-ink-dim);
		animation: breathe 1.2s ease-in-out infinite alternate;
	}

	.status-mark.is-ready {
		border: 3px solid var(--color-ground-raised);
		background: var(--color-ink);
		box-shadow: 0 0 0 1px var(--color-ink-muted);
	}

	.device-choice {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.8rem;
		padding-top: 0.9rem;
		border-top: 1px solid var(--color-ground-line);
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.65rem;
	}

	.device-choice select {
		min-width: 0;
		min-height: 38px;
		padding: 0 0.65rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 7px;
		background: var(--color-ground);
		color: var(--color-ink-muted);
		font: inherit;
	}

	.midi-status {
		display: flex;
		min-height: 38px;
		align-items: center;
		gap: 0.65rem;
		padding: 0 1.5rem 0.9rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.listening {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--color-ink-muted);
	}

	.listening i,
	.pedal-reminder span {
		display: block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-ink-muted);
	}

	.piano-roll {
		position: relative;
		height: 10rem;
		margin: 0 1.5rem;
		overflow: hidden;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		background:
			repeating-linear-gradient(
				to right,
				transparent 0,
				transparent calc(8.333% - 1px),
				var(--color-ground-line) calc(8.333% - 1px),
				var(--color-ground-line) 8.333%
			),
			var(--color-ground);
	}

	.roll-labels {
		display: grid;
		grid-template-columns: repeat(12, 1fr);
		padding: 0.35rem 0;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		text-align: center;
	}

	.now-line {
		position: absolute;
		right: 0;
		bottom: 0.55rem;
		left: 0;
		height: 1px;
		background: var(--color-ink-dim);
	}

	.now-line span {
		position: absolute;
		right: 0.25rem;
		bottom: 0.22rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.52rem;
	}

	.note-hit {
		position: absolute;
		width: 7.4%;
		min-width: 1.8rem;
		padding: 0.16rem 0.2rem;
		border-radius: 4px;
		background: var(--note-color);
		color: var(--note-ink);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		font-weight: 500;
		text-align: center;
		animation: land 160ms var(--ease-wheel);
	}

	.roll-count {
		position: absolute;
		top: 2rem;
		right: 0.55rem;
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.65rem;
	}

	.tour-keyboard {
		max-width: 38rem;
		margin: 0.85rem auto 0;
		padding: 0 1.5rem;
	}

	.tour-keyboard.is-passive {
		cursor: default;
	}

	.pedal-step {
		display: grid;
		grid-template-columns: 9rem 1fr;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.5rem 0.6rem;
	}

	.pedal-step .intro-copy {
		padding-right: 0;
		padding-left: 0;
	}

	.pedal {
		position: relative;
		height: 9rem;
		transform-origin: 50% 100%;
		transition: transform 130ms ease-out;
	}

	.pedal.is-down {
		transform: translateY(5px) rotateX(10deg);
	}

	.pedal-arm,
	.pedal-foot {
		position: absolute;
		left: 50%;
		display: block;
		transform: translateX(-50%);
		background: var(--color-ink-muted);
	}

	.pedal-arm {
		top: 0.8rem;
		width: 1.1rem;
		height: 5rem;
		border-radius: 0 0 6px 6px;
	}

	.pedal-foot {
		bottom: 0.65rem;
		width: 5.7rem;
		height: 3.1rem;
		border-radius: 42% 42% 10px 10px;
		transform: translateX(-50%) perspective(80px) rotateX(18deg);
		background: var(--color-ink);
		box-shadow: 0 8px 0 var(--color-ground-overlay);
	}

	.page-copy h2 {
		font-size: 2rem;
	}

	.page-copy ul {
		display: grid;
		gap: 0.55rem;
		margin-top: 1rem;
		color: var(--color-ink-muted);
		font-size: 0.8rem;
		line-height: 1.45;
	}

	.page-copy li {
		position: relative;
		padding-left: 1rem;
	}

	.page-copy li::before {
		position: absolute;
		top: 0.55em;
		left: 0;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-ink-dim);
		content: '';
	}

	.pedal-reminder {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 1.15rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.64rem;
	}

	.tour-footer {
		border-top: 1px solid var(--color-ground-line);
	}

	.tour-footer nav {
		display: flex;
		align-items: center;
		gap: 0.28rem;
	}

	.tour-footer nav button {
		width: 0.62rem;
		height: 0.28rem;
		border-radius: 2px;
		background: var(--color-ground-overlay);
		transition:
			width 140ms ease,
			background 140ms ease;
	}

	.tour-footer nav button.is-current {
		width: 1.2rem;
		background: var(--color-ink-muted);
	}

	.footer-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.7rem;
	}

	.quiet {
		min-height: 42px;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.66rem;
	}

	.next {
		display: flex;
		min-height: 42px;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0 1rem;
		border-radius: 8px;
		background: var(--color-ink);
		color: var(--color-ground);
		font-size: 0.82rem;
		font-weight: 600;
	}

	.next:disabled {
		opacity: 0.32;
	}

	@keyframes land {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes breathe {
		from {
			opacity: 0.35;
		}
		to {
			opacity: 1;
		}
	}

	@media (hover: hover) {
		.tour-head button:hover,
		.quiet:hover {
			color: var(--color-ink);
		}

		.experience button:hover {
			border-color: var(--color-ink-muted);
		}
	}

	@media (max-width: 639px) {
		.tour-card,
		.tour-card.is-wide,
		.tour-card.is-page {
			top: auto;
			right: 0.6rem;
			bottom: 0.6rem;
			left: 0.6rem;
			width: auto;
			max-height: calc(100dvh - 1.2rem);
			transform: none;
		}

		.intro-copy,
		.page-copy {
			padding: 1.15rem 1rem 0.9rem;
		}

		.experience {
			grid-template-columns: 1fr;
			padding: 0 1rem 1rem;
		}

		.connection-panel {
			margin-right: 1rem;
			margin-left: 1rem;
		}

		.experience button {
			min-height: 72px;
		}

		.midi-status,
		.tour-keyboard {
			padding-right: 1rem;
			padding-left: 1rem;
		}

		.piano-roll {
			margin-right: 1rem;
			margin-left: 1rem;
		}

		.pedal-step {
			grid-template-columns: 6rem 1fr;
			padding: 0.8rem 1rem 0.35rem;
		}

		.pedal {
			transform: scale(0.8);
		}

		.pedal.is-down {
			transform: scale(0.8) translateY(5px) rotateX(10deg);
		}

		.tour-footer {
			align-items: flex-end;
		}

		.footer-actions {
			flex-direction: column-reverse;
			align-items: flex-end;
			gap: 0.15rem;
		}

		.roll-labels span:nth-child(even) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spotlight,
		.pedal,
		.tour-footer nav button {
			transition: none;
		}

		.note-hit {
			animation: none;
		}

		.status-mark.is-waiting {
			animation: none;
		}
	}
</style>
