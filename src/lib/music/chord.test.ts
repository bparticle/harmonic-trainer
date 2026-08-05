import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import {
	chordNotes,
	closeVoicing,
	diatonicSeventh,
	diatonicTriad,
	drop2,
	formatChord,
	invert,
	parseChord,
	rootlessVoicing,
	shellVoicing
} from './chord';
import { parseKey } from './key';
import { formatNote, midi } from './note';

const pitches = (notes: ReturnType<typeof chordNotes>) => notes.map((n) => formatNote(n));
const withOctaves = (notes: ReturnType<typeof chordNotes>) =>
	notes.map((n) => formatNote(n, { octave: true }));

describe('diatonic seventh chords', () => {
	const cases = Object.entries(golden.diatonicSevenths);

	it.each(cases)('%s', (keyName, expected) => {
		const k = parseKey(keyName);
		const built = [1, 2, 3, 4, 5, 6, 7].map((d) => formatChord(diatonicSeventh(k, d)));
		expect(built).toEqual(expected);
	});

	it('covers all 12 major and 12 minor keys', () => {
		const keys = Object.keys(golden.diatonicSevenths);
		expect(keys.filter((k) => !k.endsWith('m')).length).toBeGreaterThanOrEqual(12);
		expect(keys.filter((k) => k.endsWith('m')).length).toBeGreaterThanOrEqual(12);
	});
});

describe('diatonic triads', () => {
	const cases = Object.entries(golden.diatonicTriads);

	it.each(cases)('%s', (keyName, expected) => {
		const k = parseKey(keyName);
		expect([1, 2, 3, 4, 5, 6, 7].map((d) => formatChord(diatonicTriad(k, d)))).toEqual(expected);
	});
});

describe('chord spelling', () => {
	const cases = golden.chordSpelling;

	it.each(cases)('$why', ({ chord: symbol, notes }) => {
		expect(pitches(chordNotes(parseChord(symbol)))).toEqual(notes);
	});
});

describe('inversions', () => {
	const cases = golden.inversions;

	it.each(cases)('$chord inversion $inversion', ({ chord: symbol, inversion, notes }) => {
		const voicing = invert(closeVoicing(parseChord(symbol), 3), inversion);
		expect(withOctaves(voicing)).toEqual(notes);
	});

	it('leaves the chord itself unchanged by inverting it', () => {
		const c = parseChord('Dm7');
		for (let i = 0; i <= 3; i++) {
			const voicing = invert(closeVoicing(c, 3), i);
			const classes = new Set(voicing.map((n) => ((midi(n) % 12) + 12) % 12));
			expect([...classes].sort()).toEqual([0, 2, 5, 9]);
		}
	});

	it('always ascends', () => {
		for (const symbol of ['Cmaj7', 'Dm7', 'G7', 'Bm7b5']) {
			for (let i = 0; i <= 3; i++) {
				const voicing = invert(closeVoicing(parseChord(symbol), 3), i);
				const numbers = voicing.map(midi);
				expect([...numbers].sort((a, b) => a - b), `${symbol} inv ${i}`).toEqual(numbers);
			}
		}
	});
});

describe('voicings', () => {
	const cases = golden.voicings;

	it.each(cases)('$chord $type $order$form', ({ chord: symbol, type, order, form, notes }) => {
		const c = parseChord(symbol);
		const voicing =
			type === 'shell'
				? shellVoicing(c, order as '1-3-7' | '1-7-3', 3)
				: rootlessVoicing(c, form as 'A' | 'B', 3);
		expect(withOctaves(voicing)).toEqual(notes);
	});

	it('omits the root from rootless voicings', () => {
		for (const symbol of ['Dm9', 'G13', 'Cmaj9']) {
			const c = parseChord(symbol);
			const rootPc = ((midi(c.root) % 12) + 12) % 12;
			for (const form of ['A', 'B'] as const) {
				const classes = rootlessVoicing(c, form, 3).map((n) => ((midi(n) % 12) + 12) % 12);
				expect(classes, `${symbol} form ${form}`).not.toContain(rootPc);
			}
		}
	});

	it('keeps only root, third and seventh in a shell voicing', () => {
		const voicing = shellVoicing(parseChord('Cmaj7'), '1-3-7', 3);
		expect(voicing).toHaveLength(3);
		expect(pitches(voicing)).toEqual(['C', 'E', 'B']);
	});

	it('drops the second voice from the top by an octave', () => {
		const close = closeVoicing(parseChord('Cmaj7'), 3);
		const dropped = drop2(close);
		expect(withOctaves(close)).toEqual(['C3', 'E3', 'G3', 'B3']);
		expect(withOctaves(dropped)).toEqual(['G2', 'C3', 'E3', 'B3']);
	});
});

describe('chord symbols', () => {
	it.each(golden.symbolRoundTrip)('round-trips %s', (symbol) => {
		expect(formatChord(parseChord(symbol))).toBe(symbol);
	});

	it('renders the proper glyphs in unicode mode', () => {
		expect(formatChord(parseChord('Cmaj7'), true)).toBe('C∆');
		expect(formatChord(parseChord('Bm7b5'), true)).toBe('Bø7');
		expect(formatChord(parseChord('F#dim7'), true)).toBe('F♯°7');
		expect(formatChord(parseChord('G7b9'), true)).toBe('G7♭9');
		expect(formatChord(parseChord('Eb7'), true)).toBe('E♭7');
	});

	it('reads the several ways people write the same chord', () => {
		const minorSeventh = ['Dm7', 'Dmin7', 'D-7'];
		for (const symbol of minorSeventh) {
			expect(formatChord(parseChord(symbol))).toBe('Dm7');
		}
		for (const symbol of ['Cmaj7', 'CM7', 'C∆']) {
			expect(formatChord(parseChord(symbol))).toBe('Cmaj7');
		}
	});

	it('handles slash chords', () => {
		const c = parseChord('C/E');
		expect(formatNote(c.bass!)).toBe('E');
		expect(formatChord(c)).toBe('C/E');
	});

	it('treats a plain diminished triad as distinct from a half-diminished seventh', () => {
		expect(formatChord(parseChord('Bdim'))).toBe('Bdim');
		expect(formatChord(parseChord('Bm7b5'))).toBe('Bm7b5');
		expect(chordNotes(parseChord('Bdim'))).toHaveLength(3);
		expect(chordNotes(parseChord('Bm7b5'))).toHaveLength(4);
	});

	it('expands a 13 chord to contain its seventh and ninth', () => {
		expect(pitches(chordNotes(parseChord('G13')))).toEqual(['G', 'B', 'D', 'F', 'A', 'E']);
	});

	it('does not give a 6 chord a seventh', () => {
		expect(pitches(chordNotes(parseChord('C6')))).toEqual(['C', 'E', 'G', 'A']);
	});
});
