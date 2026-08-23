import { describe, expect, it } from 'vitest';
import {
	emptyCluster,
	flush,
	midiEventBuffers,
	parseMessage,
	parseMessageInto,
	reduce,
	sounding,
	type ChordEvent,
	type ClusterState,
	type MidiEvent
} from './cluster';

const WINDOW = 80;

/** Feed events, polling after each, and collect whatever chords come out. */
function play(events: MidiEvent[], pollAt: number[] = []): ChordEvent[] {
	let state: ClusterState = emptyCluster();
	const chords: ChordEvent[] = [];
	const times = [...pollAt];

	for (const event of events) {
		// Poll for every moment that has already passed *before* applying the
		// event, or the poll would see a state from the future.
		while (times.length && times[0] <= event.time) {
			const chord = flush(state, times.shift()!, WINDOW);
			if (chord) chords.push(chord);
		}
		state = reduce(state, event);
	}

	for (const time of times) {
		const chord = flush(state, time, WINDOW);
		if (chord) chords.push(chord);
	}

	return chords;
}

const on = (note: number, time: number, velocity = 80): MidiEvent => ({
	type: 'noteon',
	note,
	velocity,
	time
});
const off = (note: number, time: number): MidiEvent => ({ type: 'noteoff', note, time });
const pedal = (down: boolean, time: number): MidiEvent => ({ type: 'sustain', down, time });

describe('gathering notes into chords', () => {
	it('gathers notes played within the window into one chord', () => {
		const chords = play([on(50, 0), on(53, 12), on(57, 25), on(60, 31)], [200]);
		expect(chords).toHaveLength(1);
		expect(chords[0].notes).toEqual([50, 53, 57, 60]);
	});

	it('does not report until the gesture has settled', () => {
		expect(play([on(50, 0), on(53, 12)], [40])).toHaveLength(0);
		expect(play([on(50, 0), on(53, 12)], [200])).toHaveLength(1);
	});

	it('starts a new chord when notes arrive after the window', () => {
		const chords = play(
			[on(50, 0), on(53, 10), off(50, 300), off(53, 305), on(55, 400), on(59, 410)],
			[150, 600]
		);
		expect(chords).toHaveLength(2);
		expect(chords[0].notes).toEqual([50, 53]);
		expect(chords[1].notes).toEqual([55, 59]);
	});

	it('reports a note added to a chord already held', () => {
		const chords = play([on(50, 0), on(53, 10), on(57, 400)], [150, 600]);
		expect(chords).toHaveLength(2);
		expect(chords[0].notes).toEqual([50, 53]);
		expect(chords[1].notes).toEqual([50, 53, 57]);
	});

	it('sorts notes low to high whatever order they arrive in', () => {
		const chords = play([on(60, 0), on(50, 8), on(57, 16)], [200]);
		expect(chords[0].notes).toEqual([50, 57, 60]);
	});

	it('reports the loudest note of the gesture', () => {
		const chords = play([on(50, 0, 60), on(53, 10, 110), on(57, 20, 45)], [200]);
		expect(chords[0].velocity).toBe(110);
	});

	it('does not repeat an identical chord', () => {
		const chords = play([on(50, 0), on(53, 10)], [200, 400, 600]);
		expect(chords).toHaveLength(1);
	});

	it('does report the same chord when it is released and played again', () => {
		const chords = play(
			[on(50, 0), on(53, 10), off(50, 200), off(53, 210), on(50, 400), on(53, 410)],
			[150, 600]
		);
		expect(chords).toHaveLength(2);
		expect(chords[1].notes).toEqual([50, 53]);
	});

	it('says nothing when nothing is held', () => {
		expect(play([on(50, 0), off(50, 20)], [200])).toHaveLength(0);
	});

	it('treats a zero-velocity note-on as a note-off', () => {
		// Plenty of hardware releases notes this way.
		const chords = play([on(50, 0), on(53, 10), on(50, 300, 0), on(57, 400)], [150, 600]);
		expect(chords[0].notes).toEqual([50, 53]);
		expect(chords[1].notes).toEqual([53, 57]);
	});
});

describe('the sustain pedal', () => {
	it('keeps released notes sounding while it is down', () => {
		const chords = play(
			[pedal(true, 0), on(50, 10), on(53, 20), off(50, 100), off(53, 110), on(57, 300)],
			[150, 500]
		);
		expect(chords[0].notes).toEqual([50, 53]);
		// The first two are still sounding under the pedal when the third lands.
		expect(chords[1].notes).toEqual([50, 53, 57]);
	});

	it('drops sustained notes when it lifts', () => {
		let state = emptyCluster();
		for (const event of [pedal(true, 0), on(50, 10), off(50, 50), on(53, 60)]) {
			state = reduce(state, event);
		}
		expect(sounding(state)).toEqual([50, 53]);

		state = reduce(state, pedal(false, 100));
		expect(sounding(state)).toEqual([53]);
	});

	it('reports the new chord after the pedal lifts', () => {
		const chords = play(
			[pedal(true, 0), on(50, 10), on(53, 20), off(50, 100), pedal(false, 300)],
			[150, 500]
		);
		expect(chords).toHaveLength(2);
		expect(chords[0].notes).toEqual([50, 53]);
		expect(chords[1].notes).toEqual([53]);
	});

	it('lets a re-struck note escape the pedal', () => {
		let state = emptyCluster();
		for (const event of [pedal(true, 0), on(50, 10), off(50, 50), on(50, 60)]) {
			state = reduce(state, event);
		}
		expect(state.sustained[50]).toBe(0);
		expect(state.held[50]).toBe(80);
	});
});

describe('parsing raw messages', () => {
	it('reads note on and note off', () => {
		expect(parseMessage(new Uint8Array([0x90, 60, 100]), 5)).toEqual({
			type: 'noteon',
			note: 60,
			velocity: 100,
			time: 5
		});
		expect(parseMessage(new Uint8Array([0x80, 60, 0]), 5)).toEqual({
			type: 'noteoff',
			note: 60,
			time: 5
		});
	});

	it('reads any channel, not just channel one', () => {
		expect(parseMessage(new Uint8Array([0x95, 60, 100]), 0)?.type).toBe('noteon');
		expect(parseMessage(new Uint8Array([0x8f, 60, 0]), 0)?.type).toBe('noteoff');
	});

	it('reads the sustain pedal, with a half-pedal threshold', () => {
		expect(parseMessage(new Uint8Array([0xb0, 64, 127]), 0)).toEqual({
			type: 'sustain',
			down: true,
			time: 0
		});
		expect(parseMessage(new Uint8Array([0xb0, 64, 0]), 0)).toEqual({
			type: 'sustain',
			down: false,
			time: 0
		});
		expect(parseMessage(new Uint8Array([0xb0, 64, 64]), 0)).toMatchObject({ down: true });
		expect(parseMessage(new Uint8Array([0xb0, 64, 63]), 0)).toMatchObject({ down: false });
	});

	it('ignores everything else', () => {
		expect(parseMessage(new Uint8Array([0xb0, 1, 64]), 0)).toBeNull();
		expect(parseMessage(new Uint8Array([0xf8]), 0)).toBeNull();
		expect(parseMessage(new Uint8Array([0xe0, 0, 64]), 0)).toBeNull();
	});

	it('can decode dense input into caller-owned objects', () => {
		const buffers = midiEventBuffers();
		const first = parseMessageInto(new Uint8Array([0x90, 60, 100]), 5, buffers);
		const second = parseMessageInto(new Uint8Array([0x91, 64, 90]), 8, buffers);
		expect(first).toBe(second);
		expect(second).toEqual({ type: 'noteon', note: 64, velocity: 90, time: 8 });
	});
});
