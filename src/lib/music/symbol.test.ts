import { describe, expect, it } from 'vitest';
import { parseChord } from './chord';
import { chordSymbolLabel, chordSymbolParts, partsToText } from './symbol';

const text = (symbol: string) => partsToText(chordSymbolParts(parseChord(symbol)));

describe('chord symbol parts', () => {
	it('renders the proper glyphs', () => {
		expect(text('Cmaj7')).toBe('C∆');
		expect(text('Bm7b5')).toBe('Bø7');
		expect(text('F#dim7')).toBe('F♯°7');
		expect(text('Ebm7')).toBe('E♭m7');
		expect(text('G7b9')).toBe('G7♭9');
		expect(text('Caug')).toBe('C+');
	});

	it('raises extensions and alterations into a superscript group', () => {
		const parts = chordSymbolParts(parseChord('G13b9'));
		const superscript = parts.find((p) => p.kind === 'super');
		expect(superscript).toBeDefined();
		expect(partsToText([superscript!])).toBe('13♭9');
	});

	it('keeps the root letter and its accidental on the baseline', () => {
		const parts = chordSymbolParts(parseChord('Ebmaj7'));
		expect(parts[0]).toEqual({ kind: 'text', value: 'E' });
		expect(parts[1]).toEqual({ kind: 'glyph', value: 'flat' });
	});

	it('renders slash chords with a bass', () => {
		expect(text('C/E')).toBe('C/E');
		expect(text('Dm7/G')).toBe('Dm7/G');
	});

	it('distinguishes a diminished triad from a half-diminished seventh', () => {
		expect(text('Bdim')).toBe('B°');
		expect(text('Bm7b5')).toBe('Bø7');
	});

	it('handles double accidentals', () => {
		const parts = chordSymbolParts(parseChord('Bbb'));
		expect(partsToText(parts)).toBe('B𝄫');
	});

	it('puts the extension before the suspension', () => {
		expect(text('G7sus4')).toBe('G7sus4');
	});
});

describe('spoken labels', () => {
	it('says what the chord is', () => {
		expect(chordSymbolLabel(parseChord('Ebm7'))).toBe('E flat minor 7');
		expect(chordSymbolLabel(parseChord('F#7'))).toBe('F sharp dominant 7');
		expect(chordSymbolLabel(parseChord('Bm7b5'))).toBe('B half diminished 7');
		expect(chordSymbolLabel(parseChord('G7b9'))).toBe('G dominant 7 flat 9');
		expect(chordSymbolLabel(parseChord('G13'))).toBe('G dominant 13');
	});

	it('reads the bass of a slash chord', () => {
		expect(chordSymbolLabel(parseChord('C/E'))).toBe('C major over E');
	});
});
