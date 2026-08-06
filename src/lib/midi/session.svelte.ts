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
	#timer: ReturnType<typeof setInterval> | null = null;
	#onChord: ((chord: ChordEvent) => void) | null = null;
	#onPedal: ((down: boolean) => void) | null = null;

	/** Recording */
	recording = $state(false);
	#recorded: MidiEvent[] = [];
	#recordStart = 0;

	/** Why this browser cannot do MIDI, in words worth showing a person. */
	get unavailableReason(): string | null {
		if (this.status === 'unsupported') {
			return 'This browser has no Web MIDI. Safari has never supported it, and every browser on iPad and iPhone is Safari underneath. Use Chrome, Edge or Firefox on a laptop.';
		}
		if (this.status === 'insecure') {
			return 'Web MIDI needs a secure connection. Open this over https rather than http.';
		}
		if (this.status === 'denied') {
			return 'Permission to use MIDI devices was declined. Allow it in the browser’s site settings and reload.';
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
		} catch {
			this.status = 'denied';
			return;
		}

		this.status = 'ready';
		this.#refreshDevices();
		// Hot-plug: a piano switched on after the page loaded should just appear.
		this.#access.onstatechange = () => this.#refreshDevices();
		this.#startPolling();
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

		// Keep listening to whatever is chosen; otherwise take the first thing
		// plugged in, so the common case needs no interaction at all.
		if (this.selectedId && !found.some((d) => d.id === this.selectedId)) {
			this.selectedId = null;
		}
		if (!this.selectedId && found.length) this.selectedId = found[0].id;

		this.#access.inputs.forEach((input) => {
			input.onmidimessage = input.id === this.selectedId ? (e) => this.#receive(e) : null;
		});
	}

	select(id: string) {
		this.selectedId = id;
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

		if (event.type === 'sustain') {
			this.pedalDown = event.down;
			if (event.down) this.#onPedal?.(true);
		}
	}

	onChord(handler: (chord: ChordEvent) => void) {
		this.#onChord = handler;
	}

	/** Sustain pedal as navigation: CC64 advances when both hands are busy. */
	onPedal(handler: (down: boolean) => void) {
		this.#onPedal = handler;
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
	#startPolling() {
		if (this.#timer) return;
		this.#timer = setInterval(() => this.#tick(), 16);
	}

	#tick() {
		const result = flush(this.#cluster, performance.now(), this.windowMs);
		this.#cluster = result.state;
		if (result.chord) {
			this.lastChord = result.chord;
			this.#onChord?.(result.chord);
		}
	}

	/** Start polling without a MIDI device, for the on-screen keyboard. */
	startVirtual() {
		this.#startPolling();
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
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = null;
		if (this.#access) {
			this.#access.onstatechange = null;
			this.#access.inputs.forEach((input) => (input.onmidimessage = null));
		}
	}
}
