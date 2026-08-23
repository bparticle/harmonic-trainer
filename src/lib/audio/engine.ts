/**
 * Sound.
 *
 * Your piano makes its own noise, so this never has to reproduce what you are
 * playing. It only needs to *ask* — play a chord for an ear drill, count you
 * in, keep time. That is why there are no sampled instruments to vendor: an FM
 * electric piano is a handful of parameters, loads instantly, and is more than
 * convincing enough to identify a chord from.
 *
 * Tone.js is loaded on demand. Browsers refuse to start audio before a gesture
 * anyway, so there is no reason to pay for the library on a page that may never
 * make a sound.
 */

type Tone = typeof import('tone');

let tone: Tone | null = null;
let piano: import('tone').PolySynth | null = null;
let click: import('tone').MembraneSynth | null = null;
let started = false;

async function load(): Promise<Tone> {
	if (!tone) tone = await import('tone');
	return tone;
}

/**
 * Must be called from a user gesture — a click, a key, a note played. Every
 * browser blocks audio until then, and doing it lazily means the permission is
 * spent at a moment the person actually asked for sound.
 */
export async function startAudio(): Promise<void> {
	const t = await load();
	if (!started) {
		await t.start();
		const context = t.getContext();
		if (context.lookAhead < 0.12) context.lookAhead = 0.12;
		if ('updateInterval' in context) {
			const realtime = context as import('tone').Context;
			if (realtime.updateInterval > 0.04) realtime.updateInterval = 0.04;
		}
		started = true;
	}

	if (!piano) {
		/*
		 * A Rhodes is essentially one sine modulating another, with a fast attack
		 * and a long, soft decay. Sixteen voices is more than a two-handed chord
		 * needs and cheap enough not to think about.
		 */
		piano = new t.PolySynth(t.FMSynth, {
			harmonicity: 3.01,
			modulationIndex: 12,
			oscillator: { type: 'sine' },
			envelope: { attack: 0.005, decay: 1.4, sustain: 0.22, release: 1.6 },
			modulation: { type: 'sine' },
			modulationEnvelope: { attack: 0.004, decay: 0.35, sustain: 0.1, release: 0.6 }
		}).toDestination();
		piano.maxPolyphony = 16;
		piano.volume.value = -9;
	}

	if (!click) {
		click = new t.MembraneSynth({
			pitchDecay: 0.008,
			octaves: 2,
			envelope: { attack: 0.001, decay: 0.16, sustain: 0 }
		}).toDestination();
		click.volume.value = -14;
	}
}

export function isReady(): boolean {
	return started && piano !== null;
}

const midiToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Play notes together. Used to ask an ear-drill question. */
export async function playChord(notes: number[], seconds = 1.8, velocity = 0.7): Promise<void> {
	await startAudio();
	if (!piano) return;
	piano.triggerAttackRelease(notes.map(midiToFrequency), seconds, undefined, velocity);
}

/** Play notes one after another, for intervals and scales. */
export async function playSequence(
	notes: number[],
	noteSeconds = 0.42,
	velocity = 0.7
): Promise<void> {
	await startAudio();
	const t = await load();
	if (!piano) return;

	const now = t.now();
	notes.forEach((note, i) => {
		piano!.triggerAttackRelease(
			midiToFrequency(note),
			noteSeconds * 0.9,
			now + i * noteSeconds,
			velocity
		);
	});
}

/** Play a progression: each chord in turn, held. */
export async function playProgression(chords: number[][], chordSeconds = 1.1): Promise<void> {
	await startAudio();
	const t = await load();
	if (!piano) return;

	const now = t.now();
	chords.forEach((notes, i) => {
		piano!.triggerAttackRelease(
			notes.map(midiToFrequency),
			chordSeconds * 0.95,
			now + i * chordSeconds,
			0.7
		);
	});
}

export async function stopAll(): Promise<void> {
	cancelCountIn();
	piano?.releaseAll();
}

// ---------------------------------------------------------------------------
// Metronome
// ---------------------------------------------------------------------------

let metronomeId: number | null = null;
const countInTimers = new Set<ReturnType<typeof setTimeout>>();
const countInResolvers = new Set<() => void>();

function later(callback: () => void, delayMs: number): void {
	const timer = setTimeout(() => {
		countInTimers.delete(timer);
		callback();
	}, delayMs);
	countInTimers.add(timer);
}

function cancelCountIn(): void {
	for (const timer of countInTimers) clearTimeout(timer);
	countInTimers.clear();
	for (const resolve of countInResolvers) resolve();
	countInResolvers.clear();
}

/**
 * A plain click on every beat, accented on the downbeat.
 *
 * Driven by Tone's own scheduler rather than a timer, because a metronome that
 * drifts is worse than none — and `setInterval` drifts.
 */
export async function startMetronome(bpm: number, beatsPerBar = 4): Promise<void> {
	await startAudio();
	const t = await load();
	if (!click) return;

	stopMetronome();
	t.getTransport().bpm.value = bpm;

	let beat = 0;
	metronomeId = t.getTransport().scheduleRepeat((time) => {
		const downbeat = beat % beatsPerBar === 0;
		click!.triggerAttackRelease(downbeat ? 'C3' : 'C2', 0.05, time, downbeat ? 0.9 : 0.5);
		beat++;
	}, '4n');

	t.getTransport().start();
}

export function stopMetronome(): void {
	if (metronomeId !== null && tone) {
		tone.getTransport().clear(metronomeId);
		tone.getTransport().stop();
		metronomeId = null;
	}
}

/** Four clicks before a take starts. Resolves when the count-in finishes. */
export async function countIn(bpm: number, beats = 4): Promise<void> {
	await startAudio();
	if (!click) return;
	cancelCountIn();

	const secondsPerBeat = 60 / bpm;
	for (let beat = 0; beat < beats; beat++) {
		const at = beat * secondsPerBeat * 1000;
		later(() => {
			click?.triggerAttackRelease(beat === 0 ? 'C3' : 'C2', 0.05, undefined, 0.8);
		}, at);
	}
	await new Promise<void>((resolve) => {
		const finish = () => {
			countInResolvers.delete(finish);
			resolve();
		};
		countInResolvers.add(finish);
		later(finish, beats * secondsPerBeat * 1000);
	});
}

/** Release everything and drop the nodes. */
export function dispose(): void {
	cancelCountIn();
	stopMetronome();
	piano?.dispose();
	click?.dispose();
	piano = null;
	click = null;
	started = false;
}
