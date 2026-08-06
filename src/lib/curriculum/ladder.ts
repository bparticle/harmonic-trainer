import { chordPitchClasses, closeVoicing, diatonicSeventh, diatonicTriad, formatChord } from '$lib/music/chord';
import { formatKey, key as makeKey, scale, type Key } from '$lib/music/key';
import { formatNote, midi, pitchClass } from '$lib/music/note';
import type { CardDirection } from '$lib/server/db/schema';

/**
 * The journey through the keys.
 *
 * One key at a time, in the order a musician actually meets them: C first, then
 * one accidental at a time, alternating sharp and flat sides of the circle.
 * Nothing is assumed — the first rung of the first key is "play these seven
 * notes", and everything else is built on top of that.
 *
 * This replaced a model that generated every card in every key at once and let
 * the scheduler choose. That produced sessions full of material nobody had ever
 * been shown, in keys nobody had ever played, which is a good way to make
 * someone feel stupid about an instrument they can already play.
 *
 * Progress is *suggested*, never enforced: the ladder says when a rung looks
 * solid, and you decide when to move on.
 */

export type Stage = {
	/** Major key, as stored. */
	key: string;
	/** Its relative minor. */
	relativeMinor: string;
	/** Signed: positive sharps, negative flats. */
	accidentals: number;
	/** How it is described the first time you meet it. */
	note: string;
};

/**
 * The circle of fifths, opened outwards from C.
 *
 * Each step adds exactly one accidental, alternating sides, which is how the
 * keys have been taught for about three hundred years and is a great deal
 * gentler than jumping to B because a scheduler noticed it was cold.
 */
export const STAGES: Stage[] = [
	{ key: 'C', relativeMinor: 'Am', accidentals: 0, note: 'No sharps, no flats. All white keys.' },
	{ key: 'G', relativeMinor: 'Em', accidentals: 1, note: 'One sharp: F♯.' },
	{ key: 'F', relativeMinor: 'Dm', accidentals: -1, note: 'One flat: B♭.' },
	{ key: 'D', relativeMinor: 'Bm', accidentals: 2, note: 'Two sharps: F♯ and C♯.' },
	{ key: 'Bb', relativeMinor: 'Gm', accidentals: -2, note: 'Two flats: B♭ and E♭.' },
	{ key: 'A', relativeMinor: 'F#m', accidentals: 3, note: 'Three sharps: F♯, C♯, G♯.' },
	{ key: 'Eb', relativeMinor: 'Cm', accidentals: -3, note: 'Three flats: B♭, E♭, A♭.' },
	{ key: 'E', relativeMinor: 'C#m', accidentals: 4, note: 'Four sharps: F♯, C♯, G♯, D♯.' },
	{ key: 'Ab', relativeMinor: 'Fm', accidentals: -4, note: 'Four flats: B♭, E♭, A♭, D♭.' },
	{ key: 'B', relativeMinor: 'G#m', accidentals: 5, note: 'Five sharps. Only one white-key tonic left.' },
	{ key: 'Db', relativeMinor: 'Bbm', accidentals: -5, note: 'Five flats.' },
	{ key: 'Gb', relativeMinor: 'Ebm', accidentals: -6, note: 'Six flats, and the far side of the wheel.' }
];

export type RungId =
	| 'scale'
	| 'tonic-triad'
	| 'primary-triads'
	| 'all-triads'
	| 'tonic-seventh'
	| 'all-sevenths'
	| 'relative-minor';

export type Rung = {
	id: RungId;
	label: string;
	/** What this is, in one line, written for someone meeting it for the first time. */
	teaches: string;
	/** What to do with your hands. */
	instruction: string;
	/** Roughly how many correct answers before it stops looking new. */
	suggestAfter: number;
};

/**
 * Seven small steps per key.
 *
 * Deliberately short and overlapping — each rung is mostly the previous one
 * plus one idea. Chord progressions used to live here and have moved to their
 * own section, because learning a key and learning a movement between chords
 * are different jobs and mixing them made both muddier.
 */
export const RUNGS: Rung[] = [
	{
		id: 'scale',
		label: 'The scale',
		teaches: 'Seven notes. Everything else in this key is built from them.',
		instruction: 'Play it up and down, right hand, as slowly as you like.',
		suggestAfter: 6
	},
	{
		id: 'tonic-triad',
		label: 'The home chord',
		teaches: 'Three notes from the scale — the first, third and fifth. This is where the key rests.',
		instruction: 'Play it, listen to it, and come back to it.',
		suggestAfter: 6
	},
	{
		id: 'primary-triads',
		label: 'The three main chords',
		teaches: 'I, IV and V. A very large amount of music is only these.',
		instruction: 'Play each one, then move between them.',
		suggestAfter: 9
	},
	{
		id: 'all-triads',
		label: 'All seven triads',
		teaches: 'One chord on each note of the scale. Three are major, three are minor, one is diminished.',
		instruction: 'Play up the scale, building a chord on each note.',
		suggestAfter: 12
	},
	{
		id: 'tonic-seventh',
		label: 'Adding the seventh',
		teaches: 'One more note on top of the home chord. This is the sound of jazz rather than folk.',
		instruction: 'Play the triad, then add the seventh and hear what changes.',
		suggestAfter: 6
	},
	{
		id: 'all-sevenths',
		label: 'All seven sevenths',
		teaches: 'The same seven chords, each with its seventh. Two are major sevenths, one is dominant.',
		instruction: 'Up the scale again, four notes at a time.',
		suggestAfter: 12
	},
	{
		id: 'relative-minor',
		label: 'The relative minor',
		teaches: 'Exactly the same seven notes, starting from the sixth degree. A different feeling, no new notes.',
		instruction: 'Play the minor scale, then its first, fourth and fifth chords.',
		suggestAfter: 9
	}
];

export function rungById(id: string): Rung | undefined {
	return RUNGS.find((r) => r.id === id);
}

export function stageByKey(key: string): Stage | undefined {
	return STAGES.find((s) => s.key === key);
}

export function stageIndex(key: string): number {
	return STAGES.findIndex((s) => s.key === key);
}

/** A place on the ladder: which key, which rung. */
export type Position = { stage: Stage; rung: Rung; stageIndex: number; rungIndex: number };

export const FIRST_POSITION: Position = {
	stage: STAGES[0],
	rung: RUNGS[0],
	stageIndex: 0,
	rungIndex: 0
};

export function positionOf(key: string, rungId: string): Position | null {
	const si = stageIndex(key);
	const ri = RUNGS.findIndex((r) => r.id === rungId);
	if (si < 0 || ri < 0) return null;
	return { stage: STAGES[si], rung: RUNGS[ri], stageIndex: si, rungIndex: ri };
}

/** The next place, walking rungs then keys. Null at the end of everything. */
export function nextPosition(current: Position): Position | null {
	if (current.rungIndex + 1 < RUNGS.length) {
		return {
			stage: current.stage,
			rung: RUNGS[current.rungIndex + 1],
			stageIndex: current.stageIndex,
			rungIndex: current.rungIndex + 1
		};
	}
	if (current.stageIndex + 1 < STAGES.length) {
		return {
			stage: STAGES[current.stageIndex + 1],
			rung: RUNGS[0],
			stageIndex: current.stageIndex + 1,
			rungIndex: 0
		};
	}
	return null;
}

/** Everything up to and including a position, for choosing review material. */
export function reachedSoFar(current: Position): Array<{ key: string; rungId: RungId }> {
	const out: Array<{ key: string; rungId: RungId }> = [];
	for (let s = 0; s <= current.stageIndex; s++) {
		const lastRung = s === current.stageIndex ? current.rungIndex : RUNGS.length - 1;
		for (let r = 0; r <= lastRung; r++) {
			out.push({ key: STAGES[s].key, rungId: RUNGS[r].id });
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// What each rung asks
// ---------------------------------------------------------------------------

export type LadderItem = {
	kind: string;
	label: string;
	answerPitchClasses: number[];
	answerVoicing?: number[];
	degree?: string;
	detail?: string;
};

const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREES = ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'];

const voicingOf = (chord: Parameters<typeof closeVoicing>[0]) =>
	closeVoicing(chord, 3).map(midi);

function triadItem(k: Key, degree: number, degrees: string[]): LadderItem {
	const chord = diatonicTriad(k, degree);
	return {
		kind: 'triad',
		label: formatChord(chord),
		answerPitchClasses: chordPitchClasses(chord),
		answerVoicing: voicingOf(chord),
		degree: degrees[degree - 1]
	};
}

function seventhItem(k: Key, degree: number, degrees: string[]): LadderItem {
	const chord = diatonicSeventh(k, degree);
	return {
		kind: 'seventh',
		label: formatChord(chord),
		answerPitchClasses: chordPitchClasses(chord),
		answerVoicing: voicingOf(chord),
		degree: degrees[degree - 1]
	};
}

function scaleItem(k: Key): LadderItem {
	const notes = scale(k);
	return {
		kind: 'scale',
		label: `${formatKey(k)} scale`,
		answerPitchClasses: notes.map(pitchClass),
		answerVoicing: notes.map((n) => midi({ ...n, octave: 4 })),
		detail: notes.map((n) => formatNote(n, { unicode: true })).join(' ')
	};
}

/** The items a rung asks for, in a given key. */
export function itemsForRung(rungId: RungId, stage: Stage): LadderItem[] {
	const major = makeKey(stage.key);
	const minor = makeKey(stage.relativeMinor.replace(/m$/, ''), 'aeolian');

	switch (rungId) {
		case 'scale':
			return [scaleItem(major)];
		case 'tonic-triad':
			return [triadItem(major, 1, MAJOR_DEGREES)];
		case 'primary-triads':
			return [1, 4, 5].map((d) => triadItem(major, d, MAJOR_DEGREES));
		case 'all-triads':
			return [1, 2, 3, 4, 5, 6, 7].map((d) => triadItem(major, d, MAJOR_DEGREES));
		case 'tonic-seventh':
			return [seventhItem(major, 1, MAJOR_DEGREES)];
		case 'all-sevenths':
			return [1, 2, 3, 4, 5, 6, 7].map((d) => seventhItem(major, d, MAJOR_DEGREES));
		case 'relative-minor':
			return [
				scaleItem(minor),
				...[1, 4, 5].map((d) => triadItem(minor, d, MINOR_DEGREES))
			];
	}
}

/**
 * Which directions a rung can honestly ask.
 *
 * A scale has no chord shape to name, so asking you to name one would be a
 * question with no answer — and a wrong answer to an impossible question still
 * counts against you.
 */
export function directionsForRung(rungId: RungId): CardDirection[] {
	if (rungId === 'scale') return ['see_play', 'hear_play'];
	if (rungId === 'relative-minor') return ['see_play', 'hear_play', 'hear_name'];
	return ['see_play', 'hear_play', 'hear_name', 'play_name'];
}

/** Stable identity, so re-generating a rung matches its existing cards. */
export function ladderIdentity(
	key: string,
	rungId: string,
	item: LadderItem,
	direction: CardDirection
): string {
	return `ladder|${key}|${rungId}|${item.kind}|${item.label}|${direction}`;
}
