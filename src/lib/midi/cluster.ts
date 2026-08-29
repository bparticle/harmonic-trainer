/**
 * Turning a stream of note-ons into chord events.
 *
 * Nobody plays a chord simultaneously. Four notes intended as one gesture
 * arrive spread over some tens of milliseconds, so they have to be gathered
 * before anything can be named. The window is configurable because the right
 * value depends on the player and the passage — a rolled voicing needs a wider
 * one than a stabbed comp.
 *
 * Written as a reducer over events plus a clock so the whole thing can be
 * tested without a MIDI device, a timer or a browser.
 */

export type MidiEvent =
	| { type: 'noteon'; note: number; velocity: number; time: number }
	| { type: 'noteoff'; note: number; time: number }
	| { type: 'sustain'; down: boolean; time: number };

export type MidiEventBuffers = {
	noteon: Extract<MidiEvent, { type: 'noteon' }>;
	noteoff: Extract<MidiEvent, { type: 'noteoff' }>;
	sustain: Extract<MidiEvent, { type: 'sustain' }>;
};

/** Caller-owned decode targets for a zero-allocation Web MIDI listener. */
export const midiEventBuffers = (): MidiEventBuffers => ({
	noteon: { type: 'noteon', note: 0, velocity: 0, time: 0 },
	noteoff: { type: 'noteoff', note: 0, time: 0 },
	sustain: { type: 'sustain', down: false, time: 0 }
});

export type ChordEvent = {
	/** Sounding notes, low to high. */
	notes: number[];
	/**
	 * The notes actually under a finger, low to high.
	 *
	 * `notes` is everything *sounding*, which with the sustain pedal down is the
	 * last four chords as well as this one — the right answer for a wheel showing
	 * what the room can hear, and the wrong one for marking a chord. A drill
	 * comparing against `notes` told a pedalling pianist that a correct C major
	 * had four extra notes in it, so the shape was never marked right and the
	 * only way on was the mouse. Anything grading a gesture reads this instead.
	 */
	held: number[];
	/** When the last note of the gesture landed. */
	time: number;
	/** Loudest note-on in the gesture, 1–127. */
	velocity: number;
};

export type ClusterState = {
	/** 128 fixed MIDI slots; zero means up, otherwise the held velocity. */
	held: Uint8Array;
	/** Fixed flags for notes released while the pedal remains down. */
	sustained: Uint8Array;
	/** Number of active slots, maintained with each mutation. */
	soundingCount: number;
	pedalDown: boolean;
	/** Timestamp of the most recent note-on. */
	lastNoteOn: number;
	/** Something changed that has not been reported yet. */
	dirty: boolean;
	/** Peak velocity of the gesture being gathered. */
	peakVelocity: number;
	/** Fixed flags for the last chord, avoiding a per-flush joined string. */
	lastEmitted: Uint8Array;
	/**
	 * The same, for the notes that were under a finger.
	 *
	 * Two sets rather than one, because with the pedal down they diverge: playing
	 * C–E–G, lifting, and playing C–E–G again leaves the sounding set identical
	 * and the fingers doing something new. Comparing only the sounding set
	 * swallowed the second gesture, so a drill asking for the same chord twice in
	 * a row under the pedal never saw the second answer.
	 */
	lastEmittedHeld: Uint8Array;
	hasLastEmitted: boolean;
};

export function emptyCluster(): ClusterState {
	return {
		held: new Uint8Array(128),
		sustained: new Uint8Array(128),
		soundingCount: 0,
		pedalDown: false,
		lastNoteOn: -Infinity,
		dirty: false,
		peakVelocity: 0,
		lastEmitted: new Uint8Array(128),
		lastEmittedHeld: new Uint8Array(128),
		hasLastEmitted: false
	};
}

/** Everything currently sounding: held plus pedal-sustained. */
export function sounding(state: ClusterState): number[] {
	const notes = new Array<number>(state.soundingCount);
	for (let note = 0, index = 0; note < 128; note++) {
		if (state.held[note] !== 0 || state.sustained[note] !== 0) notes[index++] = note;
	}
	return notes;
}

/** Only what a finger is on right now. What a played chord is marked against. */
export function fingered(state: ClusterState): number[] {
	const notes: number[] = [];
	for (let note = 0; note < 128; note++) if (state.held[note] !== 0) notes.push(note);
	return notes;
}

/**
 * Mutate the fixed cluster storage in place.
 *
 * MIDI messages are an event stream, not application history. Copying two
 * collections and a state object for every note makes garbage collection scale
 * with playing speed; fixed 128-byte tables make the hot path allocation-free.
 */
export function reduce(state: ClusterState, event: MidiEvent): ClusterState {
	if (
		event.type !== 'sustain' &&
		(!Number.isInteger(event.note) || event.note < 0 || event.note > 127)
	) {
		return state;
	}
	switch (event.type) {
		case 'noteon': {
			// A note-on with zero velocity is a note-off. Plenty of hardware sends
			// them that way, including some Arturia firmware.
			if (event.velocity === 0) {
				const wasHeld = state.held[event.note] !== 0;
				state.held[event.note] = 0;
				if (wasHeld) {
					if (state.pedalDown) state.sustained[event.note] = 1;
					else state.soundingCount--;
				}
				if (state.soundingCount === 0) clearLastEmitted(state);
				return state;
			}
			if (state.held[event.note] === 0 && state.sustained[event.note] === 0) {
				state.soundingCount++;
			}
			state.held[event.note] = event.velocity;
			state.sustained[event.note] = 0;
			state.lastNoteOn = event.time;
			state.dirty = true;
			if (event.velocity > state.peakVelocity) state.peakVelocity = event.velocity;
			return state;
		}

		case 'noteoff': {
			const wasHeld = state.held[event.note] !== 0;
			state.held[event.note] = 0;
			if (wasHeld) {
				if (state.pedalDown) state.sustained[event.note] = 1;
				else state.soundingCount--;
			}
			if (state.soundingCount === 0) clearLastEmitted(state);
			// Releasing does not start a new chord — the gesture is over, and the
			// next note-on will open the next one.
			return state;
		}

		case 'sustain': {
			if (event.down) {
				state.pedalDown = true;
				return state;
			}
			// Lifting the pedal drops everything not still under a finger, which
			// changes what is sounding and so is worth re-reporting.
			state.pedalDown = false;
			for (let note = 0; note < 128; note++) {
				if (state.sustained[note] !== 0) state.soundingCount--;
			}
			state.sustained.fill(0);
			if (state.soundingCount === 0) clearLastEmitted(state);
			state.dirty = true;
			state.lastNoteOn = event.time;
			return state;
		}
	}
}

function clearLastEmitted(state: ClusterState): void {
	if (!state.hasLastEmitted) return;
	state.lastEmitted.fill(0);
	state.lastEmittedHeld.fill(0);
	state.hasLastEmitted = false;
}

/**
 * Report a chord if the gesture has settled.
 *
 * State is mutated in place and `null` is returned when there is nothing to
 * say, so polling before the deadline creates no objects.
 */
export function flush(state: ClusterState, now: number, windowMs: number): ChordEvent | null {
	if (!state.dirty || now - state.lastNoteOn < windowMs) return null;

	const count = state.soundingCount;
	if (count === 0) {
		state.dirty = false;
		state.peakVelocity = 0;
		clearLastEmitted(state);
		return null;
	}

	let same = state.hasLastEmitted;
	for (let note = 0; note < 128; note++) {
		const active = state.held[note] !== 0 || state.sustained[note] !== 0;
		if (active !== (state.lastEmitted[note] !== 0)) same = false;
		if ((state.held[note] !== 0) !== (state.lastEmittedHeld[note] !== 0)) same = false;
	}

	const velocity = state.peakVelocity || 64;
	state.dirty = false;
	state.peakVelocity = 0;

	if (same) return null;

	const notes = new Array<number>(count);
	const held: number[] = [];
	state.lastEmitted.fill(0);
	state.lastEmittedHeld.fill(0);
	for (let note = 0, index = 0; note < 128; note++) {
		if (state.held[note] !== 0 || state.sustained[note] !== 0) {
			notes[index++] = note;
			state.lastEmitted[note] = 1;
			if (state.held[note] !== 0) {
				held.push(note);
				state.lastEmittedHeld[note] = 1;
			}
		}
	}
	state.hasLastEmitted = true;
	return { notes, held, time: state.lastNoteOn, velocity };
}

/** Decode a raw Web MIDI message into something the reducer understands. */
export function parseMessage(data: Uint8Array, time: number): MidiEvent | null {
	if (data.length < 2) return null;
	const status = data[0] & 0xf0;

	if (status === 0x90) return { type: 'noteon', note: data[1], velocity: data[2] ?? 0, time };
	if (status === 0x80) return { type: 'noteoff', note: data[1], time };
	// CC64 is the sustain pedal. Anything at or above 64 counts as down, which is
	// what half-pedalling hardware expects.
	if (status === 0xb0 && data[1] === 64) {
		return { type: 'sustain', down: (data[2] ?? 0) >= 64, time };
	}
	return null;
}

/**
 * Decode into three reusable objects. The result is valid only until the next
 * call with the same buffers, which is exactly the lifetime of MidiSession.push.
 */
export function parseMessageInto(
	data: Uint8Array,
	time: number,
	buffers: MidiEventBuffers
): MidiEvent | null {
	if (data.length < 2) return null;
	const status = data[0] & 0xf0;

	if (status === 0x90) {
		const event = buffers.noteon;
		event.note = data[1];
		event.velocity = data[2] ?? 0;
		event.time = time;
		return event;
	}
	if (status === 0x80) {
		const event = buffers.noteoff;
		event.note = data[1];
		event.time = time;
		return event;
	}
	if (status === 0xb0 && data[1] === 64) {
		const event = buffers.sustain;
		event.down = (data[2] ?? 0) >= 64;
		event.time = time;
		return event;
	}
	return null;
}
