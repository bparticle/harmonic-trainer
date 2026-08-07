import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import {
	chordNotes,
	closeVoicing,
	degreeLabels,
	fitToRange,
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
				expect(
					[...numbers].sort((a, b) => a - b),
					`${symbol} inv ${i}`
				).toEqual(numbers);
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

describe('naming the notes of a chord by degree', () => {
	const degrees = (symbol: string) => degreeLabels(parseChord(symbol)).map((d) => d.degree);

	it('numbers a plain triad', () => {
		expect(degrees('C')).toEqual(['1', '3', '5']);
	});

	it('flattens the third of a minor chord', () => {
		expect(degrees('Cm')).toEqual(['1', '♭3', '5']);
	});

	it('flattens the seventh of a dominant and not of a major seventh', () => {
		expect(degrees('C7')).toEqual(['1', '3', '5', '♭7']);
		expect(degrees('Cmaj7')).toEqual(['1', '3', '5', '7']);
	});

	it('double-flats the seventh of a diminished seventh', () => {
		// The thing that makes it a diminished seventh rather than a sixth.
		expect(degrees('Cdim7')).toEqual(['1', '♭3', '♭5', '♭♭7']);
	});

	it('names the half-diminished fifth', () => {
		expect(degrees('Cm7b5')).toEqual(['1', '♭3', '♭5', '♭7']);
	});

	it('keeps extensions above the octave', () => {
		expect(degrees('C9')).toEqual(['1', '3', '5', '♭7', '9']);
	});

	it('marks an alteration', () => {
		expect(degrees('C7b9')).toContain('♭9');
		expect(degrees('C7#11')).toContain('♯11');
	});

	it('hands back the spelled note alongside the number', () => {
		const labels = degreeLabels(parseChord('Eb7'));
		expect(labels.map((l) => formatNote(l.note))).toEqual(['Eb', 'G', 'Bb', 'Db']);
	});
});

describe('fitting a voicing onto the keys there are', () => {
	// Two octaves from C3, which is what the play-along diagram shows.
	const LOW = 48;
	const HIGH = 72;
	const fit = (symbol: string, octave = 4) =>
		fitToRange(closeVoicing(parseChord(symbol), octave), LOW, HIGH).map(midi);

	it('brings a chord that sat above the keys back into them', () => {
		// F7 built at octave 4 is 65-75, and the diagram stopped at 72: the
		// seventh was simply not drawn, on a chord in the plainest blues there is.
		expect(fit('F7')).toEqual([53, 57, 60, 63]);
	});

	it('brings a chord that sat below the keys back into them', () => {
		expect(fit('C', 1).every((n) => n >= LOW && n <= HIGH)).toBe(true);
	});

	it('keeps the shape: the same intervals, moved by whole octaves', () => {
		const before = closeVoicing(parseChord('G7'), 4).map(midi);
		const after = fit('G7');
		const gaps = (v: number[]) => v.slice(1).map((n, i) => n - v[i]);
		expect(gaps(after)).toEqual(gaps(before));
	});

	it('leaves a chord that already fits exactly where it is', () => {
		const before = closeVoicing(parseChord('Cmaj7'), 4).map(midi);
		expect(fit('Cmaj7')).toEqual(before);
	});

	it('never drops a note', () => {
		// A diagram missing the seventh is worse than an unexpected inversion.
		const chord = parseChord('C13b9');
		const before = closeVoicing(chord, 4);
		expect(fitToRange(before, LOW, HIGH)).toHaveLength(before.length);
	});

	it('re-stacks rather than give up when the chord is wider than the range', () => {
		const wide = closeVoicing(parseChord('C13'), 3);
		const fitted = fitToRange(wide, 60, 71).map(midi);
		expect(fitted).toHaveLength(wide.length);
		expect(fitted[0]).toBeGreaterThanOrEqual(60);
		expect([...fitted].sort((a, b) => a - b)).toEqual(fitted);
	});

	it('keeps every pitch class, whatever it had to do to fit', () => {
		const chord = parseChord('Ab13');
		const before = closeVoicing(chord, 4).map((n) => midi(n) % 12);
		const after = fitToRange(closeVoicing(chord, 4), LOW, HIGH).map((n) => midi(n) % 12);
		expect(after).toEqual(before);
	});

	it('copes with an empty voicing', () => {
		expect(fitToRange([], LOW, HIGH)).toEqual([]);
	});

	it('puts every chord of every chart inside the keys on show', () => {
		for (const symbol of ['C', 'F7', 'G7', 'Bm7b5', 'Ebmaj7', 'F#dim7', 'Dbm7', 'B7', 'Abmaj7']) {
			for (const note of fit(symbol)) {
				expect(note, symbol).toBeGreaterThanOrEqual(LOW);
				expect(note, symbol).toBeLessThanOrEqual(HIGH);
			}
		}
	});
});
