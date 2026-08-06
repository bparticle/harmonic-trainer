import {
	chordPitchClasses,
	closeVoicing,
	diatonicTriad,
	formatChord,
	shellVoicing,
	type AbstractChord
} from '$lib/music/chord';
import { ivl, transpose } from '$lib/music/interval';
import { key as makeKey, scale, type Key } from '$lib/music/key';
import { midi, pitchClass, type Note } from '$lib/music/note';
import { spell } from '$lib/music/spell';

/**
 * Chord progressions, as their own thing.
 *
 * These used to be rungs on the key ladder, which muddled two different jobs:
 * learning what is in a key, and learning how chords move within it. Separating
 * them means a progression can be practised in whatever key you already know,
 * and can get harder without the key getting harder at the same time.
 *
 * Everything is written in Roman numerals and resolved into a key at the last
 * moment, so one definition covers all twelve.
 */

export type ProgressionLevel = 1 | 2 | 3 | 4 | 5;

export type Progression = {
	id: string;
	name: string;
	level: ProgressionLevel;
	mode: 'major' | 'minor';
	numerals: string[];
	/** What it is and where the ear already knows it from. */
	describes: string;
	/** What to notice while playing it. */
	listenFor: string;
};

export const PROGRESSION_LEVELS: Record<ProgressionLevel, string> = {
	1: 'First progressions',
	2: 'Turnarounds',
	3: 'The jazz cadence',
	4: 'Blues',
	5: 'Colour and substitution'
};

export const PROGRESSIONS: Progression[] = [
	{
		id: 'I-IV-V-I',
		name: 'I – IV – V – I',
		level: 1,
		mode: 'major',
		numerals: ['I', 'IV', 'V', 'I'],
		describes: 'The three main chords, in the order that makes a full stop.',
		listenFor: 'The V wants to go home. Notice how much.'
	},
	{
		id: 'I-V-vi-IV',
		name: 'I – V – vi – IV',
		level: 1,
		mode: 'major',
		numerals: ['I', 'V', 'vi', 'IV'],
		describes: 'Four chords that carry an enormous amount of popular music.',
		listenFor: 'The vi is the same three notes as the I, moved by one step.'
	},
	{
		id: 'i-iv-v-i',
		name: 'i – iv – v – i',
		level: 1,
		mode: 'minor',
		numerals: ['i', 'iv', 'v', 'i'],
		describes: 'The same shape in minor. No new notes, a completely different mood.',
		listenFor: 'The v is minor here, so the ending is softer than in major.'
	},
	{
		id: 'I-vi-ii-V',
		name: 'I – vi – ii – V',
		level: 2,
		mode: 'major',
		numerals: ['I', 'vi', 'ii', 'V'],
		describes: 'The turnaround: the four bars that send you back to the beginning.',
		listenFor: 'Each root falls by a fourth or a third. The bass is walking.'
	},
	{
		id: 'vi-ii-V-I',
		name: 'vi – ii – V – I',
		level: 2,
		mode: 'major',
		numerals: ['vi', 'ii', 'V', 'I'],
		describes: 'The same four chords starting one place later, so it arrives instead of leaving.',
		listenFor: 'Roots falling in fifths all the way home.'
	},
	{
		id: 'ii-V-I',
		name: 'ii7 – V7 – Imaj7',
		level: 3,
		mode: 'major',
		numerals: ['ii7', 'V7', 'Imaj7'],
		describes: 'The most common three chords in jazz, and the reason sevenths are worth learning.',
		listenFor: 'Two notes do all the work: the third and seventh swap roles each time.'
	},
	{
		id: 'ii-V-i-minor',
		name: 'iiø7 – V7 – i7',
		level: 3,
		mode: 'minor',
		numerals: ['iiø7', 'V7', 'i7'],
		describes: 'The minor version. The ii is half-diminished and the V borrows a major third.',
		listenFor: 'The V has a note from outside the key. That is what makes it pull.'
	},
	{
		id: 'blues-basic',
		name: 'Twelve-bar blues',
		level: 4,
		mode: 'major',
		numerals: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'],
		describes: 'Three chords, twelve bars, and most of the twentieth century.',
		listenFor: 'Every chord is a dominant seventh. In no key is that "correct", and it works.'
	},
	{
		id: 'blues-quick',
		name: 'Blues with a quick change',
		level: 4,
		mode: 'major',
		numerals: ['I7', 'IV7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'ii7', 'V7', 'I7', 'V7'],
		describes: 'The same twelve bars, with the IV arriving early and a ii–V at the end.',
		listenFor: 'Bar two, and then the turnaround. Everything else is unchanged.'
	},
	{
		id: 'secondary-dominant',
		name: 'I – V7/vi – vi – V',
		level: 5,
		mode: 'major',
		numerals: ['I', 'V7/vi', 'vi', 'V'],
		describes: 'Giving the vi chord its own dominant, so it arrives like a destination.',
		listenFor: 'One note from outside the key, and the vi suddenly means more.'
	},
	{
		id: 'borrowed-four',
		name: 'I – IV – iv – I',
		level: 5,
		mode: 'major',
		numerals: ['I', 'IV', 'iv', 'I'],
		describes: 'The major four turning minor on its way home. One note moves.',
		listenFor: 'The moment of sweetness. It is a single semitone.'
	},
	{
		id: 'tritone-sub',
		name: 'ii7 – ♭II7 – Imaj7',
		level: 5,
		mode: 'major',
		numerals: ['ii7', 'bII7', 'Imaj7'],
		describes: 'The V replaced by the chord a tritone away. The bass now walks down in semitones.',
		listenFor: 'The guide tones barely move. Only the bass changed.'
	},
	{
		id: 'backdoor',
		name: 'iv – ♭VII7 – Imaj7',
		level: 5,
		mode: 'major',
		numerals: ['iv', 'bVII7', 'Imaj7'],
		describes: 'Arriving at the tonic from below instead of above.',
		listenFor: 'The pull is upwards. Everything else you play resolves downwards.'
	}
];

export function progressionById(id: string): Progression | undefined {
	return PROGRESSIONS.find((p) => p.id === id);
}

export function progressionsAtLevel(level: ProgressionLevel): Progression[] {
	return PROGRESSIONS.filter((p) => p.level === level);
}

// ---------------------------------------------------------------------------
// Roman numerals into real chords
// ---------------------------------------------------------------------------

const NUMERAL_VALUE: Record<string, number> = {
	I: 1,
	II: 2,
	III: 3,
	IV: 4,
	V: 5,
	VI: 6,
	VII: 7
};

const NUMERAL_PATTERN = /^([b#]?)([ivIV]+)(.*)$/;

/**
 * Turn a Roman numeral into a real chord in a key.
 *
 * Handles the diatonic cases, chromatic roots (♭II, ♭VII), quality suffixes
 * (7, maj7, ø7, °) and applied dominants (V7/vi). Case carries the quality, as
 * it does on every chart: uppercase major, lowercase minor.
 */
export function chordFromNumeral(numeral: string, k: Key): AbstractChord {
	// Applied dominants: the dominant of whatever the target numeral resolves to.
	const slash = numeral.indexOf('/');
	if (slash > 0) {
		const target = chordFromNumeral(numeral.slice(slash + 1), k);
		return {
			root: transpose(target.root, ivl('P5')),
			quality: 'dom',
			extensions: [],
			alterations: []
		};
	}

	const match = NUMERAL_PATTERN.exec(numeral);
	if (!match) throw new Error(`Not a Roman numeral: ${numeral}`);
	const [, accidental, roman, suffix] = match;

	const degree = NUMERAL_VALUE[roman.toUpperCase()];
	if (!degree) throw new Error(`Not a Roman numeral: ${numeral}`);

	const isMinor = roman === roman.toLowerCase();
	const notes = scale(k);
	let root: Note = notes[degree - 1];

	if (accidental) {
		const shifted = pitchClass(root) + (accidental === 'b' ? -1 : 1);
		root = spell(((shifted % 12) + 12) % 12, k);
	}

	const has = (s: string) => suffix.includes(s);

	if (has('ø')) return chord(root, 'min7b5', [7]);
	if (has('°')) return chord(root, 'min7b5', []);
	if (has('maj7')) return chord(root, 'maj', [7]);
	if (has('7')) return isMinor ? chord(root, 'min', [7]) : chord(root, 'dom', []);
	if (has('6')) return chord(root, isMinor ? 'min6' : 'maj6', []);

	// No suffix: a plain triad, unless the key itself makes it diminished.
	if (!accidental && !isMinor) return chord(root, 'maj', []);
	if (!accidental && isMinor) {
		const diatonic = diatonicTriad(k, degree);
		return diatonic.quality === 'min7b5' ? diatonic : chord(root, 'min', []);
	}
	return chord(root, isMinor ? 'min' : 'maj', []);
}

function chord(
	root: Note,
	quality: AbstractChord['quality'],
	extensions: AbstractChord['extensions']
): AbstractChord {
	return { root, quality, extensions, alterations: [] };
}

export type ProgressionStep = {
	numeral: string;
	symbol: string;
	chord: AbstractChord;
	pitchClasses: number[];
	/** A close voicing, for playback and marking. */
	voicing: number[];
	/** Root, third and seventh, when the chord has them. */
	shell: number[] | null;
};

export type RealisedProgression = {
	id: string;
	name: string;
	level: ProgressionLevel;
	keyCenter: string;
	describes: string;
	listenFor: string;
	steps: ProgressionStep[];
};

/** Put a progression into a key. */
export function realiseProgression(progression: Progression, keyName: string): RealisedProgression {
	const k =
		progression.mode === 'minor'
			? makeKey(keyName.replace(/m$/, ''), 'aeolian')
			: makeKey(keyName);

	const steps: ProgressionStep[] = progression.numerals.map((numeral) => {
		const built = chordFromNumeral(numeral, k);
		let shell: number[] | null = null;
		try {
			shell = shellVoicing(built, '1-3-7', 3).map(midi);
		} catch {
			// Triads have no seventh to build a shell from. Not a problem.
		}
		return {
			numeral,
			symbol: formatChord(built),
			chord: built,
			pitchClasses: chordPitchClasses(built),
			voicing: closeVoicing(built, 3).map(midi),
			shell
		};
	});

	return {
		id: progression.id,
		name: progression.name,
		level: progression.level,
		keyCenter: keyName,
		describes: progression.describes,
		listenFor: progression.listenFor,
		steps
	};
}

/** Stable identity for a progression card. */
export function progressionIdentity(progressionId: string, keyName: string): string {
	return `progression|${keyName}|${progressionId}`;
}

