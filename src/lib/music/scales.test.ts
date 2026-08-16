import { describe, expect, it } from 'vitest';
import { formatNote, parseNote, pitchClass } from './note';
import { EXTRA_IDS, intervalsFor, scaleNotes, type ScaleId } from './scales';

const spell = (root: string, id: ScaleId) =>
	scaleNotes(parseNote(root), id).map((note) => formatNote(note));

const semitones = (root: string, id: ScaleId) =>
	scaleNotes(parseNote(root), id).map((note) => pitchClass(note));

describe('the modes come from the key module, not a second copy', () => {
	it('spells a major scale', () => {
		expect(spell('C', 'ionian')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
	});

	it('keeps the awkward spellings that make this app worth using', () => {
		// The fourth degree of G♭ is some kind of C, so it is C♭ and not B.
		expect(spell('Gb', 'ionian')).toContain('Cb');
		expect(spell('B', 'ionian')).toContain('A#');
	});
});

describe('the altered scale', () => {
	it('has a diminished fourth, not a major third', () => {
		// It is the seventh mode of melodic minor: the degree a third above the
		// root is still a kind of third, which is what puts F♭ in C altered.
		expect(spell('C', 'altered')).toEqual(['C', 'Db', 'Eb', 'Fb', 'Gb', 'Ab', 'Bb']);
	});

	it('sounds the notes everyone actually plays over an altered dominant', () => {
		// ♭9, ♯9, 3, ♯11, ♭13, ♭7 — the same seven semitones whatever they are called.
		expect(semitones('C', 'altered').sort((a, b) => a - b)).toEqual([0, 1, 3, 4, 6, 8, 10]);
	});

	it('is the melodic minor a semitone above, note for note', () => {
		expect(semitones('C', 'altered').sort((a, b) => a - b)).toEqual(
			semitones('Db', 'melodicMinor').sort((a, b) => a - b)
		);
	});
});

describe('the other scales a chord symbol asks for', () => {
	it('gives a Lydian dominant its sharp eleven and flat seven', () => {
		expect(spell('C', 'lydianDominant')).toEqual(['C', 'D', 'E', 'F#', 'G', 'A', 'Bb']);
	});

	it('gives Locrian natural 2 a natural ninth', () => {
		expect(spell('C', 'locrianNatural2')).toEqual(['C', 'D', 'Eb', 'F', 'Gb', 'Ab', 'Bb']);
	});

	it('gives Phrygian dominant its major third over a flat ninth', () => {
		expect(spell('C', 'phrygianDominant')).toEqual(['C', 'Db', 'E', 'F', 'G', 'Ab', 'Bb']);
	});

	it('spells the whole-tone scale upwards rather than wrapping a letter', () => {
		expect(spell('C', 'wholeTone')).toEqual(['C', 'D', 'E', 'F#', 'G#', 'A#']);
	});

	it('gives the diminished scale eight notes', () => {
		// Eight degrees and seven letters: something has to double up, and A is
		// the plain enharmonic of the B𝄫 the intervals produce.
		expect(spell('C', 'wholeHalfDiminished')).toEqual(['C', 'D', 'Eb', 'F', 'Gb', 'Ab', 'A', 'B']);
	});

	it('makes "C blues" the six-note minor blues scale', () => {
		expect(semitones('C', 'blues')).toEqual([0, 3, 5, 6, 7, 10]);
	});

	it('gives a major pentatonic five notes and no fourth', () => {
		expect(spell('C', 'majorPentatonic')).toEqual(['C', 'D', 'E', 'G', 'A']);
	});
});

describe('every scale, in every key', () => {
	const ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
	const ALL: ScaleId[] = [
		'ionian',
		'dorian',
		'phrygian',
		'lydian',
		'mixolydian',
		'aeolian',
		'locrian',
		'harmonicMinor',
		'melodicMinor',
		...EXTRA_IDS
	];

	it('starts on the root it was given', () => {
		for (const id of ALL) {
			for (const root of ROOTS) {
				expect(formatNote(scaleNotes(parseNote(root), id)[0])).toBe(root);
			}
		}
	});

	it('never names the same key twice', () => {
		for (const id of ALL) {
			for (const root of ROOTS) {
				const pcs = semitones(root, id);
				expect(new Set(pcs).size, `${root} ${id}`).toBe(pcs.length);
			}
		}
	});

	it('rises without ever turning back on itself', () => {
		for (const id of ALL) {
			for (const root of ROOTS) {
				const steps = intervalsFor(id).map((interval) => interval.semitones);
				for (let i = 1; i < steps.length; i++) {
					expect(steps[i], `${root} ${id}`).toBeGreaterThan(steps[i - 1]);
				}
			}
		}
	});

	it('stays inside the octave it started in', () => {
		for (const id of ALL) {
			const last = intervalsFor(id).at(-1);
			expect(last?.semitones, id).toBeLessThan(12);
		}
	});

	/*
	 * The one place this app relaxes its spelling rule. A double flat is
	 * correct and unreadable, and these diagrams exist to be read.
	 */
	it('never puts a double accidental on a diagram', () => {
		for (const id of ALL) {
			for (const root of ROOTS) {
				for (const note of scaleNotes(parseNote(root), id)) {
					expect(Math.abs(note.alter), `${root} ${id}: ${formatNote(note)}`).toBeLessThan(2);
				}
			}
		}
	});

	it('keeps single accidentals exactly as the intervals made them', () => {
		// C♭ survives, because one letter per degree still holds here.
		expect(spell('Gb', 'ionian')).toEqual(['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
	});

	it('respells without moving the note', () => {
		// D♭ diminished is where it used to reach A𝄫 B𝄫 C𝄫; the pitches are
		// unchanged, only the names are.
		expect(semitones('Db', 'wholeHalfDiminished')).toEqual([1, 3, 4, 6, 7, 9, 10, 0]);
		expect(spell('Db', 'wholeHalfDiminished')).toEqual([
			'Db',
			'Eb',
			'Fb',
			'Gb',
			'G',
			'A',
			'Bb',
			'C'
		]);
	});
});
