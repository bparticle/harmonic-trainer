import { describe, expect, it } from 'vitest';
import type { MidiEvent } from './cluster';
import { decodeSmf, encodeSmf, readVarInt, writeVarInt } from './smf';

const take: MidiEvent[] = [
	{ type: 'sustain', down: true, time: 0 },
	{ type: 'noteon', note: 50, velocity: 80, time: 10 },
	{ type: 'noteon', note: 53, velocity: 92, time: 22 },
	{ type: 'noteon', note: 57, velocity: 75, time: 31 },
	{ type: 'noteoff', note: 50, time: 500 },
	{ type: 'noteoff', note: 53, time: 512 },
	{ type: 'noteoff', note: 57, time: 520 },
	{ type: 'sustain', down: false, time: 600 },
	{ type: 'noteon', note: 60, velocity: 100, time: 1200 },
	{ type: 'noteoff', note: 60, time: 1800 }
];

describe('variable-length quantities', () => {
	it('round-trips the values the spec calls out', () => {
		for (const value of [0, 1, 127, 128, 8192, 16383, 16384, 2097151]) {
			const bytes = new Uint8Array(writeVarInt(value));
			expect(readVarInt(bytes, 0).value, String(value)).toBe(value);
		}
	});

	it('uses one byte below 128 and two above', () => {
		expect(writeVarInt(127)).toHaveLength(1);
		expect(writeVarInt(128)).toHaveLength(2);
		expect(writeVarInt(128)).toEqual([0x81, 0x00]);
	});

	it('refuses negative values', () => {
		expect(() => writeVarInt(-1)).toThrow();
	});
});

describe('encoding a take', () => {
	it('writes a well-formed format 0 file', () => {
		const bytes = encodeSmf(take);
		expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
		// Header length 6, format 0, one track.
		expect(Array.from(bytes.slice(4, 12))).toEqual([0, 0, 0, 6, 0, 0, 0, 1]);
		expect(Array.from(bytes.slice(14, 18))).toEqual([0x4d, 0x54, 0x72, 0x6b]);
	});

	it('ends the track properly', () => {
		const bytes = encodeSmf(take);
		expect(Array.from(bytes.slice(-4))).toEqual([0x00, 0xff, 0x2f, 0x00]);
	});

	it('is compact — a take is kilobytes, not megabytes', () => {
		expect(encodeSmf(take).length).toBeLessThan(200);
	});
});

describe('round-tripping a take', () => {
	it('returns every event', () => {
		const decoded = decodeSmf(encodeSmf(take));
		expect(decoded.events).toHaveLength(take.length);
	});

	it('preserves notes, velocities and pedal states', () => {
		const decoded = decodeSmf(encodeSmf(take));
		expect(decoded.events.map((e) => e.type)).toEqual(take.map((e) => e.type));

		for (const [i, event] of decoded.events.entries()) {
			const original = take[i];
			if (event.type === 'noteon' && original.type === 'noteon') {
				expect(event.note).toBe(original.note);
				expect(event.velocity).toBe(original.velocity);
			}
			if (event.type === 'sustain' && original.type === 'sustain') {
				expect(event.down).toBe(original.down);
			}
		}
	});

	it('preserves timing to within a tick', () => {
		const decoded = decodeSmf(encodeSmf(take));
		// One tick at 120bpm and 480ppq is about a tenth of a millisecond.
		for (const [i, event] of decoded.events.entries()) {
			expect(Math.abs(event.time - take[i].time), `event ${i}`).toBeLessThan(1);
		}
	});

	it('preserves tempo', () => {
		for (const bpm of [60, 90, 120, 144, 200]) {
			expect(decodeSmf(encodeSmf(take, bpm)).bpm).toBeCloseTo(bpm, 1);
		}
	});

	it('keeps timing accurate at any tempo', () => {
		for (const bpm of [60, 200]) {
			const decoded = decodeSmf(encodeSmf(take, bpm));
			for (const [i, event] of decoded.events.entries()) {
				expect(Math.abs(event.time - take[i].time), `${bpm}bpm event ${i}`).toBeLessThan(1);
			}
		}
	});

	it('reports the duration', () => {
		expect(decodeSmf(encodeSmf(take)).durationMs).toBeCloseTo(1800, 0);
	});

	it('handles an empty take', () => {
		const decoded = decodeSmf(encodeSmf([]));
		expect(decoded.events).toEqual([]);
		expect(decoded.durationMs).toBe(0);
	});

	it('sorts events that arrive out of order', () => {
		const scrambled: MidiEvent[] = [
			{ type: 'noteoff', note: 60, time: 100 },
			{ type: 'noteon', note: 60, velocity: 90, time: 0 }
		];
		const decoded = decodeSmf(encodeSmf(scrambled));
		expect(decoded.events.map((e) => e.type)).toEqual(['noteon', 'noteoff']);
	});

	it('survives a long take without drifting', () => {
		const long: MidiEvent[] = [];
		for (let i = 0; i < 600; i++) {
			long.push({ type: 'noteon', note: 48 + (i % 24), velocity: 70, time: i * 500 });
			long.push({ type: 'noteoff', note: 48 + (i % 24), time: i * 500 + 400 });
		}
		const decoded = decodeSmf(encodeSmf(long));
		expect(decoded.events).toHaveLength(long.length);
		const last = decoded.events[decoded.events.length - 1];
		expect(Math.abs(last.time - long[long.length - 1].time)).toBeLessThan(2);
	});
});

describe('rejecting rubbish', () => {
	it('refuses a file that is not MIDI', () => {
		expect(() => decodeSmf(new Uint8Array([1, 2, 3]))).toThrow(/short/i);
		expect(() => decodeSmf(new Uint8Array(20))).toThrow(/not a midi file/i);
	});
});
