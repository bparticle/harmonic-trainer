import { between, ivl, transpose } from './interval';
import { LETTERS, LETTER_SEMITONES, type Letter, type Note } from './note';
import { pitchClass } from './note';
import { prefersFlats, scale, type Key } from './key';

/**
 * The spelling resolver. Every pitch class that reaches the UI goes through
 * here, because a pitch class on its own does not know whether it is A♭ or G♯,
 * and guessing wrong is the bug that poisons the whole app.
 *
 * Resolution order:
 *   1. An explicit harmonic function wins. The ♯11 of D7 is G♯, full stop,
 *      even though the key of D has no G♯ in it.
 *   2. Otherwise, if the pitch class is in the key, use the key's own spelling.
 *      In E♭ major the fourth degree is A♭, never G♯.
 *   3. Otherwise fall back to the key's accidental direction — sharp keys get
 *      sharps, flat keys get flats.
 */

export type HarmonicFunction =
	/** Spell as a named interval above a root: the ♯11 of D is G♯. */
	| { kind: 'interval'; root: Note; interval: string }
	/** Nudge an out-of-key note one way or the other. */
	| { kind: 'direction'; prefer: 'sharp' | 'flat' };

/**
 * Choose a spelling for a pitch class.
 *
 * `octave` only sets the returned note's octave; it never affects the letter or
 * the accidental.
 */
export function spell(
	pc: number,
	context: Key,
	harmonicFunction?: HarmonicFunction,
	octave = 4
): Note {
	const target = ((pc % 12) + 12) % 12;

	if (harmonicFunction?.kind === 'interval') {
		const spelled = transpose(harmonicFunction.root, ivl(harmonicFunction.interval));
		if (pitchClass(spelled) === target) return { ...spelled, octave };
		// The caller's hint disagrees with the pitch class they passed. Trust the
		// pitch class — it is the sounding note — and fall through.
	}

	const inKey = scale(context).find((n) => pitchClass(n) === target);
	if (inKey) return { ...inKey, octave };

	if (harmonicFunction?.kind !== 'direction') {
		/*
		 * The tritone above the tonic is the raised fourth, not the flattened
		 * fifth — F♯ in C, A in E♭ — because it overwhelmingly functions as a
		 * leading tone up to the fifth. This is the one chromatic note that does
		 * not follow the key's accidental direction, and getting it wrong is why
		 * naive spellers write G♭dim7 where every chart says F♯dim7.
		 */
		const raisedFourth = transpose(context.tonic, ivl('A4'));
		if (pitchClass(raisedFourth) === target) return { ...raisedFourth, octave };
	}

	const prefer =
		harmonicFunction?.kind === 'direction'
			? harmonicFunction.prefer
			: prefersFlats(context)
				? 'flat'
				: 'sharp';

	return { ...spellChromatic(target, prefer), octave };
}

/**
 * Spell a pitch class as a simple sharp or flat, preferring a single accidental
 * and never inventing a double one.
 */
export function spellChromatic(pc: number, prefer: 'sharp' | 'flat'): Note {
	const target = ((pc % 12) + 12) % 12;

	// Natural first — a natural spelling is always better than an altered one.
	for (const letter of LETTERS) {
		if (LETTER_SEMITONES[letter] === target) return { letter, alter: 0, octave: 4 };
	}

	const alter = prefer === 'flat' ? -1 : 1;
	for (const letter of LETTERS) {
		if ((((LETTER_SEMITONES[letter] + alter) % 12) + 12) % 12 === target) {
			return { letter, alter, octave: 4 };
		}
	}

	throw new Error(`Cannot spell pitch class ${pc}`);
}

/**
 * Spell a whole set of pitch classes against a key, keeping one letter per note
 * where possible.
 *
 * Used for scales and voicings, where spelling each note independently can
 * produce two notes on the same letter (F and F♯ side by side) even though every
 * individual choice looked right.
 */
export function spellSet(pcs: number[], context: Key, octave = 4): Note[] {
	const spelled = pcs.map((pc) => spell(pc, context, undefined, octave));
	const usedLetters = new Map<Letter, number>();
	for (const n of spelled) usedLetters.set(n.letter, (usedLetters.get(n.letter) ?? 0) + 1);

	const duplicated = [...usedLetters.entries()].filter(([, count]) => count > 1);
	if (duplicated.length === 0) return spelled;

	// Re-spell the altered member of each clashing pair in the other direction,
	// which moves it onto a free letter.
	const opposite = prefersFlats(context) ? 'sharp' : 'flat';
	return spelled.map((n) => {
		if (n.alter === 0) return n;
		if ((usedLetters.get(n.letter) ?? 0) < 2) return n;
		const alternative = spellChromatic(pitchClass(n), opposite);
		return (usedLetters.get(alternative.letter) ?? 0) === 0 ? { ...alternative, octave } : n;
	});
}

/**
 * Degree of a note within a key, as a number and an alteration: the ♭3 of C is
 * `{ degree: 3, alter: -1 }`. This is the label the app shows instead of note
 * names when teaching a shape.
 */
export function scaleDegree(n: Note, context: Key): { degree: number; alter: number } {
	const interval = between(context.tonic, n);
	const steps = ((interval.steps % 7) + 7) % 7;
	const semitones = ((interval.semitones % 12) + 12) % 12;
	const natural = [0, 2, 4, 5, 7, 9, 11][steps];
	let alter = semitones - natural;
	if (alter > 6) alter -= 12;
	if (alter < -6) alter += 12;
	return { degree: steps + 1, alter };
}

const DEGREE_ACCIDENTAL: Record<number, string> = {
	[-2]: 'bb',
	[-1]: 'b',
	0: '',
	1: '#',
	2: '##'
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function degreeAccidental(alter: number, unicode: boolean): string {
	const accidental = DEGREE_ACCIDENTAL[alter] ?? '';
	return unicode ? accidental.replace(/b/g, '♭').replace(/#/g, '♯') : accidental;
}

export function formatDegree(d: { degree: number; alter: number }, unicode = false): string {
	return `${degreeAccidental(d.alter, unicode)}${d.degree}`;
}

/**
 * The same degree as a Roman numeral: the ♭3 of C is `bIII`.
 *
 * Always uppercase. Case means chord quality everywhere else in this app — `ii`
 * is a minor chord — and the callers that mean a chord lowercase it themselves;
 * a numeral standing for a single note is claiming no quality at all.
 */
export function formatRomanDegree(d: { degree: number; alter: number }, unicode = false): string {
	return `${degreeAccidental(d.alter, unicode)}${ROMAN[d.degree - 1] ?? d.degree}`;
}
