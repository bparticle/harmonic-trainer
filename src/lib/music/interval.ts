import { LETTERS, LETTER_SEMITONES, LETTER_STEPS, type Note } from './note';

/**
 * An interval is a *diatonic step count* plus a semitone count, not just a
 * number of semitones.
 *
 * That pairing is what preserves spelling under transposition. A♭ and G♯ are the
 * same semitone distance from C, but one is a minor sixth (5 steps) and the
 * other an augmented fifth (4 steps) — and transposing by one gives a different
 * letter than transposing by the other. Semitones alone cannot express that.
 */
export type Interval = {
	/** Diatonic steps: 0 = unison, 1 = second, 7 = octave, 8 = ninth. */
	steps: number;
	semitones: number;
};

/** Semitones spanned by each simple diatonic step, from the tonic. */
const STEP_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

const QUALITY_OFFSETS = {
	P: 0,
	M: 0,
	m: -1,
	d: -1,
	A: 1,
	dd: -2,
	AA: 2
} as const;

/** Steps that take perfect qualities (unison, fourth, fifth, octave). */
const PERFECT_STEPS = new Set([0, 3, 4]);

const NAME_PATTERN = /^(P|M|m|A{1,2}|d{1,2}|b|#)(\d+)$/;

/**
 * Build an interval from a name: `P5`, `M3`, `m7`, `A4`, `d5`, `M9`, `A11`.
 *
 * Also accepts the chord-symbol shorthand `b5`, `#11`, `b9`, `#9`, `b13`, since
 * that is how alterations are actually written and it avoids a translation layer
 * every time a chord is defined.
 */
export function ivl(name: string): Interval {
	const match = NAME_PATTERN.exec(name);
	if (!match) throw new Error(`Not an interval: ${name}`);

	const [, quality, rawNumber] = match;
	const number = Number(rawNumber);
	if (number < 1) throw new Error(`Not an interval: ${name}`);

	const steps = number - 1;
	const simpleStep = steps % 7;
	const octaves = Math.floor(steps / 7);
	const base = STEP_SEMITONES[simpleStep] + 12 * octaves;
	const perfect = PERFECT_STEPS.has(simpleStep);

	// Chord-symbol shorthand: b5 means a diminished fifth, #11 an augmented
	// eleventh. On a step that takes major/minor, b means minor.
	if (quality === 'b') return { steps, semitones: base - 1 };
	if (quality === '#') return { steps, semitones: base + 1 };

	if (perfect && (quality === 'M' || quality === 'm')) {
		throw new Error(`${name} is not a valid interval: step ${number} is perfect`);
	}
	if (!perfect && quality === 'P') {
		throw new Error(`${name} is not a valid interval: step ${number} is not perfect`);
	}

	// On a perfect step, "diminished" is one semitone below perfect. On a
	// major/minor step, it is one below *minor*, i.e. two below major.
	let offset: number = QUALITY_OFFSETS[quality as keyof typeof QUALITY_OFFSETS];
	if (!perfect && (quality === 'd' || quality === 'dd')) offset -= 1;

	return { steps, semitones: base + offset };
}

/** Interval between two notes, preserving the diatonic distance. */
export function between(from: Note, to: Note): Interval {
	const steps = LETTER_STEPS[to.letter] - LETTER_STEPS[from.letter] + 7 * (to.octave - from.octave);
	const semitones =
		LETTER_SEMITONES[to.letter] +
		to.alter +
		12 * to.octave -
		(LETTER_SEMITONES[from.letter] + from.alter + 12 * from.octave);
	return { steps, semitones };
}

/**
 * Transpose a note, keeping the spelling honest.
 *
 * The letter comes from the diatonic step count and the accidental is then
 * whatever it must be to land on the right semitone. That is why G♭ + P4 gives
 * C♭ rather than B: the fourth above G *is* some kind of C, and the accidental
 * follows.
 */
export function transpose(n: Note, interval: Interval): Note {
	const stepIndex = LETTER_STEPS[n.letter] + interval.steps;
	const octaveCarry = Math.floor(stepIndex / 7);
	const letter = LETTERS[((stepIndex % 7) + 7) % 7];

	const naturalSemitones = LETTER_SEMITONES[letter] + 12 * octaveCarry;
	const targetSemitones = LETTER_SEMITONES[n.letter] + n.alter + interval.semitones;

	return {
		letter,
		alter: targetSemitones - naturalSemitones,
		octave: n.octave + octaveCarry
	};
}

/** Reduce a compound interval to within an octave, keeping its quality. */
export function simplify(interval: Interval): Interval {
	const octaves = Math.floor(interval.steps / 7);
	return { steps: interval.steps - octaves * 7, semitones: interval.semitones - octaves * 12 };
}

export function intervalName(interval: Interval): string {
	const { steps, semitones } = interval;
	const simpleStep = steps % 7;
	const octaves = Math.floor(steps / 7);
	const base = STEP_SEMITONES[simpleStep] + 12 * octaves;
	const delta = semitones - base;
	const number = steps + 1;

	if (PERFECT_STEPS.has(simpleStep)) {
		if (delta === 0) return `P${number}`;
		if (delta === 1) return `A${number}`;
		if (delta === 2) return `AA${number}`;
		if (delta === -1) return `d${number}`;
		if (delta === -2) return `dd${number}`;
	} else {
		if (delta === 0) return `M${number}`;
		if (delta === -1) return `m${number}`;
		if (delta === 1) return `A${number}`;
		if (delta === 2) return `AA${number}`;
		if (delta === -2) return `d${number}`;
		if (delta === -3) return `dd${number}`;
	}

	throw new Error(`Cannot name interval: ${steps} steps, ${semitones} semitones`);
}

/**
 * Smallest distance in semitones between two pitch classes, 0–6.
 * Used for voice-leading measurements, where spelling is irrelevant.
 */
export function pitchClassDistance(a: number, b: number): number {
	const d = (((a - b) % 12) + 12) % 12;
	return Math.min(d, 12 - d);
}
