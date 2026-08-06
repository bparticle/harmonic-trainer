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

export type ChordEvent = {
	/** Sounding notes, low to high. */
	notes: number[];
	/** When the last note of the gesture landed. */
	time: number;
	/** Loudest note-on in the gesture, 1–127. */
	velocity: number;
};

export type ClusterState = {
	/** Notes physically held down, note number to velocity. */
	held: Map<number, number>;
	/** Notes released while the pedal was down, so still sounding. */
	sustained: Set<number>;
	pedalDown: boolean;
	/** Timestamp of the most recent note-on. */
	lastNoteOn: number;
	/** Something changed that has not been reported yet. */
	dirty: boolean;
	/** Peak velocity of the gesture being gathered. */
	peakVelocity: number;
	/** Last chord reported, so identical repeats are not re-emitted. */
	lastEmitted: string | null;
};

export function emptyCluster(): ClusterState {
	return {
		held: new Map(),
		sustained: new Set(),
		pedalDown: false,
		lastNoteOn: -Infinity,
		dirty: false,
		peakVelocity: 0,
		lastEmitted: null
	};
}

/** Everything currently sounding: held plus pedal-sustained. */
export function sounding(state: ClusterState): number[] {
	return [...new Set([...state.held.keys(), ...state.sustained])].sort((a, b) => a - b);
}

export function reduce(state: ClusterState, event: MidiEvent): ClusterState {
	const held = new Map(state.held);
	const sustained = new Set(state.sustained);

	switch (event.type) {
		case 'noteon': {
			// A note-on with zero velocity is a note-off. Plenty of hardware sends
			// them that way, including some Arturia firmware.
			if (event.velocity === 0) return reduce(state, { type: 'noteoff', note: event.note, time: event.time });
			held.set(event.note, event.velocity);
			sustained.delete(event.note);
			return {
				...state,
				held,
				sustained,
				lastNoteOn: event.time,
				dirty: true,
				peakVelocity: Math.max(state.peakVelocity, event.velocity)
			};
		}

		case 'noteoff': {
			held.delete(event.note);
			if (state.pedalDown) sustained.add(event.note);
			// Releasing does not start a new chord — the gesture is over, and the
			// next note-on will open the next one.
			return { ...state, held, sustained };
		}

		case 'sustain': {
			if (event.down) return { ...state, pedalDown: true };
			// Lifting the pedal drops everything not still under a finger, which
			// changes what is sounding and so is worth re-reporting.
			return { ...state, pedalDown: false, sustained: new Set(), dirty: true, lastNoteOn: event.time };
		}
	}
}

/**
 * Report a chord if the gesture has settled.
 *
 * Returns the same state untouched when there is nothing to say, so a caller
 * can poll this on every animation frame without allocating.
 */
export function flush(
	state: ClusterState,
	now: number,
	windowMs: number
): { state: ClusterState; chord: ChordEvent | null } {
	if (!state.dirty) return { state, chord: null };
	if (now - state.lastNoteOn < windowMs) return { state, chord: null };

	const notes = sounding(state);
	if (notes.length === 0) {
		return { state: { ...state, dirty: false, peakVelocity: 0, lastEmitted: null }, chord: null };
	}

	const signature = notes.join(',');
	if (signature === state.lastEmitted) {
		return { state: { ...state, dirty: false, peakVelocity: 0 }, chord: null };
	}

	return {
		state: { ...state, dirty: false, peakVelocity: 0, lastEmitted: signature },
		chord: { notes, time: state.lastNoteOn, velocity: state.peakVelocity || 64 }
	};
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
