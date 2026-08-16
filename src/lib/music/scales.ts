import { ivl, transpose, type Interval } from './interval';
import { scaleIntervals, type Mode } from './key';
import { LETTER_SEMITONES, pitchClass, type Note } from './note';
import { spellChromatic } from './spell';

/**
 * The scales the study panel names, as spelled notes.
 *
 * `study.ts` has always been able to *say* "G♭ Lydian dominant"; it could not
 * hand back the notes, because a suggestion was a pair of display strings and
 * nothing else. Drawing one on a keyboard needs the notes, and needs them
 * spelled — the whole question being asked of the diagram is which sharps and
 * which flats, and an app that answered it with a B where the scale has a C♭
 * would be teaching the wrong name for the right key.
 *
 * So these are built the way every other scale in this app is built: by
 * stacking spelled intervals from the root, never by picking semitones off a
 * chromatic list. The modes come straight from `key.ts` rather than being
 * written out again here.
 */

/**
 * The scales a chord symbol asks for by name that are not modes of the major,
 * harmonic minor or melodic minor scales as `Mode` lists them.
 */
export type ExtraScale =
	| 'altered'
	| 'lydianDominant'
	| 'locrianNatural2'
	| 'phrygianDominant'
	| 'wholeTone'
	| 'wholeHalfDiminished'
	| 'blues'
	| 'majorPentatonic';

export type ScaleId = Mode | ExtraScale;

/**
 * Interval patterns, as names, from the root.
 *
 * The awkward-looking spellings are the correct ones and are load-bearing.
 * Altered has a *diminished fourth* rather than a major third, because it is
 * the seventh mode of melodic minor and its third degree above the root is
 * some kind of third — which is what puts an F♭ in C altered rather than an E.
 * Likewise the diminished seventh in the whole-half diminished scale: it is
 * the scale of a diminished seventh chord, and that chord's seventh is
 * diminished.
 */
const EXTRA_INTERVALS: Record<ExtraScale, string[]> = {
	/** Seventh mode of melodic minor. Every tension a dominant has, at once. */
	altered: ['P1', 'm2', 'm3', 'd4', 'd5', 'm6', 'm7'],
	/** Fourth mode of melodic minor: a dominant with a ♯11. */
	lydianDominant: ['P1', 'M2', 'M3', 'A4', 'P5', 'M6', 'm7'],
	/** Sixth mode of melodic minor: half-diminished with a natural ninth. */
	locrianNatural2: ['P1', 'M2', 'm3', 'P4', 'd5', 'm6', 'm7'],
	/** Fifth mode of harmonic minor: the V of a minor key, heard from its root. */
	phrygianDominant: ['P1', 'm2', 'M3', 'P4', 'P5', 'm6', 'm7'],
	wholeTone: ['P1', 'M2', 'M3', 'A4', 'A5', 'A6'],
	wholeHalfDiminished: ['P1', 'M2', 'm3', 'P4', 'd5', 'm6', 'd7', 'M7'],
	/** The six-note minor blues scale, which is what "C blues" means on a stand. */
	blues: ['P1', 'm3', 'P4', 'd5', 'P5', 'm7'],
	majorPentatonic: ['P1', 'M2', 'M3', 'P5', 'M6']
};

/** Every non-modal scale, so a test can walk the lot without listing them again. */
export const EXTRA_IDS = Object.keys(EXTRA_INTERVALS) as ExtraScale[];

const isExtra = (id: ScaleId): id is ExtraScale => id in EXTRA_INTERVALS;

export function intervalsFor(id: ScaleId): Interval[] {
	return isExtra(id) ? EXTRA_INTERVALS[id].map(ivl) : scaleIntervals(id);
}

/**
 * Respell anything that has ended up needing a double accidental.
 *
 * This app spells by stacking intervals and stands by the awkward results —
 * G♭ major really does have a C♭ in it. That rule rests on one letter per
 * degree, and the scales here are where that assumption runs out: the
 * diminished scale has eight degrees and there are only seven letters, and the
 * altered scale's diminished fourth compounds every flat already in the root.
 * Spelled strictly, D♭ whole-half diminished comes out as
 * `D♭ E♭ F♭ G♭ A𝄫 B𝄫 C𝄫 C`, which is correct, and which nobody has ever
 * written on a chart or wanted to read off a diagram.
 *
 * So double accidentals — and only double accidentals — are traded for the
 * plain enharmonic, leaning the way the note was already leaning. Single
 * accidentals are left exactly as the intervals produced them, C♭ included.
 */
function readable(note: Note): Note {
	if (Math.abs(note.alter) < 2) return note;

	const sounding = LETTER_SEMITONES[note.letter] + note.alter + 12 * note.octave;
	const simple = spellChromatic(pitchClass(note), note.alter < 0 ? 'flat' : 'sharp');
	// The two spellings are the same pitch, so this division is always exact.
	const octave = (sounding - LETTER_SEMITONES[simple.letter] - simple.alter) / 12;
	return { ...simple, octave };
}

/**
 * The spelled notes of a scale, starting on its root.
 *
 * Length varies by scale and that is the point: five for a pentatonic, six for
 * the blues and the whole-tone scale, eight for whole-half diminished. Nothing
 * here pads them out to seven.
 */
export function scaleNotes(root: Note, id: ScaleId): Note[] {
	return intervalsFor(id).map((interval) => readable(transpose(root, interval)));
}
