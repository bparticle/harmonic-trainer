import { describe, expect, it } from 'vitest';
import { formatNote, isEnharmonic, isSameNote, midi, note, parseNote, pitchClass } from './note';
import { between, intervalName, ivl, simplify, transpose } from './interval';

describe('midi numbers', () => {
	it('anchors C4 at 60', () => {
		expect(midi(note('C', 0, 4))).toBe(60);
		expect(midi(note('A', 0, 4))).toBe(69);
	});

	it('derives from spelling, so enharmonics collide by design', () => {
		expect(midi(parseNote('Cb4'))).toBe(59);
		expect(midi(parseNote('B3'))).toBe(59);
		expect(midi(parseNote('B#3'))).toBe(60);
		expect(midi(parseNote('C4'))).toBe(60);
		expect(midi(parseNote('Fb4'))).toBe(64);
		expect(midi(parseNote('E4'))).toBe(64);
	});

	it('handles double accidentals', () => {
		expect(midi(parseNote('Fx4'))).toBe(67);
		expect(midi(parseNote('Gbb4'))).toBe(65);
	});
});

describe('pitch class', () => {
	it('wraps correctly for notes that cross C', () => {
		expect(pitchClass(parseNote('Cb4'))).toBe(11);
		expect(pitchClass(parseNote('B#4'))).toBe(0);
		expect(pitchClass(parseNote('Dbb4'))).toBe(0);
	});
});

describe('identity', () => {
	it('separates sounding the same from being the same note', () => {
		const gSharp = parseNote('G#4');
		const aFlat = parseNote('Ab4');
		expect(isEnharmonic(gSharp, aFlat)).toBe(true);
		expect(isSameNote(gSharp, aFlat)).toBe(false);
		expect(isSameNote(gSharp, parseNote('G#4'))).toBe(true);
	});
});

describe('parsing and formatting', () => {
	it('round-trips ascii', () => {
		for (const name of ['C4', 'Eb4', 'F#3', 'Bbb5', 'Cx2', 'G0']) {
			expect(formatNote(parseNote(name), { octave: true })).toBe(name.replace('x', '##'));
		}
	});

	it('accepts unicode accidentals', () => {
		expect(parseNote('E♭4')).toEqual(note('E', -1, 4));
		expect(parseNote('F♯4')).toEqual(note('F', 1, 4));
	});

	it('emits unicode accidentals on request', () => {
		expect(formatNote(parseNote('Eb4'), { unicode: true })).toBe('E♭');
		expect(formatNote(parseNote('F#4'), { unicode: true })).toBe('F♯');
	});

	it('defaults a bare note name to octave 4', () => {
		expect(parseNote('Bb')).toEqual(note('B', -1, 4));
	});

	it('rejects nonsense', () => {
		expect(() => parseNote('H4')).toThrow();
		expect(() => parseNote('')).toThrow();
	});
});

describe('interval construction', () => {
	it('builds the simple intervals', () => {
		expect(ivl('P1')).toEqual({ steps: 0, semitones: 0 });
		expect(ivl('M3')).toEqual({ steps: 2, semitones: 4 });
		expect(ivl('m3')).toEqual({ steps: 2, semitones: 3 });
		expect(ivl('P5')).toEqual({ steps: 4, semitones: 7 });
		expect(ivl('m7')).toEqual({ steps: 6, semitones: 10 });
		expect(ivl('M7')).toEqual({ steps: 6, semitones: 11 });
	});

	it('distinguishes augmented fourth from diminished fifth', () => {
		expect(ivl('A4')).toEqual({ steps: 3, semitones: 6 });
		expect(ivl('d5')).toEqual({ steps: 4, semitones: 6 });
	});

	it('places diminished correctly on major/minor steps', () => {
		// A diminished seventh is one below minor, two below major.
		expect(ivl('d7')).toEqual({ steps: 6, semitones: 9 });
		expect(ivl('d3')).toEqual({ steps: 2, semitones: 2 });
	});

	it('handles compound intervals', () => {
		expect(ivl('M9')).toEqual({ steps: 8, semitones: 14 });
		expect(ivl('P11')).toEqual({ steps: 10, semitones: 17 });
		expect(ivl('M13')).toEqual({ steps: 12, semitones: 21 });
	});

	it('accepts chord-symbol shorthand for alterations', () => {
		expect(ivl('b9')).toEqual(ivl('m9'));
		expect(ivl('#9')).toEqual({ steps: 8, semitones: 15 });
		expect(ivl('#11')).toEqual(ivl('A11'));
		expect(ivl('b13')).toEqual(ivl('m13'));
		expect(ivl('b5')).toEqual(ivl('d5'));
	});

	it('rejects impossible qualities', () => {
		expect(() => ivl('M5')).toThrow();
		expect(() => ivl('P3')).toThrow();
		expect(() => ivl('Q4')).toThrow();
	});

	it('round-trips through intervalName', () => {
		for (const name of ['P1', 'm2', 'M3', 'P4', 'A4', 'd5', 'P5', 'm7', 'M7', 'M9', 'A11']) {
			expect(intervalName(ivl(name))).toBe(name);
		}
	});
});

describe('transposition preserves spelling', () => {
	it('spells the fourth above Gb as Cb, not B', () => {
		const result = transpose(parseNote('Gb4'), ivl('P4'));
		expect(formatNote(result, { octave: true })).toBe('Cb5');
		expect(midi(result)).toBe(71);
	});

	it('spells the second above Gb as Ab', () => {
		expect(formatNote(transpose(parseNote('Gb4'), ivl('M2')))).toBe('Ab');
	});

	it('spells the augmented fourth above B as E#', () => {
		expect(formatNote(transpose(parseNote('B3'), ivl('A4')))).toBe('E#');
	});

	it('spells the minor sixth and augmented fifth above C differently', () => {
		expect(formatNote(transpose(parseNote('C4'), ivl('m6')))).toBe('Ab');
		expect(formatNote(transpose(parseNote('C4'), ivl('A5')))).toBe('G#');
	});

	it('carries octaves correctly across the C boundary', () => {
		expect(formatNote(transpose(parseNote('A4'), ivl('m3')), { octave: true })).toBe('C5');
		expect(formatNote(transpose(parseNote('B4'), ivl('m2')), { octave: true })).toBe('C5');
	});

	it('produces double accidentals when the spelling demands one', () => {
		// The major third above D# is F##, not G.
		expect(formatNote(transpose(parseNote('D#4'), ivl('M3')))).toBe('F##');
	});

	it('agrees with midi arithmetic for every simple interval', () => {
		const names = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'A4', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
		for (const root of ['C4', 'Gb4', 'B3', 'F#4', 'Eb4', 'A#3']) {
			for (const name of names) {
				const interval = ivl(name);
				const moved = transpose(parseNote(root), interval);
				expect(midi(moved) - midi(parseNote(root)), `${root} + ${name}`).toBe(interval.semitones);
			}
		}
	});
});

describe('interval measurement', () => {
	it('measures the interval between two spelled notes', () => {
		expect(intervalName(between(parseNote('C4'), parseNote('E4')))).toBe('M3');
		expect(intervalName(between(parseNote('C4'), parseNote('Fb4')))).toBe('d4');
		expect(intervalName(between(parseNote('Gb4'), parseNote('Cb5')))).toBe('P4');
	});

	it('is the inverse of transpose', () => {
		const from = parseNote('Eb3');
		for (const name of ['M2', 'm3', 'P4', 'A4', 'm7', 'M9']) {
			const to = transpose(from, ivl(name));
			expect(intervalName(between(from, to))).toBe(name);
		}
	});

	it('reduces compound intervals', () => {
		expect(simplify(ivl('M9'))).toEqual(ivl('M2'));
		expect(simplify(ivl('P11'))).toEqual(ivl('P4'));
	});
});
