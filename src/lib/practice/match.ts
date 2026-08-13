import { chordPitchClasses, degreeInterval, type AbstractChord } from '$lib/music/chord';
import { transpose } from '$lib/music/interval';
import { scalePitchClasses, type Key } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

/**
 * Are you playing the chord that is sounding?
 *
 * Pure, so it can be tested without a keyboard or a transport: given a chord,
 * the key it is heard in, and the pitch classes played over it, how did that
 * go? Everything about *when* a note counts as belonging to a chord is the
 * caller's problem — see the backing page, which samples the audio clock as
 * each note arrives.
 *
 * Two separate questions are answered here, and keeping them separate is the
 * whole design:
 *
 *   1. **Did you land the chord?** Scored, because it is the question being
 *      asked. Measured on the tones that make the chord *that* chord.
 *   2. **Where did your notes sit?** Reported and never scored, because
 *      chromatic approach notes and blue notes are good playing, and an app
 *      that marks them down would be teaching the opposite of the truth.
 */

/** Where a played note sits relative to the chord and its key. */
export type ToneKind =
	/** A note of the chord itself. */
	| 'chord'
	/** In the key this chord is heard in, but not in the chord. */
	| 'colour'
	/** Outside that key. A blue note and a wrong note look identical here. */
	| 'outside';

export type Target = {
	/** Chord tones. */
	chord: Set<number>;
	/** Everything the local key contains, chord tones included. */
	key: Set<number>;
	/**
	 * The tones that make this chord *this* chord — its guide tones.
	 *
	 * Not the root, and not the fifth. The root is what the bass is playing,
	 * and this app has said since M1 that "the fifth of a dominant is the note
	 * nobody misses"; requiring either would mark down the rootless voicings
	 * the curriculum spends its time teaching.
	 */
	essential: number[];
};

/**
 * Precompute everything a chord needs to judge notes against.
 *
 * Once per chord rather than once per note: this is read on every key press,
 * and on every repaint of the header, so the sets are built where the chord
 * changes and not where it is consulted.
 *
 * `key` is the *local* key centre, not the tune's home key. That is what makes
 * the F♯ in a D7 read as belonging in a C blues rather than as an accident —
 * `studyProgression` has already worked out which key each chord is heard in.
 */
export function targetFor(chord: AbstractChord, key: Key): Target {
	const tones = chordPitchClasses(chord);
	const inChord = new Set(tones);

	// The key's own seven, plus the chord's tones. A secondary dominant brings
	// a note the parent scale does not have, and that note is not "outside" —
	// it is the chord.
	const inKey = new Set([...scalePitchClasses(key), ...tones]);

	return { chord: inChord, key: inKey, essential: essentialTones(chord) };
}

/**
 * The guide tones: the third and the seventh, where the chord has them.
 *
 * A sus chord has no third, so its fourth or second is doing that job. A sixth
 * chord has no seventh, so its sixth is. A plain triad has neither pair, and
 * falls back to its third alone — which against a walking bass sounding the
 * root is genuinely what separates major from minor.
 */
export function essentialTones(chord: AbstractChord): number[] {
	const third = degreeInterval(chord, 3) ?? degreeInterval(chord, 11) ?? degreeInterval(chord, 9);
	const seventh = degreeInterval(chord, 7) ?? degreeInterval(chord, 13);

	const out = new Set<number>();
	for (const interval of [third, seventh]) {
		if (interval) out.add(pitchClass(transpose(chord.root, interval)));
	}
	// Nothing has no third at all, but a chord type added later might; falling
	// back to the root beats declaring every attempt a success.
	if (out.size === 0) out.add(pitchClass(chord.root));
	return [...out];
}

export function classify(pc: number, target: Target): ToneKind {
	const normalised = ((pc % 12) + 12) % 12;
	if (target.chord.has(normalised)) return 'chord';
	if (target.key.has(normalised)) return 'colour';
	return 'outside';
}

/** How well one chord went. */
export type Landing =
	/** Every guide tone played. */
	| 'landed'
	/** Some of them. */
	| 'partial'
	/** None — something was played, but not this chord. */
	| 'missed';

export type Attempt = {
	landing: Landing;
	/** Guide tones found, and how many there were to find. */
	found: number;
	needed: number;
	/** Guide tones still missing, as pitch classes, for naming them on screen. */
	absent: number[];
	/** Every note played over this chord, counted by where it sat. */
	notes: Record<ToneKind, number>;
};

/**
 * Judge what was played over one chord.
 *
 * `played` is every pitch class heard while the chord was sounding, not a
 * simultaneous handful: comping it, arpeggiating it and running a line through
 * it are all playing the chord, and only the first would survive being marked
 * as a single grab. This is the same reasoning that split `markGathered` out of
 * `markPlayed` for scales.
 */
export function judge(played: Iterable<number>, target: Target): Attempt {
	const notes: Record<ToneKind, number> = { chord: 0, colour: 0, outside: 0 };
	const heard = new Set<number>();

	for (const note of played) {
		const pc = ((note % 12) + 12) % 12;
		heard.add(pc);
		notes[classify(pc, target)]++;
	}

	const absent = target.essential.filter((pc) => !heard.has(pc));
	const needed = target.essential.length;
	const found = needed - absent.length;

	return {
		landing: found === needed ? 'landed' : found === 0 ? 'missed' : 'partial',
		found,
		needed,
		absent,
		notes
	};
}

/** A run's running total. */
export type Tally = {
	/** Chord occurrences something was played over. Silence is not counted. */
	voiced: number;
	landed: number;
	partial: number;
	missed: number;
	notes: Record<ToneKind, number>;
};

export const emptyTally = (): Tally => ({
	voiced: 0,
	landed: 0,
	partial: 0,
	missed: 0,
	notes: { chord: 0, colour: 0, outside: 0 }
});

/**
 * Fold an attempt into the running total.
 *
 * An attempt with no notes at all is dropped rather than counted as a failure.
 * Resting through four bars, listening to where the form has got to, or sitting
 * out the count-in are all things a musician does on purpose, and a score that
 * fell every time you took your hands off the keys would be measuring how busy
 * you are rather than how well you are playing.
 */
export function add(tally: Tally, attempt: Attempt): Tally {
	const played = attempt.notes.chord + attempt.notes.colour + attempt.notes.outside;
	if (played === 0) return tally;

	return {
		voiced: tally.voiced + 1,
		landed: tally.landed + (attempt.landing === 'landed' ? 1 : 0),
		partial: tally.partial + (attempt.landing === 'partial' ? 1 : 0),
		missed: tally.missed + (attempt.landing === 'missed' ? 1 : 0),
		notes: {
			chord: tally.notes.chord + attempt.notes.chord,
			colour: tally.notes.colour + attempt.notes.colour,
			outside: tally.notes.outside + attempt.notes.outside
		}
	};
}

/**
 * The headline percentage, or null before anything has been played.
 *
 * Null rather than zero, because "you have scored 0%" and "you have not played
 * yet" are different statements and only one of them is true at the top of a
 * run.
 */
export function accuracy(tally: Tally): number | null {
	if (tally.voiced === 0) return null;
	return Math.round((tally.landed / tally.voiced) * 100);
}

/**
 * A gentler number: guide tones found across the whole run.
 *
 * `accuracy` is all-or-nothing per chord, which is the right headline but harsh
 * on a run where most bars were three-quarters right. This is the same run seen
 * per note rather than per chord.
 */
export function coverage(tally: Tally): number | null {
	if (tally.voiced === 0) return null;
	const graded = tally.landed + tally.partial + tally.missed;
	if (graded === 0) return null;
	return Math.round(((tally.landed + tally.partial * 0.5) / graded) * 100);
}
