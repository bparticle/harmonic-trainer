import type { MidiEvent } from './cluster';

/**
 * Standard MIDI File encoding for captured takes.
 *
 * A take is stored as a real SMF rather than a bespoke JSON blob, because the
 * brief wants takes kept forever and re-analysed later when the analysis engine
 * improves. A standard file also opens in any DAW, which matters the day this
 * app is not the only thing that should be able to read your own playing.
 *
 * Format 0, one track, tempo fixed at the take's tempo so wall-clock
 * milliseconds round-trip exactly.
 */

const HEADER = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
const TRACK = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"

/** MIDI's variable-length quantity: seven bits per byte, high bit as continuation. */
export function writeVarInt(value: number): number[] {
	if (value < 0) throw new Error('Variable-length quantities cannot be negative');
	const bytes = [value & 0x7f];
	let rest = value >> 7;
	while (rest > 0) {
		bytes.unshift((rest & 0x7f) | 0x80);
		rest >>= 7;
	}
	return bytes;
}

export function readVarInt(bytes: Uint8Array, offset: number): { value: number; length: number } {
	let value = 0;
	let length = 0;
	while (offset + length < bytes.length) {
		const byte = bytes[offset + length];
		value = (value << 7) | (byte & 0x7f);
		length++;
		if ((byte & 0x80) === 0) break;
	}
	return { value, length };
}

function uint32(value: number): number[] {
	return [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function uint16(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff];
}

export const DEFAULT_PPQ = 480;
export const DEFAULT_BPM = 120;

/**
 * Encode a take.
 *
 * Event times are wall-clock milliseconds from the start of the take. They are
 * converted to ticks at the given tempo, and the tempo is written into the file
 * so a decoder gets the same milliseconds back.
 */
export function encodeSmf(events: MidiEvent[], bpm = DEFAULT_BPM, ppq = DEFAULT_PPQ): Uint8Array {
	const sorted = [...events].sort((a, b) => a.time - b.time);
	const msPerTick = 60000 / (bpm * ppq);
	const microsecondsPerQuarter = Math.round(60_000_000 / bpm);

	const track: number[] = [];

	// Tempo meta event at tick zero.
	track.push(
		0x00,
		0xff,
		0x51,
		0x03,
		(microsecondsPerQuarter >> 16) & 0xff,
		(microsecondsPerQuarter >> 8) & 0xff,
		microsecondsPerQuarter & 0xff
	);

	let previousTick = 0;
	for (const event of sorted) {
		const tick = Math.max(0, Math.round(event.time / msPerTick));
		track.push(...writeVarInt(tick - previousTick));
		previousTick = tick;

		if (event.type === 'noteon') {
			track.push(0x90, event.note & 0x7f, event.velocity & 0x7f);
		} else if (event.type === 'noteoff') {
			track.push(0x80, event.note & 0x7f, 0x40);
		} else {
			track.push(0xb0, 64, event.down ? 127 : 0);
		}
	}

	// End of track.
	track.push(0x00, 0xff, 0x2f, 0x00);

	return new Uint8Array([
		...HEADER,
		...uint32(6),
		...uint16(0), // format 0
		...uint16(1), // one track
		...uint16(ppq),
		...TRACK,
		...uint32(track.length),
		...track
	]);
}

/**
 * `Omit` on a union collapses it to the keys they all share, which for
 * `MidiEvent` means losing `note` and `down`. Distributing over the union first
 * keeps each member intact.
 */
type WithoutTime<T> = T extends unknown ? Omit<T, 'time'> : never;

export type DecodedTake = {
	events: MidiEvent[];
	bpm: number;
	ppq: number;
	/** Length of the take in milliseconds. */
	durationMs: number;
};

export function decodeSmf(bytes: Uint8Array): DecodedTake {
	if (bytes.length < 14) throw new Error('Too short to be a MIDI file');
	for (let i = 0; i < 4; i++) {
		if (bytes[i] !== HEADER[i]) throw new Error('Not a MIDI file');
	}

	const ppq = (bytes[12] << 8) | bytes[13];
	if (ppq === 0) throw new Error('Malformed MIDI file: zero division');

	// Find the track chunk.
	let offset = 8 + ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]);
	for (let i = 0; i < 4; i++) {
		if (bytes[offset + i] !== TRACK[i]) throw new Error('Missing track chunk');
	}
	const trackLength =
		(bytes[offset + 4] << 24) |
		(bytes[offset + 5] << 16) |
		(bytes[offset + 6] << 8) |
		bytes[offset + 7];
	offset += 8;
	const end = Math.min(bytes.length, offset + trackLength);

	let bpm = DEFAULT_BPM;
	let tick = 0;
	let runningStatus = 0;
	const raw: Array<{ tick: number; event: WithoutTime<MidiEvent> }> = [];

	while (offset < end) {
		const delta = readVarInt(bytes, offset);
		offset += delta.length;
		tick += delta.value;

		let status = bytes[offset];
		if (status < 0x80) {
			// Running status: reuse the previous status byte.
			status = runningStatus;
		} else {
			offset++;
			runningStatus = status;
		}

		const kind = status & 0xf0;

		if (status === 0xff) {
			const type = bytes[offset++];
			const length = readVarInt(bytes, offset);
			offset += length.length;
			if (type === 0x51 && length.value === 3) {
				const micros = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
				if (micros > 0) bpm = 60_000_000 / micros;
			}
			offset += length.value;
			if (type === 0x2f) break;
			continue;
		}

		if (status === 0xf0 || status === 0xf7) {
			const length = readVarInt(bytes, offset);
			offset += length.length + length.value;
			continue;
		}

		const data1 = bytes[offset++];
		const data2 = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[offset++];

		if (kind === 0x90 && data2 > 0) {
			raw.push({ tick, event: { type: 'noteon', note: data1, velocity: data2 } });
		} else if (kind === 0x80 || (kind === 0x90 && data2 === 0)) {
			raw.push({ tick, event: { type: 'noteoff', note: data1 } });
		} else if (kind === 0xb0 && data1 === 64) {
			raw.push({ tick, event: { type: 'sustain', down: data2 >= 64 } });
		}
	}

	const msPerTick = 60000 / (bpm * ppq);
	const events = raw.map(
		({ tick: at, event }) => ({ ...event, time: at * msPerTick }) as MidiEvent
	);

	return {
		events,
		bpm,
		ppq,
		durationMs: events.length ? events[events.length - 1].time : 0
	};
}
