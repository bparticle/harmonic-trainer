import {
	chordPitchClasses,
	degreeInterval,
	diatonicSeventh,
	formatChord,
	type AbstractChord
} from './chord';
import { transpose, ivl } from './interval';
import { formatKey, parallelKey, scale, scalePitchClasses, type Key } from './key';
import { pitchClass, type Note } from './note';
import { formatRomanDegree, scaleDegree } from './spell';

/**
 * Roman numeral analysis.
 *
 * The output is a label plus an explanation, because the label alone is the
 * thing that never sticks. Knowing a chord is `V7/vi` matters far less than
 * knowing it is "the dominant of the vi chord, borrowed from A minor for one
 * bar" — that is the sentence that makes it playable in another key tomorrow.
 */

export type ChordCategory =
	| 'diatonic'
	| 'blues-dominant'
	| 'minor-dominant'
	| 'secondary-dominant'
	| 'tritone-sub'
	| 'backdoor'
	| 'borrowed'
	| 'chromatic';

export type HarmonicRole = 'tonic' | 'subdominant' | 'dominant' | 'other';

export type Analysis = {
	chord: AbstractChord;
	symbol: string;
	/** The Roman numeral, e.g. `ii7`, `V7`, `V7/vi`, `bII7`, `iv`. */
	roman: string;
	category: ChordCategory;
	role: HarmonicRole;
	/** The key this chord is analysed in — changes when the piece modulates. */
	key: Key;
	explanation: string;
	/** Set when this chord is the hinge of a modulation. */
	pivot?: {
		from: Key;
		to: Key;
		romanInFrom: string;
		romanInTo: string;
	};
	/** Set on the first chord heard in a newly established key centre. */
	modulation?: { from: Key; to: Key };
};

/** Qualities written with a lowercase numeral. */
/** Qualities stable enough to establish a new tonic, rather than merely point onward. */
const TONIC_ISH = new Set(['maj', 'min', 'maj6', 'min6']);

const MINOR_ISH = new Set(['min', 'min7b5', 'dim7', 'min6']);

/**
 * The part of a numeral after the degree.
 *
 * Alterations are written out — V7♭9 rather than V7 — because they are the
 * reason the chord was chosen. Dropping them made the numeral a lie about the
 * chord it came from, and anything storing a chart as numerals got the plain
 * dominant back.
 */
function romanSuffix(c: AbstractChord): string {
	return qualitySuffix(c) + c.alterations.join('');
}

function qualitySuffix(c: AbstractChord): string {
	const highest = [...c.extensions].sort((a, b) => b - a)[0];
	switch (c.quality) {
		case 'maj':
			return c.extensions.length ? `maj${highest}` : '';
		case 'dom':
			return String(highest && highest !== 7 ? highest : 7);
		case 'min':
			return c.extensions.length ? String(highest) : '';
		case 'min7b5':
			return c.extensions.includes(7) ? 'm7b5' : 'dim';
		case 'dim7':
			return 'dim7';
		case 'aug':
			return c.extensions.length ? `aug${highest}` : 'aug';
		case 'maj6':
		case 'min6':
			return '6';
		case 'sus2':
			return 'sus2';
		case 'sus4':
			return c.extensions.length ? `${highest}sus4` : 'sus4';
	}
}

/** The bare numeral for a root in a key, without any quality suffix. */
function numeralFor(root: Note, k: Key, quality: string): string {
	const numeral = formatRomanDegree(scaleDegree(root, k));
	return MINOR_ISH.has(quality) ? numeral.toLowerCase() : numeral;
}

export function romanNumeral(c: AbstractChord, k: Key): string {
	return numeralFor(c.root, k, c.quality) + romanSuffix(c);
}

function roleFor(degree: number, alter: number, category: ChordCategory): HarmonicRole {
	if (category === 'secondary-dominant' || category === 'tritone-sub' || category === 'backdoor') {
		return 'dominant';
	}
	if (alter !== 0) return 'other';
	if (degree === 1 || degree === 3 || degree === 6) return 'tonic';
	if (degree === 2 || degree === 4) return 'subdominant';
	if (degree === 5 || degree === 7) return 'dominant';
	return 'other';
}

/**
 * True when the chord is exactly the diatonic chord on one of the key's degrees.
 *
 * The degree is found by *scale position*, not by `scaleDegree`'s alteration.
 * In C aeolian, A♭ is the sixth degree of the scale even though `scaleDegree`
 * correctly calls it ♭6 — that alteration is measured against the major scale,
 * which is right for a Roman numeral and wrong for a membership test.
 */
export function isDiatonicChord(c: AbstractChord, k: Key): boolean {
	const scalePcs = scalePitchClasses(k);
	const chordPcs = chordPitchClasses(c);
	if (!chordPcs.every((pc) => scalePcs.has(pc))) return false;

	const notes = scale(k);
	const index = notes.findIndex((n) => pitchClass(n) === pitchClass(c.root));
	if (index < 0) return false;

	const expected = diatonicSeventh(k, index + 1);
	// Triads count as diatonic too: a plain IV is as diatonic as IVmaj7.
	return expected.quality === c.quality || chordPcs.length === 3;
}

// ---------------------------------------------------------------------------
// Analysis of a single chord
// ---------------------------------------------------------------------------

function analyseChord(
	c: AbstractChord,
	k: Key,
	next?: AbstractChord
): Omit<Analysis, 'key' | 'pivot'> {
	const symbol = formatChord(c);
	const { degree, alter } = scaleDegree(c.root, k);

	if (isDiatonicChord(c, k)) {
		const roman = romanNumeral(c, k);
		const scaleDegreeIndex =
			scale(k).findIndex((note) => pitchClass(note) === pitchClass(c.root)) + 1;
		return {
			chord: c,
			symbol,
			roman,
			category: 'diatonic',
			role: roleFor(scaleDegreeIndex, 0, 'diatonic'),
			explanation: `${roman} — the diatonic chord on degree ${degree} of ${formatKey(k)}`
		};
	}

	if (c.quality === 'dom') {
		// A dominant resolves down a fifth. What does this one point at?
		const targetRoot = transpose(c.root, ivl('P4'));
		const target = scaleDegree(targetRoot, k);
		const scalePcs = scalePitchClasses(k);
		// Natural minor writes a minor v, but jazz and common-practice harmony use
		// a major V7 for its leading tone. Treating that chord as merely chromatic
		// hides the most important cadence in a minor key.
		if (pitchClass(targetRoot) === pitchClass(k.tonic) && k.mode === 'aeolian') {
			const roman = `V${romanSuffix(c)}`;
			return {
				chord: c,
				symbol,
				roman,
				category: 'minor-dominant',
				role: 'dominant',
				explanation: `${roman} - the dominant of ${formatKey(k)}, borrowing its leading tone from harmonic minor`
			};
		}

		if (scalePcs.has(pitchClass(targetRoot)) && target.degree !== 1) {
			const targetChord = diatonicSeventh(k, target.degree);
			const targetNumeral = numeralFor(targetRoot, k, targetChord.quality);
			const roman = `V${romanSuffix(c)}/${targetNumeral}`;
			return {
				chord: c,
				symbol,
				roman,
				category: 'secondary-dominant',
				role: 'dominant',
				explanation: `${roman} — the dominant of ${formatChord(targetChord)}, pulling to the ${targetNumeral} chord`
			};
		}
		// The dominant seventh on IV is the defining blues colour: its seventh is
		// the blue flat third of the home key. It is not a tritone substitute
		// unless it actually resolves down a semitone.
		if (k.mode === 'ionian' && degree === 4 && alter === 0) {
			const roman = `IV${romanSuffix(c)}`;
			return {
				chord: c,
				symbol,
				roman,
				category: 'blues-dominant',
				role: 'subdominant',
				explanation: `${roman} - the blues IV dominant, adding the blue flat third of ${formatKey(k)}`
			};
		}

		/*
		 * The backdoor is checked before the tritone sub, because Bb7 in C also
		 * sits a semitone below the diatonic A and would otherwise be misread as
		 * a substitute for V7/vi. Its real job is approaching the tonic from
		 * below, which is a different sound and a different lesson.
		 */
		if (degree === 7 && alter === -1 && next && pitchClass(next.root) === pitchClass(k.tonic)) {
			const roman = `bVII${romanSuffix(c)}`;
			return {
				chord: c,
				symbol,
				roman,
				category: 'backdoor',
				role: 'dominant',
				explanation: `${roman} — the backdoor dominant, approaching the tonic from below`
			};
		}

		/*
		 * A tritone substitute resolves *down a semitone* rather than down a
		 * fifth. Transposing up a major seventh lands on that note with the right
		 * spelling: D♭ + M7 = C, so D♭7 is the substitute aiming at C.
		 *
		 * It works because the sub and the dominant it replaces share a third and
		 * a seventh, swapped round — D♭7 has F and C♭, G7 has B and F. The guide
		 * tones barely move, which is exactly why the ear accepts it.
		 */
		const subTargetRoot = transpose(c.root, ivl('M7'));
		const subTarget = scaleDegree(subTargetRoot, k);
		if (
			next &&
			pitchClass(next.root) === pitchClass(subTargetRoot) &&
			subTarget.alter === 0 &&
			scalePcs.has(pitchClass(subTargetRoot))
		) {
			const roman = `${formatRomanDegree({ degree, alter })}${romanSuffix(c)}`;
			const replacing =
				subTarget.degree === 1
					? 'V7'
					: `V7/${numeralFor(subTargetRoot, k, diatonicSeventh(k, subTarget.degree).quality)}`;
			return {
				chord: c,
				symbol,
				roman,
				category: 'tritone-sub',
				role: 'dominant',
				explanation: `${roman} — the tritone substitute for ${replacing}, sharing its third and seventh`
			};
		}
	}

	// Modal interchange: is this the diatonic chord of the parallel key?
	if (k.mode === 'ionian' || k.mode === 'aeolian') {
		const parallel = parallelKey(k);
		if (isDiatonicChord(c, parallel)) {
			const roman = romanNumeral(c, k);
			return {
				chord: c,
				symbol,
				roman,
				category: 'borrowed',
				role: roleFor(degree, alter, 'borrowed'),
				explanation: `${roman} — borrowed from ${formatKey(parallel)}, the parallel ${parallel.mode === 'aeolian' ? 'minor' : 'major'}`
			};
		}
	}

	const roman = romanNumeral(c, k);
	return {
		chord: c,
		symbol,
		roman,
		category: 'chromatic',
		role: 'other',
		explanation: `${roman} — chromatic in ${formatKey(k)}`
	};
}

// ---------------------------------------------------------------------------
// Modulation
// ---------------------------------------------------------------------------

type Modulation = {
	/** Where the new key takes over. */
	from: number;
	/** Index of the common chord, when there is one. */
	pivotIndex: number | null;
	to: Key;
};

function sameKey(a: Key, b: Key): boolean {
	return pitchClass(a.tonic) === pitchClass(b.tonic) && a.mode === b.mode;
}

function isFifthAbove(lower: AbstractChord, upper: AbstractChord): boolean {
	return pitchClass(transpose(lower.root, ivl('P4'))) === pitchClass(upper.root);
}

/**
 * Find modulations by looking for a dominant resolving down a fifth onto a
 * chord that is not the current tonic, then walking *backwards* for the pivot:
 * the last chord that is diatonic in both keys.
 *
 * The pivot is the interesting part. It is the chord where the ear has already
 * changed key without knowing it yet, and on the wheel it is the cell the two
 * key-shapes share.
 */
function detectModulations(chords: AbstractChord[], startKey: Key): Modulation[] {
	const modulations: Modulation[] = [];
	let current = startKey;

	for (let i = 0; i + 2 < chords.length; i++) {
		const [two, five, one] = [chords[i], chords[i + 1], chords[i + 2]];

		// A complete ii–V–I is the signal. A bare V–I is not enough: E7–Am7 in C
		// is V7/vi doing its job, not a move to A minor.
		const looksLikeTwoFive =
			MINOR_ISH.has(two.quality) && five.quality === 'dom' && isFifthAbove(two, five);
		if (!looksLikeTwoFive || !isFifthAbove(five, one)) continue;
		// A blues IV7 is still a dominant sound pointing onward. Landing on it
		// tonicizes IV, but does not establish a new key centre.
		if (!TONIC_ISH.has(one.quality)) continue;

		const target: Key = {
			tonic: one.root,
			mode: MINOR_ISH.has(one.quality) ? 'aeolian' : 'ionian'
		};
		if (sameKey(target, current)) continue;

		// If all three chords are already at home in the current key, nothing has
		// modulated — the progression merely visited.
		const allAtHome =
			isDiatonicChord(two, current) &&
			isDiatonicChord(five, current) &&
			isDiatonicChord(one, current);
		if (allAtHome) continue;

		// Walk back for a common chord: the last one diatonic in both keys. That
		// is where the ear changed key without noticing.
		let pivotIndex: number | null = null;
		for (let j = i; j >= 0; j--) {
			if (isDiatonicChord(chords[j], current) && isDiatonicChord(chords[j], target)) {
				pivotIndex = j;
				break;
			}
		}

		modulations.push({ from: pivotIndex ?? i, pivotIndex, to: target });
		current = target;
		i += 1;
	}

	return modulations;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function analyse(chords: AbstractChord[], key: Key): Analysis[] {
	const modulations = detectModulations(chords, key);

	return chords.map((c, index) => {
		const modulation = modulations.findLast((m) => m.from <= index);
		const activeKey = modulation ? modulation.to : key;

		const analysis: Analysis = { ...analyseChord(c, activeKey, chords[index + 1]), key: activeKey };
		const changesHere = modulations.find((m) => m.from === index);
		if (changesHere) {
			const previous = modulations.findLast((m) => m.from < index);
			analysis.modulation = { from: previous ? previous.to : key, to: changesHere.to };
		}

		const startsHere = modulations.find((m) => m.pivotIndex === index);
		if (startsHere) {
			const previous = modulations.findLast((m) => m.from < index);
			const from = previous ? previous.to : key;
			analysis.pivot = {
				from,
				to: startsHere.to,
				romanInFrom: romanNumeral(c, from),
				romanInTo: romanNumeral(c, startsHere.to)
			};
			analysis.explanation =
				`pivot: ${romanNumeral(c, from)} in ${formatKey(from)} becomes ` +
				`${romanNumeral(c, startsHere.to)} in ${formatKey(startsHere.to)}`;
		}

		return analysis;
	});
}

// ---------------------------------------------------------------------------
// Guide tones
// ---------------------------------------------------------------------------

export type GuideTones = { third: Note; seventh: Note };

/** The two notes that carry a chord's quality. The fifth and root do not. */
export function guideTones(c: AbstractChord): GuideTones | null {
	const third = degreeInterval(c, 3);
	const seventh = degreeInterval(c, 7);
	if (!third || !seventh) return null;
	return { third: transpose(c.root, third), seventh: transpose(c.root, seventh) };
}

export type GuideToneMotion = {
	/** Which voice of the first chord this is, and what it becomes in the second. */
	from: Note;
	to: Note;
	fromRole: 'third' | 'seventh';
	toRole: 'third' | 'seventh';
	semitones: number;
};

/**
 * How the guide tones move between two chords.
 *
 * Down a ii–V the third and seventh swap roles: the seventh of the ii falls a
 * semitone to become the third of the V, and the third of the ii stays put and
 * becomes the seventh. That swap is the whole mechanism of voice leading in this
 * music, and it works identically in all twelve keys.
 */
export function guideToneMotion(from: AbstractChord, to: AbstractChord): GuideToneMotion[] {
	const a = guideTones(from);
	const b = guideTones(to);
	if (!a || !b) return [];

	const motions: GuideToneMotion[] = [];
	for (const fromRole of ['third', 'seventh'] as const) {
		const start = a[fromRole];
		// Each guide tone moves to whichever guide tone of the next chord is nearest.
		let best: GuideToneMotion | null = null;
		for (const toRole of ['third', 'seventh'] as const) {
			const end = b[toRole];
			const raw = (pitchClass(end) - pitchClass(start) + 12) % 12;
			const semitones = raw > 6 ? raw - 12 : raw;
			if (!best || Math.abs(semitones) < Math.abs(best.semitones)) {
				best = { from: start, to: end, fromRole, toRole, semitones };
			}
		}
		if (best) motions.push(best);
	}
	return motions;
}
