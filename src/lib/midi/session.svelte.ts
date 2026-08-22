import {
	emptyCluster,
	flush,
	parseMessage,
	reduce as reduceCluster,
	sounding,
	type ChordEvent,
	type ClusterState,
	type MidiEvent
} from './cluster';

/**
 * The live MIDI session: device access, hot-plug, clustering, and recording.
 *
 * `status` is the important part. Web MIDI does not exist in Safari on any
 * platform and every iOS browser is Safari underneath, so "unsupported" is a
 * first-class state the UI has to handle properly rather than an error to
 * apologise for. The on-screen keyboard drives exactly the same pipeline, so
 * nothing downstream needs to know which one is feeding it.
 */

export type MidiStatus =
	| 'idle'
	/** No Web MIDI in this browser at all — Safari, and therefore any iOS browser. */
	| 'unsupported'
	/** Web MIDI needs https. A plain http origin silently disables it. */
	| 'insecure'
	| 'requesting'
	| 'denied'
	| 'ready';

export type MidiDevice = { id: string; name: string; manufacturer: string };

type PedalHandler = (down: boolean) => boolean | void;
type Subscription<T> = { handler: T; priority: number };

export class MidiSession {
	status = $state<MidiStatus>('idle');
	devices = $state<MidiDevice[]>([]);
	selectedId = $state<string | null>(null);
	/** Notes sounding right now, for the wheel and keyboard overlays. */
	live = $state<number[]>([]);
	/** The most recently settled chord. */
	lastChord = $state<ChordEvent | null>(null);
	pedalDown = $state(false);
	error = $state<string | null>(null);

	/** Milliseconds to gather a gesture before naming it. */
	windowMs = $state(80);
	/** Offset applied to incoming timestamps after latency calibration. */
	latencyOffsetMs = $state(0);

	#access: MIDIAccess | null = null;
	#cluster: ClusterState = emptyCluster();
	#timer: ReturnType<typeof setTimeout> | null = null;
	#chordHandlers = new Set<(chord: ChordEvent) => void>();
	#pedalHandlers = new Set<Subscription<PedalHandler>>();
	#noteHandlers = new Set<(note: number, time: number) => void>();

	/** Recording */
	recording = $state(false);
	#recorded: MidiEvent[] = [];
	#recordStart = 0;

	/** Why this browser cannot do MIDI, in words worth showing a person. */
	get unavailableReason(): string | null {
		if (this.status === 'unsupported') {
			return "MIDI isn't available here. Use Chrome, Edge or Firefox on a computer.";
		}
		if (this.status === 'insecure') {
			return 'MIDI needs HTTPS. Reopen this page over https://.';
		}
		if (this.status === 'denied') {
			return 'MIDI permission is off. Allow it in Site settings, then reload.';
		}
		return null;
	}

	detect(): MidiStatus {
		if (typeof navigator === 'undefined') return (this.status = 'idle');
		if (typeof window !== 'undefined' && !window.isSecureContext) {
			return (this.status = 'insecure');
		}
		if (!('requestMIDIAccess' in navigator)) return (this.status = 'unsupported');
		return (this.status = 'idle');
	}

	async connect(): Promise<void> {
		if (this.detect() !== 'idle') return;

		this.status = 'requesting';
		try {
			this.#access = await navigator.requestMIDIAccess({ sysex: false });
			this.error = null;
		} catch (e) {
			// Keep the reason. "Nothing happened" is the least useful thing a
			// connect button can do, and swallowing the error guarantees it.
			this.error = e instanceof Error ? e.message : String(e);
			this.status = 'denied';
			return;
		}

		this.status = 'ready';
		this.#refreshDevices();
		// Hot-plug: a piano switched on after the page loaded should just appear.
		this.#access.onstatechange = () => this.#refreshDevices();
	}

	/**
	 * The device to prefer when several are plugged in, remembered by *name*.
	 *
	 * Web MIDI ids are opaque and not stable across browser restarts or replugs,
	 * so an id is no use for "always use the weighted one". The name is, and it
	 * also the only part a person recognises.
	 */
	preferredName = $state<string | null>(null);

	/** Called when the choice changes, so it can be persisted. */
	#onDeviceChosen: ((name: string) => void) | null = null;

	onDeviceChosen(handler: ((name: string) => void) | null) {
		this.#onDeviceChosen = handler;
	}

	#refreshDevices() {
		if (!this.#access) return;

		const found: MidiDevice[] = [];
		this.#access.inputs.forEach((input) => {
			found.push({
				id: input.id,
				name: input.name ?? 'Unnamed device',
				manufacturer: input.manufacturer ?? ''
			});
		});
		this.devices = found;

		/*
		 * Choosing, in order of how much it was asked for:
		 *   1. the device already selected, if it is still there
		 *   2. the remembered name — this is what survives a replug or a reload
		 *   3. whatever is plugged in
		 *
		 * The previous version dropped straight to the first device whenever the
		 * selected id went missing, so any hot-plug event silently moved you onto
		 * another port.
		 */
		const stillPresent = found.some((d) => d.id === this.selectedId);
		if (!stillPresent) {
			const remembered = this.preferredName
				? found.find((d) => d.name === this.preferredName)
				: undefined;
			this.selectedId = remembered?.id ?? found[0]?.id ?? null;
		}

		this.#access.inputs.forEach((input) => {
			input.onmidimessage = input.id === this.selectedId ? (e) => this.#receive(e) : null;
		});
	}

	select(id: string) {
		this.selectedId = id;
		const chosen = this.devices.find((d) => d.id === id);
		if (chosen) {
			this.preferredName = chosen.name;
			this.#onDeviceChosen?.(chosen.name);
		}
		this.#refreshDevices();
	}

	#receive(event: MIDIMessageEvent) {
		if (!event.data) return;
		const time = performance.now() + this.latencyOffsetMs;
		const parsed = parseMessage(event.data, time);
		if (parsed) this.push(parsed);
	}

	/**
	 * Feed an event in. Used by the MIDI listener and by the on-screen keyboard
	 * alike, which is what makes the fallback a real fallback rather than a
	 * second, lesser code path.
	 */
	push(event: MidiEvent) {
		if (this.recording) {
			this.#recorded.push({ ...event, time: event.time - this.#recordStart });
		}

		this.#cluster = reduceCluster(this.#cluster, event);
		this.live = sounding(this.#cluster);
		this.#scheduleFlush();

		/*
		 * Reported before clustering settles anything, and carrying the event's own
		 * timestamp. A line played one note at a time is still playing the chord,
		 * so anything marking against a moving target needs the notes as they land
		 * rather than the handful they eventually add up to.
		 *
		 * Zero velocity is a note-off — the reducer above normalises that for
		 * everything downstream of it, and this is not downstream of it, so the
		 * same rule has to be applied here or a release counts as a press.
		 */
		if (event.type === 'noteon' && event.velocity > 0) {
			for (const handler of [...this.#noteHandlers]) handler(event.note, event.time);
		}

		if (event.type === 'sustain') {
			this.pedalDown = event.down;
			if (event.down) {
				const subscriptions = [...this.#pedalHandlers].sort((a, b) => b.priority - a.priority);
				for (const { handler } of subscriptions) {
					// A high-priority layer such as onboarding can claim the press so the
					// page underneath does not start music or answer a card as well.
					if (handler(true) === true) break;
				}
			}
		}
	}

	/**
	 * Pages and temporary layers subscribe while they are showing, then use the
	 * returned cleanup on the way out. The session outlives every page, so a stale
	 * handler would have a screen nobody is looking at marking chords played
	 * somewhere else.
	 */
	onChord(handler: (chord: ChordEvent) => void): () => void {
		this.#chordHandlers.add(handler);
		return () => this.#chordHandlers.delete(handler);
	}

	/**
	 * Sustain pedal as navigation: CC64 advances when both hands are busy.
	 *
	 * Several layers may need to listen at once. Returning `true` claims the
	 * press, and priority lets a temporary layer such as the first-run tour sit
	 * above the page without disconnecting it.
	 */
	onPedal(handler: PedalHandler, options: { priority?: number } = {}): () => void {
		const subscription = { handler, priority: options.priority ?? 0 };
		this.#pedalHandlers.add(subscription);
		return () => this.#pedalHandlers.delete(subscription);
	}

	/**
	 * Every note as it is pressed, ahead of clustering.
	 *
	 * `onChord` reports settled gestures, which is the right grain for "name what
	 * you just played" and the wrong one for marking against music that is
	 * moving underneath you — by the time a gesture has settled, the chord it was
	 * played over may have changed.
	 */
	onNote(handler: (note: number, time: number) => void): () => void {
		this.#noteHandlers.add(handler);
		return () => this.#noteHandlers.delete(handler);
	}

	/**
	 * Deciding that a gesture has settled is a question about time, not about
	 * painting, so this runs on a timer rather than `requestAnimationFrame`.
	 *
	 * That distinction matters in practice: rAF is paused or throttled whenever
	 * the tab is not compositing, which would silently stop naming anything the
	 * moment the window lost focus or a tablet dimmed its screen. Playing into an
	 * app that has quietly stopped listening is the worst failure this thing
	 * could have.
	 */
	#scheduleFlush() {
		if (!this.#cluster.dirty) return;
		if (this.#timer) clearTimeout(this.#timer);
		const remaining = this.#cluster.lastNoteOn + this.windowMs - performance.now();
		this.#timer = setTimeout(
			() => {
				this.#timer = null;
				this.#tick();
				if (this.#cluster.dirty) this.#scheduleFlush();
			},
			Math.max(0, remaining) + 1
		);
	}

	#tick() {
		const result = flush(this.#cluster, performance.now(), this.windowMs);
		this.#cluster = result.state;
		if (result.chord) {
			this.lastChord = result.chord;
			for (const handler of [...this.#chordHandlers]) handler(result.chord);
		}
	}

	startRecording(now = performance.now()) {
		this.#recorded = [];
		this.#recordStart = now;
		this.recording = true;
	}

	stopRecording(now = performance.now()): { events: MidiEvent[]; durationMs: number } {
		this.recording = false;
		const events = this.#recorded;
		this.#recorded = [];
		return { events, durationMs: Math.max(0, now - this.#recordStart) };
	}

	reset() {
		this.#cluster = emptyCluster();
		this.live = [];
		this.lastChord = null;
		this.pedalDown = false;
	}

	destroy() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
		if (this.#access) {
			this.#access.onstatechange = null;
			this.#access.inputs.forEach((input) => (input.onmidimessage = null));
		}
		this.#chordHandlers.clear();
		this.#pedalHandlers.clear();
		this.#noteHandlers.clear();
	}
}
