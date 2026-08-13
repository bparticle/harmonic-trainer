import type { Key } from '$lib/music/key';
import { WakeLock } from '$lib/wake-lock';
import { totalBeats, walkingBass, type BarChord } from './bass';
import { compPattern, drumPattern, type CompHit, type DrumHit, type Feel } from './groove';

/**
 * The backing track.
 *
 * A rhythm section you can practise against: bass, drums and — if you want it —
 * comping. Everything is generated from the chord chart, so any form plays in
 * any key at any tempo without a recording existing anywhere.
 *
 * Times are given to Tone in musical units (`{'4n': 3.5}` means three and a half
 * quarter notes) rather than seconds. That is the whole reason the tempo slider
 * can move while the track is playing: musical time rescales, seconds do not.
 */

type Tone = typeof import('tone');

export type Part = 'bass' | 'drums' | 'comp' | 'metronome';

export type BackingConfig = {
	bars: BarChord[];
	bpm: number;
	feel: Feel;
	key?: Key;
	/** Bars to loop, counted from one and inclusive. Omit for the whole form. */
	loopFrom?: number;
	loopTo?: number;
	beatsPerBar?: number;
	countInBars?: number;
};

const DEFAULT_BEATS_PER_BAR = 4;

/**
 * Headroom given to the transport instead of starting it at literal "now".
 *
 * On a cold start the audio clock can still be catching up when the first
 * events come due, and Tone clamps each one to whatever `currentTime` it sees
 * at that moment — two events landing on the same clamped instant is what
 * throws "Start time must be strictly greater than previous start time".
 * 100ms is inaudible ahead of a count-in click but comfortably outruns that
 * startup jank.
 */
const START_BUFFER = '+0.1';

let tone: Tone | null = null;

async function load(): Promise<Tone> {
	if (!tone) tone = await import('tone');
	return tone;
}

type Voices = {
	bass: import('tone').MonoSynth;
	ride: import('tone').MetalSynth;
	hihat: import('tone').MetalSynth;
	kick: import('tone').MembraneSynth;
	snare: import('tone').NoiseSynth;
	comp: import('tone').PolySynth;
	click: import('tone').MembraneSynth;
	gains: Record<Part, import('tone').Gain>;
};

const midiToFrequency = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

function build(t: Tone): Voices {
	const gains: Record<Part, import('tone').Gain> = {
		bass: new t.Gain(1).toDestination(),
		drums: new t.Gain(1).toDestination(),
		comp: new t.Gain(1).toDestination(),
		metronome: new t.Gain(0).toDestination()
	};

	/*
	 * An upright bass is mostly fundamental with a short thump on top. A sine
	 * through a low filter with a fast attack gets close enough that the ear
	 * hears a bass line rather than a synthesiser, which is all that is needed
	 * to hear the harmony move.
	 */
	const bass = new t.MonoSynth({
		oscillator: { type: 'sine' },
		envelope: { attack: 0.012, decay: 0.28, sustain: 0.55, release: 0.24 },
		filter: { type: 'lowpass', Q: 1 },
		filterEnvelope: {
			attack: 0.006,
			decay: 0.14,
			sustain: 0.3,
			baseFrequency: 90,
			octaves: 2.4
		}
	}).connect(gains.bass);
	bass.volume.value = -6;

	/*
	 * Cymbals.
	 *
	 * MetalSynth is a quiet instrument by nature — six detuned square waves
	 * through a highpass — and the first pass trimmed it a further 30dB on top of
	 * that. Against a bass at -6 the ride simply was not there, which is exactly
	 * how it was reported.
	 *
	 * These numbers were set by metering each part alone at the destination
	 * rather than by ear-guessing: the kit now peaks about 2dB under the bass.
	 * Cymbals are transients, so peaking a little under a sustained bass note is
	 * what "level with it" sounds like.
	 */
	const ride = new t.MetalSynth({
		envelope: { attack: 0.001, decay: 0.62, release: 0.16 },
		harmonicity: 5.1,
		modulationIndex: 32,
		resonance: 5000,
		octaves: 1.5
	}).connect(gains.drums);
	ride.volume.value = -5;

	const hihat = new t.MetalSynth({
		envelope: { attack: 0.001, decay: 0.09, release: 0.02 },
		harmonicity: 5.1,
		modulationIndex: 40,
		resonance: 7000,
		octaves: 1.2
	}).connect(gains.drums);
	hihat.volume.value = -4;

	const kick = new t.MembraneSynth({
		pitchDecay: 0.04,
		octaves: 5,
		envelope: { attack: 0.001, decay: 0.28, sustain: 0 }
	}).connect(gains.drums);
	kick.volume.value = -6;

	const snare = new t.NoiseSynth({
		noise: { type: 'white' },
		envelope: { attack: 0.001, decay: 0.12, sustain: 0 }
	}).connect(gains.drums);
	snare.volume.value = -11;

	const comp = new t.PolySynth(t.FMSynth, {
		harmonicity: 3.01,
		modulationIndex: 12,
		oscillator: { type: 'sine' },
		envelope: { attack: 0.008, decay: 1.1, sustain: 0.18, release: 1.2 },
		modulation: { type: 'sine' },
		modulationEnvelope: {
			attack: 0.004,
			decay: 0.3,
			sustain: 0.1,
			release: 0.5
		}
	}).connect(gains.comp);
	comp.maxPolyphony = 12;
	comp.volume.value = -15;

	const click = new t.MembraneSynth({
		pitchDecay: 0.008,
		octaves: 2,
		envelope: { attack: 0.001, decay: 0.14, sustain: 0 }
	}).connect(gains.metronome);
	click.volume.value = -12;

	return { bass, ride, hihat, kick, snare, comp, click, gains };
}

/** Every event the track will play, positioned in beats from the top of the form. */
export type Event =
	| { kind: 'bass'; beat: number; midi: number; duration: number }
	| { kind: 'drum'; beat: number; hit: DrumHit }
	| { kind: 'comp'; beat: number; hit: CompHit }
	| { kind: 'click'; beat: number; accent: boolean };

/**
 * An event as Tone wants it: the same thing with a `time` it understands.
 *
 * `{'4n': 3.5}` is three and a half quarter notes, which is musical time rather
 * than seconds — and musical time is what rescales when the tempo slider moves
 * under a track that is already playing.
 */
type Scheduled<T> = T & { time: Record<string, number> };

const at = <T extends { beat: number }>(event: T): Scheduled<T> => ({
	...event,
	time: { '4n': event.beat }
});

function score(config: BackingConfig): { events: Event[]; beats: number } {
	const beatsPerBar = config.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
	const bars = sliceToLoop(config);
	const beats = totalBeats(bars);
	if (beats === 0) return { events: [], beats: 0 };

	const events: Event[] = [];

	for (const note of walkingBass(bars, { key: config.key })) {
		// Just short of the beat, so consecutive notes articulate instead of
		// smearing into one continuous tone.
		events.push({
			kind: 'bass',
			beat: note.beat,
			midi: note.midi,
			duration: 0.86
		});
	}

	for (const hit of drumPattern(beats, config.feel)) {
		events.push({ kind: 'drum', beat: hit.beat, hit });
	}

	for (const hit of compPattern(bars, config.feel)) {
		// A push at the very end of the form belongs to the next time round.
		events.push({ kind: 'comp', beat: hit.beat % beats, hit });
	}

	for (let beat = 0; beat < beats; beat++) {
		events.push({ kind: 'click', beat, accent: beat % beatsPerBar === 0 });
	}

	return { events: events.sort((a, b) => a.beat - b.beat), beats };
}

/**
 * The bars the loop covers.
 *
 * Loop points are how you drill the two bars that keep falling apart, which is
 * most of what a backing track is for. Bars are numbered from one because that
 * is how they are counted out loud.
 */
function sliceToLoop(config: BackingConfig): BarChord[] {
	const beatsPerBar = config.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
	if (config.loopFrom === undefined && config.loopTo === undefined) return config.bars;

	const from = Math.max(1, config.loopFrom ?? 1);
	const to = config.loopTo ?? Number.POSITIVE_INFINITY;

	const kept: BarChord[] = [];
	let beat = 0;
	for (const bar of config.bars) {
		const barNumber = Math.floor(beat / beatsPerBar) + 1;
		if (barNumber >= from && barNumber <= to) kept.push(bar);
		beat += bar.beats;
	}
	return kept.length ? kept : config.bars;
}

/**
 * Whether two configs would produce the same schedule.
 *
 * Plain data all the way down — chords, notes, numbers — so structural
 * equality is exactly the right notion of "same": it decides whether a paused
 * position still means anything or whether `resume` has to rebuild.
 */
function sameConfig(a: BackingConfig, b: BackingConfig): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export type BackingState = {
	playing: boolean;
	/** Beats since the top of the loop, or negative during the count-in. */
	beat: number;
	bar: number;
};

/**
 * A running backing track.
 *
 * One instance owns the transport, so starting a second track stops the first —
 * which is what you want, and much simpler than mixing two rhythm sections.
 */
export class BackingTrack {
	#voices: Voices | null = null;
	#part: import('tone').Part | null = null;
	#countPart: import('tone').Part | null = null;
	#reporter: number | null = null;

	#config: BackingConfig | null = null;
	#playing = false;
	#paused = false;
	#beats = 0;
	#countInBeats = 0;
	#muted: Record<Part, boolean> = {
		bass: false,
		drums: false,
		comp: true,
		metronome: true
	};
	/** 0–1 per part, on top of the mix built into the voices themselves. */
	#level: Record<Part, number> = { bass: 1, drums: 1, comp: 1, metronome: 1 };
	// Held for exactly as long as something is actually sounding — see start,
	// pause, resume and stop — so the screen sleeps the instant nothing is.
	#wakeLock = new WakeLock();

	/** Called on every beat with the position, for highlighting the chart. */
	onBeat: ((state: BackingState) => void) | null = null;
	/** Called when the count-in ends and the form begins. */
	onStart: (() => void) | null = null;

	/**
	 * Known the moment the transport is told to go, not when a frame is drawn.
	 * The button label depends on this, and a button that does not change when
	 * pressed reads as broken.
	 */
	get playing(): boolean {
		return this.#playing;
	}

	/** Frozen mid-form by `pause`, with somewhere to `resume` back to. */
	get paused(): boolean {
		return this.#paused;
	}

	/**
	 * Where the music actually is, read straight off the audio clock.
	 *
	 * `onBeat` cannot answer this. It is delivered through `Draw`, which runs on
	 * animation frames and therefore stops entirely when the tab is not
	 * compositing — correct for a highlight, and quietly catastrophic for
	 * anything being *recorded* against the position, which would simply stop
	 * happening with no sign that it had.
	 *
	 * So this is a pull rather than a push: whoever needs to know where the form
	 * is asks at the moment they need it, on their own clock. `pass` counts
	 * complete times round the loop, which is what makes the same bar on the
	 * second time round a different event from the first.
	 */
	get position(): { beat: number; bar: number; pass: number } | null {
		if (!tone || !this.#playing || this.#beats === 0) return null;

		const transport = tone.getTransport();
		const beatsPerBar = this.#config?.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
		const elapsed = transport.ticks / transport.PPQ - this.#countInBeats;
		// Still counting in: the form has not started, so there is no position in
		// it to report and nothing played yet belongs to any bar of it.
		if (elapsed < 0) return null;

		const beat = elapsed % this.#beats;
		return {
			beat,
			bar: Math.floor(beat / beatsPerBar) + 1,
			pass: Math.floor(elapsed / this.#beats)
		};
	}

	get beatsPerLoop(): number {
		return this.#beats;
	}

	/**
	 * Start playing. Must be called from a user gesture the first time, because
	 * every browser refuses to make a sound before one.
	 */
	async start(config: BackingConfig): Promise<void> {
		const t = await load();
		await t.start();

		this.stop();

		this.#config = config;
		if (!this.#voices) this.#voices = build(t);
		const voices = this.#voices;
		this.applyMutes();

		const { events, beats } = score(config);
		this.#beats = beats;
		if (beats === 0) return;

		const beatsPerBar = config.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
		this.#countInBeats = (config.countInBars ?? 0) * beatsPerBar;

		const transport = t.getTransport();
		transport.bpm.value = config.bpm;
		transport.position = 0;

		this.#part = new t.Part<Scheduled<Event>>((time, event) => {
			play(voices, event, time);
		}, events.map(at));
		this.#part.loop = true;
		this.#part.loopStart = 0;
		this.#part.loopEnd = { '4n': beats };
		this.#part.start({ '4n': this.#countInBeats });

		if (this.#countInBeats > 0) {
			const clicks = Array.from({ length: this.#countInBeats }, (_, beat) =>
				at({ beat, accent: beat % beatsPerBar === 0 })
			);
			this.#countPart = new t.Part<(typeof clicks)[number]>((time, click) => {
				voices.click.triggerAttackRelease(
					click.accent ? 'C3' : 'C2',
					0.05,
					time,
					click.accent ? 0.9 : 0.55
				);
			}, clicks);
			// The count-in is heard whether or not the metronome is, since its whole
			// job is to tell you when to come in.
			this.#countPart.start(0);
			voices.gains.metronome.gain.value = 1;

			/*
			 * Hand the metronome back to whatever it was set to, on the audio clock.
			 *
			 * This used to happen inside the draw callback below, which meant that
			 * with the tab in the background the click would carry on for as long as
			 * you were away — rAF does not run there. Anything with a consequence
			 * belongs on the transport; only drawing belongs in Draw.
			 */
			transport.scheduleOnce(
				() => {
					this.applyMutes();
					this.onStart?.();
				},
				{ '4n': this.#countInBeats }
			);
		}

		this.#reporter = transport.scheduleRepeat((time) => {
			const beat = transport.ticks / transport.PPQ - this.#countInBeats;
			const position: BackingState = {
				playing: true,
				beat: beat < 0 ? beat : beat % beats,
				bar: beat < 0 ? 0 : Math.floor((beat % beats) / beatsPerBar) + 1
			};
			// The chart highlight is the one thing here that is purely visual, so it
			// is the one thing scheduled for the next frame rather than the next tick.
			t.getDraw().schedule(() => this.onBeat?.(position), time);
		}, '4n');

		this.#playing = true;
		transport.start(START_BUFFER);
		// The count-in counts as playing for this purpose: dozing off during the
		// four clicks before the tune starts would be a strange place to draw
		// the line.
		void this.#wakeLock.request();
	}

	stop(): void {
		this.#playing = false;
		this.#paused = false;
		this.#wakeLock.release();
		if (!tone) return;
		const transport = tone.getTransport();
		transport.stop();
		transport.position = 0;
		if (this.#reporter !== null) {
			transport.clear(this.#reporter);
			this.#reporter = null;
		}
		this.#part?.dispose();
		this.#countPart?.dispose();
		this.#part = null;
		this.#countPart = null;
		this.#voices?.bass.triggerRelease();
		this.#voices?.comp.releaseAll();
		this.onBeat?.({ playing: false, beat: 0, bar: 0 });
	}

	/**
	 * Freeze exactly where the music is, to go and find a shape under the hands.
	 *
	 * Unlike `stop`, nothing is torn down: the schedule stays in place and the
	 * transport's position is left untouched, so `resume` picks up on the same
	 * beat rather than the top of the loop. `onBeat` is not fired here either —
	 * with the transport stopped it will not fire again on its own, so whatever
	 * bar and beat the chart was last showing simply stays on screen.
	 */
	pause(): void {
		if (!this.#playing) return;
		this.#playing = false;
		this.#paused = true;
		this.#wakeLock.release();
		tone?.getTransport().pause();
		// A note left ringing into the silence would be one more thing to listen
		// past while trying to hear the shape just landed on.
		this.#voices?.bass.triggerRelease();
		this.#voices?.comp.releaseAll();
	}

	/**
	 * Continue from `pause`.
	 *
	 * If the key, chart, feel or loop changed while paused, the schedule that
	 * was paused no longer matches what should be playing — there is no "same
	 * place" to return to — so this rebuilds fresh instead, exactly as `start`
	 * would. Returns whether it actually resumed in place, so the caller knows
	 * whether a count-in is called for.
	 */
	async resume(config: BackingConfig): Promise<boolean> {
		if (!this.#paused) return false;

		if (this.#config && sameConfig(this.#config, config)) {
			this.#paused = false;
			this.#playing = true;
			tone?.getTransport().start(START_BUFFER);
			void this.#wakeLock.request();
			return true;
		}

		await this.start(config);
		return false;
	}

	/** Change tempo without stopping: musical time rescales under the events. */
	setBpm(bpm: number): void {
		if (this.#config) this.#config = { ...this.#config, bpm };
		if (tone) tone.getTransport().bpm.rampTo(bpm, 0.1);
	}

	/** Mute or unmute a part. Instant, because it is a gain and not a reschedule. */
	setMuted(part: Part, muted: boolean): void {
		this.#muted[part] = muted;
		this.applyMutes();
	}

	isMuted(part: Part): boolean {
		return this.#muted[part];
	}

	/**
	 * Balance one part against the others, 0 to 1.
	 *
	 * Whether the drums are loud enough depends on the room, the speakers and
	 * whether an actual piano is competing with them, none of which the defaults
	 * can know.
	 */
	setLevel(part: Part, level: number): void {
		this.#level[part] = Math.max(0, Math.min(1, level));
		this.applyMutes();
	}

	getLevel(part: Part): number {
		return this.#level[part];
	}

	/**
	 * Anything that changes the notes — feel, loop points, the chart itself —
	 * has to be rebuilt. Restarted from the top rather than spliced in, because
	 * a loop that changes length underneath you is disorienting to play over.
	 */
	async rebuild(changes: Partial<BackingConfig>): Promise<void> {
		if (!this.#config) return;
		const next = { ...this.#config, ...changes };
		if (this.playing) await this.start(next);
		else this.#config = next;
	}

	dispose(): void {
		this.stop();
		this.#wakeLock.dispose();
		if (this.#voices) {
			for (const voice of [
				this.#voices.bass,
				this.#voices.ride,
				this.#voices.hihat,
				this.#voices.kick,
				this.#voices.snare,
				this.#voices.comp,
				this.#voices.click
			]) {
				voice.dispose();
			}
			for (const gain of Object.values(this.#voices.gains)) gain.dispose();
			this.#voices = null;
		}
	}

	private applyMutes(): void {
		if (!this.#voices) return;
		for (const [name, gain] of Object.entries(this.#voices.gains)) {
			const part = name as Part;
			gain.gain.value = this.#muted[part] ? 0 : this.#level[part];
		}
	}
}

function play(voices: Voices, event: Event, time: number): void {
	switch (event.kind) {
		case 'bass':
			voices.bass.triggerAttackRelease(
				midiToFrequency(event.midi),
				{ '4n': event.duration },
				time,
				0.85
			);
			break;
		case 'drum': {
			const { instrument, velocity } = event.hit;
			if (instrument === 'ride') voices.ride.triggerAttackRelease('C6', 0.32, time, velocity);
			else if (instrument === 'hihat')
				voices.hihat.triggerAttackRelease('C6', 0.06, time, velocity);
			else if (instrument === 'kick') voices.kick.triggerAttackRelease('C1', 0.18, time, velocity);
			else voices.snare.triggerAttackRelease(0.1, time, velocity);
			break;
		}
		case 'comp':
			voices.comp.triggerAttackRelease(
				event.hit.notes.map(midiToFrequency),
				{ '4n': event.hit.duration },
				time,
				event.hit.velocity
			);
			break;
		case 'click':
			voices.click.triggerAttackRelease(
				event.accent ? 'C3' : 'C2',
				0.05,
				time,
				event.accent ? 0.9 : 0.5
			);
			break;
	}
}

/** Exported for the tests: what the track will play, without making a sound. */
export const scoreFor = score;
