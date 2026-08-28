import {
	chordPitchClasses,
	diatonicSeventh,
	formatChord,
	type AbstractChord
} from '$lib/music/chord';
import {
	fifthsDistance,
	formatKey,
	key as makeKey,
	keySignature,
	parallelKey,
	relativeKey,
	scalePitchClasses,
	type Key,
	type Mode
} from '$lib/music/key';
import { pitchClass } from '$lib/music/note';
import { STAGES } from './ladder';

/**
 * Moving between keys, as a thing the curriculum can hold.
 *
 * The ladder teaches what is *inside* a key and the progression library teaches
 * how chords move *within* one. Nothing has ever taught the third thing, which
 * is how you get from one key to another and how you know when you have — and
 * the reason is that the curriculum had no object for it. `Stage` carries a
 * count of accidentals, a sentence about them and a relative minor; there is no
 * dominant, no subdominant, no parallel, and no distance.
 *
 * A `Crossing` is that object: two keys and the relation between them. It is
 * the smallest thing that can carry a "where are we now" question, a "what
 * changed" question, and a pivot chord to turn on.
 *
 * Pure, no clock, no database, no browser — the same discipline `vocabulary.ts`
 * keeps, and for the same reason: the composer that will eventually read this
 * is pure and takes its inputs.
 *
 * ## Two distances, and they are not the same number
 *
 * This is the part worth reading before using anything below.
 *
 *   - **The signature shift** is how many accidentals change. C to G is one
 *     sharp. C to A minor is *nothing at all* — same seven notes, different
 *     resting place.
 *   - **The tonic distance** is how far the home note moved round the circle,
 *     which is what `fifthsDistance` has always measured. C to A minor is three
 *     steps by that reading, because A is three fifths from C.
 *
 * Both are true and they answer different questions. The shift says how much
 * the *page* changes; the tonic distance says how far the *ear* is asked to
 * move its centre. A relative-minor move is the extreme case: zero on one
 * measure, three on the other, which is exactly why it feels like the smallest
 * move there is and still feels like a move.
 *
 * Krumhansl and Kessler's key space is a torus for the same reason — the circle
 * of fifths in two dimensions and the relative and parallel relations in two
 * more. So this module deliberately refuses to collapse the two into one
 * perceptual scalar. Nobody has measured what the weights would be, and a made-up
 * weighting would be a number the curriculum then ordered itself by. Ordering is
 * by named relation first and raw distance second, which is how the research
 * reports it and how a musician says it.
 */

// ---------------------------------------------------------------------------
// The relations
// ---------------------------------------------------------------------------

/**
 * How one key stands to another, where a musician has a name for it.
 *
 * Five names and a remainder, and the remainder is not a failure. From C major
 * nineteen of the twenty-three destinations land in `other`, and that is the
 * right shape for teaching: the near neighbourhood is small, everything in it
 * is nameable, and a "what changed?" question with five answers is a question
 * somebody can actually answer. `other` still carries its shift, so it can be
 * described precisely without being named.
 *
 * `dominant` and `subdominant` require the mode to be unchanged. C major to E
 * minor is also one sharp, and calling it the dominant would be a wrong answer
 * recorded against a right question — it is the relative of the dominant, which
 * is a different journey with a different sound.
 */
export type Relation = 'home' | 'relative' | 'dominant' | 'subdominant' | 'parallel' | 'other';

/**
 * Near to far, and this order is the curriculum.
 *
 * Krumhansl and Kessler found modulations between close keys are established by
 * the listener sooner than distant ones, so a curriculum that teaches crossings
 * teaches these in this order. The reasoning for each place:
 *
 *   - `relative` first, because nothing moves. The same seven notes with the
 *     ear resting somewhere else is the smallest real move in tonal music.
 *   - `dominant` next: one accidental, and the move the whole system is built
 *     to make. More tunes go here than everywhere else combined.
 *   - `subdominant` after it. One accidental the other way, and genuinely a
 *     different feeling — Cuddy and Thompson found key movement is perceived
 *     asymmetrically, so the two directions are not one lesson taught twice.
 *   - `parallel` last of the named four. The tonic does not move, which is why
 *     it belongs in the near neighbourhood at all, but three notes do, which is
 *     why the hands find it harder than the ear does.
 */
export const RELATION_ORDER: Relation[] = [
	'home',
	'relative',
	'dominant',
	'subdominant',
	'parallel',
	'other'
];

/** The four the first weeks of a crossing curriculum are made of. */
export const NEAR_RELATIONS: Relation[] = ['relative', 'dominant', 'subdominant', 'parallel'];

/** Said out loud, for a prompt or a multiple choice. */
export const RELATION_LABELS: Record<Relation, string> = {
	home: 'the same key',
	relative: 'the relative',
	dominant: 'the dominant',
	subdominant: 'the subdominant',
	parallel: 'the parallel',
	other: 'somewhere else'
};

const rank = (relation: Relation) => RELATION_ORDER.indexOf(relation);

// ---------------------------------------------------------------------------
// Pivot chords
// ---------------------------------------------------------------------------

/**
 * A chord that is at home in both keys: the hinge a modulation turns on.
 *
 * This computation used to live in `wheel/overlays.ts`, where it was a drawing
 * concern that happened to know some music. It is the other way round — the
 * music is the fact and the cells are the drawing — so it moved here and the
 * overlay now adds its own geometry to what this returns. The overlay's tests
 * did not change, which is the evidence that the move was faithful.
 */
export type Pivot = {
	/** How the chord is spelled, in both keys, since it is the same chord. */
	symbol: string;
	/** Its numeral in the key being left. */
	romanInFrom: string;
	/** Its numeral in the key being arrived at. The interesting half. */
	romanInTo: string;
	pitchClasses: number[];
	/** The root's pitch class, for anything that wants to draw or voice it. */
	root: number;
	chord: AbstractChord;
};

const MAJOR_SEVENTHS = ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viim7b5'];
const MINOR_SEVENTHS = ['i7', 'iim7b5', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7'];

/**
 * The seven diatonic sevenths of a mode, as numerals.
 *
 * Exported because the wheel's key overlay wants the same seven strings, and a
 * musical fact written down twice is a musical fact with two chances to be
 * wrong. Anything that is not aeolian is read as major, which is what the
 * overlay already did.
 */
export function diatonicSeventhNumerals(mode: Mode): string[] {
	return mode === 'aeolian' ? MINOR_SEVENTHS : MAJOR_SEVENTHS;
}

/**
 * Every chord diatonic in both keys.
 *
 * Sharing the notes is not enough: the chord has to be one the target key
 * *builds* as well. A chord whose notes happen to fall inside the new scale but
 * which the new key never makes is not a hinge, it is a coincidence — so the
 * match is on the spelled symbol of a diatonic seventh in each key.
 *
 * Empty is a real and useful answer. Distant keys share no diatonic chord at
 * all, which is precisely why a tune going there has to arrive some other way,
 * and a page explaining a modulation should say so rather than showing a gap.
 */
export function pivotChords(from: Key, to: Key): Pivot[] {
	const toPcs = scalePitchClasses(to);
	const fromRoman = diatonicSeventhNumerals(from.mode);
	const toRoman = diatonicSeventhNumerals(to.mode);

	const pivots: Pivot[] = [];
	for (let degree = 1; degree <= 7; degree++) {
		const chord = diatonicSeventh(from, degree);
		const pcs = chordPitchClasses(chord);
		if (!pcs.every((pc) => toPcs.has(pc))) continue;

		const symbol = formatChord(chord);
		let matched = -1;
		for (let d = 1; d <= 7; d++) {
			if (formatChord(diatonicSeventh(to, d)) === symbol) {
				matched = d;
				break;
			}
		}
		if (matched < 0) continue;

		pivots.push({
			symbol,
			romanInFrom: fromRoman[degree - 1] ?? '',
			romanInTo: toRoman[matched - 1] ?? '',
			pitchClasses: pcs,
			root: pitchClass(chord.root),
			chord
		});
	}

	return pivots;
}

// ---------------------------------------------------------------------------
// The crossing
// ---------------------------------------------------------------------------

export type Crossing = {
	from: Key;
	to: Key;
	relation: Relation;
	/**
	 * Accidentals gained, signed: positive sharpwards, negative flatwards.
	 *
	 * Zero for a relative-key move, because nothing on the page changes. See the
	 * note at the top of this file for why this is not the same number as
	 * `tonicDistance` and why neither one is allowed to stand in for the other.
	 */
	shift: number;
	/** How far the tonic moved round the circle of fifths, 0–6. */
	tonicDistance: number;
	modeChanged: boolean;
	/** Pitch classes both keys contain, ascending. Seven means the same notes. */
	shared: number[];
	pivots: Pivot[];
};

const isMajorOrMinor = (k: Key) => k.mode === 'ionian' || k.mode === 'aeolian';

const sameTonic = (a: Key, b: Key) => pitchClass(a.tonic) === pitchClass(b.tonic);
const sameKey = (a: Key, b: Key) => sameTonic(a, b) && a.mode === b.mode;

/** Wrapped into −6…+6, since seven sharps and five flats are the same place. */
function wrapShift(raw: number): number {
	const wrapped = (((raw + 6) % 12) as number) - 6;
	return wrapped <= -6 ? wrapped + 12 : wrapped;
}

/**
 * What one key is to another.
 *
 * Order matters here. `home` and `relative` are decided before anything counts
 * accidentals, because both are zero-shift and only the mode tells them apart;
 * `parallel` is decided on the tonic rather than on its shift, because C major
 * to C minor and C major to E♭ major are both three flats and are not remotely
 * the same move.
 *
 * A mode this app does not modulate between — dorian, locrian, the two minors
 * with a raised seventh — falls to `other` rather than throwing. They arrive
 * from the scale explorer, not from the curriculum, and a relation nobody can
 * name is a fair answer for them.
 */
export function relationBetween(from: Key, to: Key): Relation {
	if (sameKey(from, to)) return 'home';
	if (!isMajorOrMinor(from) || !isMajorOrMinor(to)) return 'other';

	if (sameKey(relativeKey(from), to)) return 'relative';
	if (sameKey(parallelKey(from), to)) return 'parallel';

	if (from.mode === to.mode) {
		const shift = wrapShift(keySignature(to) - keySignature(from));
		if (shift === 1) return 'dominant';
		if (shift === -1) return 'subdominant';
	}

	return 'other';
}

/** Everything the curriculum knows about getting from one key to another. */
export function crossingBetween(from: Key, to: Key): Crossing {
	const fromPcs = scalePitchClasses(from);
	const toPcs = scalePitchClasses(to);

	return {
		from,
		to,
		relation: relationBetween(from, to),
		shift: wrapShift(keySignature(to) - keySignature(from)),
		tonicDistance: fifthsDistance(from, to),
		modeChanged: from.mode !== to.mode,
		shared: [...fromPcs].filter((pc) => toPcs.has(pc)).sort((a, b) => a - b),
		pivots: pivotChords(from, to)
	};
}

// ---------------------------------------------------------------------------
// Ordering and enumeration
// ---------------------------------------------------------------------------

/**
 * Near first: by named relation, then by how many accidentals changed.
 *
 * Two sorts rather than one perceptual number, deliberately — see the note at
 * the top of this file.
 *
 * **The second key is the signature shift and not the tonic distance,** and
 * getting that round the wrong way produces a visibly wrong curriculum. Sorting
 * the remainder by tonic distance puts F minor ahead of D minor out of C major,
 * because F is one fifth from C and D is two — while F minor shares three notes
 * with C major and D minor shares six. D minor is the ii of the key somebody is
 * already standing in; F minor is a borrowed world. The order has to say so.
 *
 * That is not the two measures disagreeing about which is right. It is them
 * answering different questions: where the ear rests, which the named relations
 * above have already encoded, and how much of the page changes, which is what is
 * left to rank the unnamed ones by. Tonic distance stays as the third key, so
 * two crossings changing the same accidentals are still ordered.
 *
 * The final tiebreak is the printed name of the destination, so a list of
 * crossings is stable across runs and a test can assert on it.
 */
export function compareCrossings(a: Crossing, b: Crossing): number {
	return (
		rank(a.relation) - rank(b.relation) ||
		Math.abs(a.shift) - Math.abs(b.shift) ||
		a.tonicDistance - b.tonicDistance ||
		formatKey(a.to).localeCompare(formatKey(b.to))
	);
}

/**
 * The twenty-four keys the curriculum knows, in the ladder's own spellings.
 *
 * Read off `STAGES` rather than listed again, so a key spelled G♭ in the ladder
 * is spelled G♭ here and the two can never drift. Twelve majors and their
 * twelve relative minors is the whole of what this app calls a key.
 */
export function curriculumKeys(): Key[] {
	return STAGES.flatMap((stage) => [
		makeKey(stage.key),
		makeKey(stage.relativeMinor.replace(/m$/, ''), 'aeolian')
	]);
}

/**
 * Every crossing out of one key, nearest first.
 *
 * Home is left out: a crossing to where you already are is not one, and a drill
 * that offered it would be asking somebody to hear a change that did not happen.
 */
export function crossingsFrom(from: Key): Crossing[] {
	return curriculumKeys()
		.filter((to) => !sameKey(from, to))
		.map((to) => crossingBetween(from, to))
		.sort(compareCrossings);
}

/** The nearest few, for a drill that has to start somewhere gentle. */
export function nearestCrossings(from: Key, count = 4): Crossing[] {
	return crossingsFrom(from).slice(0, count);
}

/** Every crossing out of a key that has one of these relations, nearest first. */
export function crossingsWithRelation(from: Key, relations: Relation[]): Crossing[] {
	const wanted = new Set(relations);
	return crossingsFrom(from).filter((crossing) => wanted.has(crossing.relation));
}

// ---------------------------------------------------------------------------
// Saying it out loud
// ---------------------------------------------------------------------------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A crossing in the words somebody would use, without naming the target key.
 *
 * The key is deliberately absent. What a crossing exercise asks for is the
 * *relation* — that is the half which transposes, and the half worth learning —
 * so this describes the move rather than the destination, and the caller prints
 * the key beside it if the question is one where the key belongs.
 */
export function describeCrossing(crossing: Crossing): string {
	const toMinor = crossing.to.mode === 'aeolian';

	switch (crossing.relation) {
		case 'home':
			return 'no change — the same key throughout';
		case 'relative':
			return `to the relative ${toMinor ? 'minor' : 'major'} — the same seven notes, resting somewhere else`;
		case 'dominant':
			return 'up a fifth, to the dominant';
		case 'subdominant':
			return 'down a fifth, to the subdominant';
		case 'parallel':
			return `to the parallel ${toMinor ? 'minor' : 'major'} — the same home note, three notes moved`;
		case 'other': {
			const way = crossing.shift > 0 ? 'sharpwards' : 'flatwards';
			const accidentals =
				crossing.shift === 0
					? 'no change of signature'
					: `${plural(Math.abs(crossing.shift), 'accidental')} ${way}`;
			// Only claim major or minor where the destination is one. A mode from
			// the scale explorer — D dorian shares C major's signature exactly — is
			// a real crossing with nothing to say about its mode, and "into the
			// major" would be a confident sentence about the wrong thing.
			const named = crossing.to.mode === 'ionian' || crossing.to.mode === 'aeolian';
			const mode =
				crossing.modeChanged && named ? `, and into the ${toMinor ? 'minor' : 'major'}` : '';
			return `${accidentals}${mode}`;
		}
	}
}

/**
 * How a modulation could be made, in one line, for a page that has to explain
 * one rather than test it.
 *
 * The pivot count is the whole of what this adds, and a count of zero is the
 * useful case: distant keys share no chord at all, so the move has to be made
 * some other way, and saying that is more use than drawing an empty list.
 */
export function describePivots(crossing: Crossing): string {
	const shared = crossing.shared.length;
	if (crossing.pivots.length === 0) {
		return `${plural(shared, 'note')} in common and no chord at all, so there is nothing to pivot on — this one has to be taken directly, or through a dominant.`;
	}

	const first = crossing.pivots[0];
	return `${plural(shared, 'note')} in common and ${plural(crossing.pivots.length, 'chord')} belonging to both — ${first.symbol} is ${first.romanInFrom} on the way in and ${first.romanInTo} on the way out.`;
}
