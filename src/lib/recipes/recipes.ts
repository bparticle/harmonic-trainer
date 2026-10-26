import {
	chordIntervals,
	chordNotes,
	degreeLabels,
	type AbstractChord,
	type ChordQuality,
	type Extension
} from '$lib/music/chord';
import { formatPitch, parseNote, pitchClass, type Note } from '$lib/music/note';

/**
 * Chord recipes.
 *
 * A recipe is what a chord is before it has a root: a stack of distances,
 * counted in half steps — one key to the very next, black or white. Major is
 * four half steps, then three; minor is three, then four.
 * Nothing else about the chord changes from one root to the next, which is the
 * single fact this whole line is built to make obvious — the colours move, the
 * shape does not.
 *
 * The distances are not stored. They are read out of the music core's own
 * intervals, so the shape on the card, the arcs over the keys and the notes the
 * page listens for all come from the one definition of each chord that the rest
 * of the app already trusts.
 */

export const RECIPE_IDS = [
	'major',
	'minor',
	'diminished',
	'augmented',
	'sus2',
	'sus4',
	'major7',
	'dominant7',
	'minor7',
	'halfDiminished',
	'diminished7'
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

const DEFINITIONS: Record<
	RecipeId,
	{ quality: ChordQuality; extensions: Extension[]; name: string }
> = {
	major: { quality: 'maj', extensions: [], name: 'major triad' },
	minor: { quality: 'min', extensions: [], name: 'minor triad' },
	// The music core has no plain diminished quality: a diminished triad is a
	// half-diminished chord with no seventh. See DECISIONS, M1.
	diminished: { quality: 'min7b5', extensions: [], name: 'diminished triad' },
	augmented: { quality: 'aug', extensions: [], name: 'augmented triad' },
	sus2: { quality: 'sus2', extensions: [], name: 'suspended second' },
	sus4: { quality: 'sus4', extensions: [], name: 'suspended fourth' },
	major7: { quality: 'maj', extensions: [7], name: 'major seventh' },
	dominant7: { quality: 'dom', extensions: [], name: 'dominant seventh' },
	minor7: { quality: 'min', extensions: [7], name: 'minor seventh' },
	halfDiminished: { quality: 'min7b5', extensions: [7], name: 'half-diminished seventh' },
	diminished7: { quality: 'dim7', extensions: [], name: 'diminished seventh' }
};

/**
 * What the chord is called in words, the way a teacher or a theory book says
 * it: `major triad`, `dominant seventh`. Always the standard name — the page
 * puts it beside the symbol so the two are learnt together.
 */
export function recipeName(id: RecipeId): string {
	return DEFINITIONS[id].name;
}

/**
 * Every degree a recipe uses, named as the interval it is above the root.
 *
 * These are the words the briefings and the feedback use, so a player who has
 * only ever seen `♭3` under a roundel also hears it called a minor third.
 */
const INTERVAL_NAMES: Record<string, string> = {
	'1': 'root',
	'2': 'major second',
	'♭3': 'minor third',
	'3': 'major third',
	'4': 'perfect fourth',
	'♭5': 'diminished fifth',
	'5': 'perfect fifth',
	'♯5': 'augmented fifth',
	'♭♭7': 'diminished seventh',
	'♭7': 'minor seventh',
	'7': 'major seventh'
};

export function intervalName(degree: string): string {
	return INTERVAL_NAMES[degree] ?? degree;
}

/**
 * A plain distance, by the number of half steps in it — what a hop on its own
 * asks for, before any chord is involved. The two steps keep their own names,
 * because that is what they are called at the keyboard; the rest are the
 * intervals the chords on this line are built from.
 */
const STEP_NAMES: Record<number, string> = {
	1: 'half step',
	2: 'whole step',
	3: 'minor third',
	4: 'major third',
	5: 'perfect fourth',
	7: 'perfect fifth'
};

export function stepName(halfSteps: number): string {
	return STEP_NAMES[halfSteps] ?? `${halfSteps} half steps`;
}

/** `1 half step`, `4 half steps`. */
export function halfSteps(count: number): string {
	return count === 1 ? '1 half step' : `${count} half steps`;
}

/** The chord a recipe makes on a root. The root's octave is kept. */
export function cook(id: RecipeId, root: Note | string): AbstractChord {
	const { quality, extensions } = DEFINITIONS[id];
	return {
		root: typeof root === 'string' ? parseNote(root, 3) : root,
		quality,
		extensions: [...extensions],
		alterations: []
	};
}

/**
 * One ingredient: a spelled note, how many half steps above the root it sits,
 * and what the chord calls it.
 */
export type Tone = { note: Note; offset: number; degree: string };

/** A chord as its ingredients, root first, in the octave its root was given in. */
export function tonesOf(chord: AbstractChord): Tone[] {
	const notes = chordNotes(chord, chord.root.octave);
	const degrees = degreeLabels(chord);
	return chordIntervals(chord).map((interval, i) => ({
		note: notes[i],
		offset: interval.semitones,
		degree: degrees[i].degree
	}));
}

/** The gaps between neighbouring ingredients, in half steps: `[4, 3]` for any major triad. */
export function gaps(tones: Tone[]): number[] {
	return tones.slice(1).map((tone, i) => tone.offset - tones[i].offset);
}

/**
 * Whether a spelling is one a person learning this would expect to read.
 *
 * E♯, B♯, F♭, C♭ and every double accidental are correct, and they are exactly
 * what the music core is for. They are also a second lesson, about spelling,
 * arriving in the middle of the first one, about distance. So the roots each
 * recipe is served on are chosen so that its notes never need them; the line
 * teaches the shape first and the spelling stays plain throughout.
 */
export function isPlain(note: Note): boolean {
	if (Math.abs(note.alter) > 1) return false;
	if (note.alter === 1 && (note.letter === 'E' || note.letter === 'B')) return false;
	if (note.alter === -1 && (note.letter === 'F' || note.letter === 'C')) return false;
	return true;
}

/**
 * Each key's spellings, the usual one first.
 *
 * Two lists because the usual spelling depends on the chord: E♭ major and C♯
 * minor, not D♯ major and D♭ minor. This is how the chords are written on every
 * chart this app reads, so it is the spelling worth meeting first.
 */
const MAJORISH_SPELLINGS = [
	['C'],
	['Db', 'C#'],
	['D'],
	['Eb', 'D#'],
	['E'],
	['F'],
	['F#', 'Gb'],
	['G'],
	['Ab', 'G#'],
	['A'],
	['Bb', 'A#'],
	['B']
];
const MINORISH_SPELLINGS = [
	['C'],
	['C#', 'Db'],
	['D'],
	['Eb', 'D#'],
	['E'],
	['F'],
	['F#', 'Gb'],
	['G'],
	['G#', 'Ab'],
	['A'],
	['Bb', 'A#'],
	['B']
];
const MINORISH = new Set<RecipeId>([
	'minor',
	'diminished',
	'minor7',
	'halfDiminished',
	'diminished7'
]);

/**
 * The roots a recipe is served on, in octave 3, C upwards: for each key, the
 * usual spelling, or the other one when the usual one would make a note of
 * the chord unplain. A key with no plain spelling is left out — D°7 needs a
 * C♭ whichever way D is written, so the diminished seventh is never served on
 * D.
 */
export function rootsFor(id: RecipeId): Note[] {
	const spellings = MINORISH.has(id) ? MINORISH_SPELLINGS : MAJORISH_SPELLINGS;
	return spellings.flatMap((options) => {
		for (const text of options) {
			const root = parseNote(text, 3);
			if (tonesOf(cook(id, root)).every((tone) => isPlain(tone.note))) return [root];
		}
		return [];
	});
}

/**
 * How hard a root makes a recipe look, 0–2.
 *
 * 0: every note a white key. 1: a white-key root with a black key in the
 * chord. 2: a black-key root. The line serves the easy ones first, so the first
 * thing a recipe teaches is its shape, and the black keys arrive once the shape
 * is already known.
 */
export function rootTier(id: RecipeId, root: Note): number {
	if (root.alter !== 0) return 2;
	return tonesOf(cook(id, root)).every((tone) => tone.note.alter === 0) ? 0 : 1;
}

/** `E♭`, for a label. */
export function noteLabel(note: Note): string {
	return formatPitch(note, true);
}
