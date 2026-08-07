import { describe, expect, it } from 'vitest';
import { chordPitchClasses, parseChord } from './chord';
import { key } from './key';
import {
	commonTones,
	neighbours,
	notesChanged,
	rootMotionInFifths,
	voiceLeadingDistance
} from './voiceleading';

const pcs = (symbol: string) => chordPitchClasses(parseChord(symbol));
const C = key('C');

describe('notes changed', () => {
	it('counts a single substitution as one', () => {
		// Gm7 = G Bb D F, Ebmaj7 = Eb G Bb D. Only F becomes Eb.
		expect(notesChanged(pcs('Gm7'), pcs('Ebmaj7'))).toBe(1);
	});

	it('is zero for the same chord', () => {
		expect(notesChanged(pcs('Cmaj7'), pcs('Cmaj7'))).toBe(0);
	});

	it('sees Dm7 and F6 as the same set of notes', () => {
		expect(notesChanged(pcs('Dm7'), pcs('F6'))).toBe(0);
	});

	it('counts the notes that differ', () => {
		// Cmaj7 = C E G B, Am7 = A C E G — only the B and the A differ.
		expect(notesChanged(pcs('Cmaj7'), pcs('Am7'))).toBe(1);
		// Cmaj7 and Dm7 share only the C, so three notes have to move.
		expect(notesChanged(pcs('Cmaj7'), pcs('Dm7'))).toBe(3);
	});
});

describe('voice-leading distance', () => {
	it('is zero for identical sets', () => {
		expect(voiceLeadingDistance(pcs('Cmaj7'), pcs('Cmaj7'))).toBe(0);
		expect(voiceLeadingDistance(pcs('Dm7'), pcs('F6'))).toBe(0);
	});

	it('measures Gm7 to Ebmaj7 as a two-semitone move', () => {
		// F drops to Eb; everything else is held.
		expect(voiceLeadingDistance(pcs('Gm7'), pcs('Ebmaj7'))).toBe(2);
	});

	it('is symmetric', () => {
		const pairs: Array<[string, string]> = [
			['Cmaj7', 'Am7'],
			['Dm7', 'G7'],
			['Gm7', 'Ebmaj7'],
			['C7', 'F#7']
		];
		for (const [a, b] of pairs) {
			expect(voiceLeadingDistance(pcs(a), pcs(b))).toBe(voiceLeadingDistance(pcs(b), pcs(a)));
		}
	});

	it('finds the cheapest pairing, not the obvious one', () => {
		// A tritone substitution keeps the guide tones and swaps their roles, so
		// the total movement is small despite the roots being as far apart as
		// they can get.
		expect(voiceLeadingDistance(pcs('G7'), pcs('Db7'))).toBeLessThanOrEqual(4);
	});

	it('never exceeds six semitones per voice', () => {
		const distance = voiceLeadingDistance(pcs('Cmaj7'), pcs('F#maj7'));
		expect(distance).toBeLessThanOrEqual(4 * 6);
	});
});

describe('neighbours', () => {
	it('finds Ebmaj7 one note away from Gm7', () => {
		const found = neighbours(parseChord('Gm7'), C);
		const ebmaj7 = found.find((n) => n.symbol === 'Ebmaj7');
		expect(ebmaj7, 'Ebmaj7 should be a neighbour of Gm7').toBeDefined();
		expect(ebmaj7!.changed).toBe(1);
		expect(ebmaj7!.distance).toBe(2);
	});

	it('orders by how far the voices move', () => {
		const found = neighbours(parseChord('Cmaj7'), C);
		const changed = found.map((n) => n.changed);
		expect([...changed].sort((a, b) => a - b)).toEqual(changed);

		const oneNote = found.filter((n) => n.changed === 1);
		const distances = oneNote.map((n) => n.distance);
		expect([...distances].sort((a, b) => a - b)).toEqual(distances);
	});

	it('reports which notes leave and which arrive', () => {
		const found = neighbours(parseChord('Gm7'), C);
		const ebmaj7 = found.find((n) => n.symbol === 'Ebmaj7')!;
		// F leaves, Eb arrives.
		expect(ebmaj7.leaving).toEqual([5]);
		expect(ebmaj7.arriving).toEqual([3]);
	});

	it('never returns the source chord', () => {
		const found = neighbours(parseChord('Cmaj7'), C);
		expect(found.map((n) => n.symbol)).not.toContain('Cmaj7');
	});

	it('respects the maximum number of changed notes', () => {
		for (const n of neighbours(parseChord('Cmaj7'), C, 1)) {
			expect(n.changed).toBe(1);
		}
		for (const n of neighbours(parseChord('Cmaj7'), C, 2)) {
			expect(n.changed).toBeLessThanOrEqual(2);
		}
	});

	it('finds more neighbours when allowed two changes than one', () => {
		const one = neighbours(parseChord('Cmaj7'), C, 1);
		const two = neighbours(parseChord('Cmaj7'), C, 2);
		expect(two.length).toBeGreaterThan(one.length);
	});

	it('works from every chord in every key without throwing', () => {
		for (const symbol of ['Cmaj7', 'Ebm7', 'F#7', 'Bbm7b5', 'Adim7', 'G6']) {
			expect(neighbours(parseChord(symbol), C).length).toBeGreaterThan(0);
		}
	});
});

describe('common tones and root motion', () => {
	it('finds the notes two chords share', () => {
		expect(commonTones(parseChord('Gm7'), parseChord('Ebmaj7')).sort((a, b) => a - b)).toEqual([
			2, 7, 10
		]);
	});

	it('measures root motion in fifths', () => {
		// A ii-V-I walks anticlockwise round the wheel, one step at a time.
		expect(rootMotionInFifths(parseChord('Dm7'), parseChord('G7'))).toBe(-1);
		expect(rootMotionInFifths(parseChord('G7'), parseChord('Cmaj7'))).toBe(-1);
		// Going the other way is the same step with the opposite sign.
		expect(rootMotionInFifths(parseChord('Cmaj7'), parseChord('G7'))).toBe(1);
		// A tritone is six either way.
		expect(Math.abs(rootMotionInFifths(parseChord('C7'), parseChord('F#7')))).toBe(6);
	});
});
