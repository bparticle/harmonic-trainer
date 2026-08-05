/**
 * Notes are spelled, never numbered.
 *
 * A note is a letter, an alteration and an octave. Pitch class and MIDI number
 * are *derived* from that — never the reverse. This is the single most load-
 * bearing decision in the music core: the moment a note becomes an integer, the
 * information that distinguishes A♭ from G♯ is gone, and no amount of cleverness
 * downstream gets it back. In E♭ major the fourth degree is A♭. In B major the
 * sharpened fourth is E♯, not F.
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type Note = {
	letter: Letter;
	/** -2 double flat … +2 double sharp. */
	alter: number;
	octave: number;
};

/** 0–11, C natural = 0. */
export type PitchClass = number;

export const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Semitones above C for each natural letter. */
export const LETTER_SEMITONES: Record<Letter, number> = {
	C: 0,
	D: 2,
	E: 4,
	F: 5,
	G: 7,
	A: 9,
	B: 11
};

/** Diatonic step index, 0–6. This is what makes spelling arithmetic work. */
export const LETTER_STEPS: Record<Letter, number> = {
	C: 0,
	D: 1,
	E: 2,
	F: 3,
	G: 4,
	A: 5,
	B: 6
};

export function note(letter: Letter, alter = 0, octave = 4): Note {
	return { letter, alter, octave };
}

/** MIDI note number. C4 = 60, following scientific pitch notation. */
export function midi(n: Note): number {
	return (n.octave + 1) * 12 + LETTER_SEMITONES[n.letter] + n.alter;
}

/**
 * 0–11. Note that C♭4 and B3 share a pitch class but are different notes, and
 * that is the entire point of keeping them distinct everywhere else.
 */
export function pitchClass(n: Note): PitchClass {
	return (((LETTER_SEMITONES[n.letter] + n.alter) % 12) + 12) % 12;
}

/** True when two notes sound the same, regardless of how they are spelled. */
export function isEnharmonic(a: Note, b: Note): boolean {
	return midi(a) === midi(b);
}

/** True when two notes are spelled identically. */
export function isSameNote(a: Note, b: Note): boolean {
	return a.letter === b.letter && a.alter === b.alter && a.octave === b.octave;
}

const ASCII_ACCIDENTALS: Record<number, string> = {
	[-2]: 'bb',
	[-1]: 'b',
	0: '',
	1: '#',
	2: '##'
};

const UNICODE_ACCIDENTALS: Record<number, string> = {
	[-2]: '𝄫',
	[-1]: '♭',
	0: '',
	1: '♯',
	2: '𝄪'
};

export type FormatOptions = {
	/** Use ♭ and ♯ instead of b and #. Display code wants this; fixtures do not. */
	unicode?: boolean;
	/** Include the octave number. */
	octave?: boolean;
};

export function formatNote(n: Note, options: FormatOptions = {}): string {
	const table = options.unicode ? UNICODE_ACCIDENTALS : ASCII_ACCIDENTALS;
	const accidental = table[n.alter] ?? (n.alter > 0 ? '#'.repeat(n.alter) : 'b'.repeat(-n.alter));
	return `${n.letter}${accidental}${options.octave ? n.octave : ''}`;
}

/** Letter + accidental only, no octave. What chord symbols and wheel cells use. */
export function formatPitch(n: Note, unicode = false): string {
	return formatNote(n, { unicode });
}

const NOTE_PATTERN = /^([A-Ga-g])(bb|##|[b#♭♯𝄫𝄪x]?)(-?\d+)?$/;

/**
 * Parse a note name. Accepts ASCII (`Eb4`, `F#`) and unicode (`E♭4`), with or
 * without an octave — a bare `Eb` defaults to octave 4, which is what chord
 * symbols and scale definitions want.
 */
export function parseNote(text: string, defaultOctave = 4): Note {
	const match = NOTE_PATTERN.exec(text.trim());
	if (!match) throw new Error(`Not a note: ${text}`);

	const [, rawLetter, rawAccidental, rawOctave] = match;
	const letter = rawLetter.toUpperCase() as Letter;

	const alter =
		{
			'': 0,
			b: -1,
			'♭': -1,
			bb: -2,
			'𝄫': -2,
			'#': 1,
			'♯': 1,
			'##': 2,
			x: 2,
			'𝄪': 2
		}[rawAccidental] ?? 0;

	return { letter, alter, octave: rawOctave === undefined ? defaultOctave : Number(rawOctave) };
}
