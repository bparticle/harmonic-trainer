import { diatonicSeventh, diatonicTriad, formatChord } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { RUNGS, STAGES, itemsForRung, type RungId, type Stage } from './ladder';
import { PROGRESSIONS, realiseProgression, type Progression } from './progressions';
import type { Relation } from './crossing';

/**
 * Where everything sits, once the ladder is drawn as a network.
 *
 * The home page used to draw the twelve keys three times over — once as a
 * banner, once as twelve pips beside every rung, once as a strip of swatches —
 * and each of the three meant something different. One drawing replaces all
 * three, and this module is the part of it that is *musical* rather than
 * geometric: which station a key is, which line a progression opens on, and
 * where a borrowed chord is borrowed from. `session/network.ts` turns what is
 * here into coordinates and knows no music at all.
 *
 * ## The geography is accidentals
 *
 * `STAGES` is in the order the curriculum meets the keys — C, then one
 * accidental at a time, alternating sides. That order is a *route*, and it is
 * the wrong thing to lay a map out by: it interleaves the sharp and flat sides,
 * so two keys that sit next to each other on the page are two accidentals apart
 * and in opposite directions.
 *
 * The map is laid out by accidentals instead. C in the middle, sharps one way,
 * flats the other, and one step is one accidental — which is also the dominant
 * in one direction and the subdominant in the other, so "one stop" means the
 * same thing to the ear as it does to the eye.
 *
 * **And the ends meet.** G♭ is six flats, B is five sharps, and one more sharp
 * from B is F♯ — which is G♭ under its other name. The last station the ladder
 * opens is the one that closes the circle, which is a fact about the curriculum
 * that nothing in the app has ever been able to show.
 *
 * Pure, no clock, no database, no browser — the same discipline `crossing.ts`
 * and `vocabulary.ts` keep, and for the same reason.
 */

/** How many stations either side of C. Six flats, five sharps, and C. */
export const FLAT_REACH = 6;
export const SHARP_REACH = 5;

/**
 * A station's column, counted from the flat end.
 *
 * G♭ is 0 and B is 11, so the array a caller draws is left-to-right in the
 * order a reader expects: flats, home, sharps.
 */
export function columnOf(stage: Stage): number {
	return stage.accidentals + FLAT_REACH;
}

/**
 * Round the loop. Six flats and six sharps are the same twelve stations.
 *
 * Needed by every relation that can walk off the end: the parallel minor of D♭
 * is three flats further out than G♭, which is not a thirteenth key — it is E,
 * four sharps, arrived at from the other side. Without this the map would draw
 * a journey to nowhere for three of the twelve keys.
 */
export function wrapAccidentals(accidentals: number): number {
	return ((((accidentals + FLAT_REACH) % 12) + 12) % 12) - FLAT_REACH;
}

/** The twelve stages in map order: G♭ at the far flat end, B at the far sharp end. */
export const STATIONS: Stage[] = [...STAGES].sort((a, b) => a.accidentals - b.accidentals);

/** The stage a number of accidentals names, wrapping round the loop. */
export function stageAtAccidentals(accidentals: number): Stage {
	const wrapped = wrapAccidentals(accidentals);
	// Every value of `wrapped` is one of the twelve by construction, so the
	// fallback is unreachable rather than a default.
	return STATIONS.find((stage) => stage.accidentals === wrapped) ?? STAGES[0];
}

// ---------------------------------------------------------------------------
// The near neighbourhood, as places rather than as names
// ---------------------------------------------------------------------------

/** One relation, and the station it lands on. */
export type Neighbour = {
	relation: Relation;
	/** The station arrived at. The relative arrives at the one it started from. */
	stage: Stage;
	/** What is actually played there — the major key, or somebody's minor. */
	label: string;
	/** How far the map moves. Zero for the relative, which is the whole point. */
	stops: number;
};

/**
 * The four near relations, drawn where they actually are.
 *
 * `crossing.ts` names them and orders them; this says where they land, which is
 * the half a list cannot show:
 *
 *   - **The relative does not move.** Same seven notes, the ear resting
 *     somewhere else. On a network that is a change of platform, not a journey,
 *     and it is the reason `RELATION_ORDER` puts it first.
 *   - **The dominant is one stop toward the sharps**, the subdominant one stop
 *     toward the flats. One accidental each, in opposite directions, which is
 *     why they are not one lesson taught twice.
 *   - **The parallel is always three stops flat.** C minor is the relative minor
 *     of E♭, and E♭ is three flats. It *looks* adjacent because it shares a
 *     letter with C, and it is further away than either of the other two. That
 *     is exactly why `RELATION_ORDER` puts it last of the named four, and it is
 *     the single thing this map explains best.
 */
export function neighbours(stage: Stage): Neighbour[] {
	const dominant = stageAtAccidentals(stage.accidentals + 1);
	const subdominant = stageAtAccidentals(stage.accidentals - 1);
	const parallel = stageAtAccidentals(stage.accidentals - 3);

	return [
		{ relation: 'relative', stage, label: stage.relativeMinor, stops: 0 },
		{ relation: 'dominant', stage: dominant, label: dominant.key, stops: 1 },
		{ relation: 'subdominant', stage: subdominant, label: subdominant.key, stops: 1 },
		{ relation: 'parallel', stage: parallel, label: `${stage.key}m`, stops: 3 }
	];
}

// ---------------------------------------------------------------------------
// Which chords a key builds
// ---------------------------------------------------------------------------

/**
 * Every chord symbol a major key builds, triads and sevenths together.
 *
 * Symbols and not pitch classes, because the question being asked is whether a
 * key *makes* this chord rather than whether the notes happen to fall inside
 * its scale. That is the same distinction `pivotChords` draws and for the same
 * reason: a chord whose notes fit but which the key never builds is a
 * coincidence, not a hinge.
 */
function chordsBuiltBy(stage: Stage): Set<string> {
	const k = makeKey(stage.key);
	const built = new Set<string>();
	for (let degree = 1; degree <= 7; degree++) {
		built.add(formatChord(diatonicTriad(k, degree)));
		built.add(formatChord(diatonicSeventh(k, degree)));
	}
	return built;
}

/** Twelve keys' worth, computed once. 168 chords, and none of them change. */
const BUILT_BY: Array<{ stage: Stage; chords: Set<string> }> = STAGES.map((stage) => ({
	stage,
	chords: chordsBuiltBy(stage)
}));

/** What C and its relative minor build between them. A chord's "at home" test. */
const AT_HOME: Set<string> = new Set([
	...chordsBuiltBy(STAGES[0]),
	...(() => {
		const minor = makeKey(STAGES[0].relativeMinor.replace(/m$/, ''), 'aeolian');
		const built = new Set<string>();
		for (let degree = 1; degree <= 7; degree++) {
			built.add(formatChord(diatonicTriad(minor, degree)));
			built.add(formatChord(diatonicSeventh(minor, degree)));
		}
		return built;
	})()
]);

/**
 * The nearest key that builds a chord, or null where none does.
 *
 * Nearest by accidentals, and where two are equally near the flat one wins.
 * That tie is real and it has a right answer: F minor is built by both E♭ and
 * A♭, and in C it arrives as the borrowed `iv` — borrowed, that is, from C
 * minor, which is three flats, which is E♭'s. The rule and the theory agree,
 * so the rule is kept rather than special-cased.
 *
 * Null is a real answer and not a failure. A suspended chord and a minor-major
 * seventh are built by no key at all, which is precisely what `ROADMAP.md`
 * records as the two shapes still taught by nothing.
 */
export function builtBy(symbol: string): Stage | null {
	let best: Stage | null = null;
	for (const entry of BUILT_BY) {
		if (!entry.chords.has(symbol)) continue;
		if (
			best === null ||
			Math.abs(entry.stage.accidentals) < Math.abs(best.accidentals) ||
			(Math.abs(entry.stage.accidentals) === Math.abs(best.accidentals) &&
				entry.stage.accidentals < best.accidentals)
		) {
			best = entry.stage;
		}
	}
	return best;
}

// ---------------------------------------------------------------------------
// Where a progression sits
// ---------------------------------------------------------------------------

/** A chord a progression reaches outside the key for, and where it lives. */
export type Borrow = {
	/** The chord, spelled in C — the key the anchor is worked out in. */
	symbol: string;
	/** The nearest key that builds it, or null when no key does. */
	from: Stage | null;
	/** How many stops away that is. Null alongside a null `from`. */
	stops: number | null;
};

export type ProgressionAnchor = {
	id: string;
	/** The line it opens on, or null where no rung builds its home chords. */
	opensOn: RungId | null;
	/** That line's index, so a drawing need not look it up. */
	lineIndex: number | null;
	borrows: Borrow[];
};

/** Every chord the ladder has built by the end of each rung, cumulatively. */
const BUILT_BY_RUNG: Array<Set<string>> = (() => {
	const out: Array<Set<string>> = [];
	const running = new Set<string>();
	for (const rung of RUNGS) {
		for (const item of itemsForRung(rung.id, STAGES[0])) {
			if (item.chord) running.add(formatChord(item.chord));
		}
		out.push(new Set(running));
	}
	return out;
})();

const MINOR_RUNG = RUNGS.findIndex((rung) => rung.id === 'relative-minor');

/**
 * The line a progression opens on, and what it borrows.
 *
 * Two facts, derived rather than authored, so a progression added to the
 * library lands on the map without anybody writing down where it goes.
 *
 * **Opens on** is the shallowest rung that builds every chord the progression
 * keeps inside the key — raised to the relative minor for a minor-mode one,
 * because that rung is the only thing in this app that grants a minor key at
 * all, and a minor progression offered before it would be numerals counted
 * from a scale nobody has met. This is what lets the page answer *where can I
 * play this*, which the level number never could: a progression on a line open
 * in four keys is playable in four keys.
 *
 * **Borrows** is every chord neither C nor A minor builds, paired with the
 * nearest key that does. Worked out in C and transposed at the point of
 * drawing, exactly as the library itself is stored in numerals and realised at
 * the last moment.
 *
 * The pattern that falls out is worth knowing and was not designed in: every
 * borrowed and blues chord in the library comes from the flat side and every
 * secondary dominant from the sharp side, and the tritone substitution comes
 * from the far terminus. On a map laid out by accidentals those are opposite
 * directions and a great distance, which is a thing a musician has to be told
 * and a reader of this diagram can simply see.
 */
export function progressionAnchor(progression: Progression): ProgressionAnchor {
	const realised = realiseProgression(progression, progression.mode === 'minor' ? 'A' : 'C');
	const symbols = realised.steps.map((step) => step.symbol);

	const home = symbols.filter((symbol) => AT_HOME.has(symbol));
	const foreign = [...new Set(symbols.filter((symbol) => !AT_HOME.has(symbol)))];

	let lineIndex: number | null = null;
	for (let r = 0; r < RUNGS.length; r++) {
		if (home.every((symbol) => BUILT_BY_RUNG[r].has(symbol))) {
			lineIndex = Math.max(r, progression.mode === 'minor' ? MINOR_RUNG : 0);
			break;
		}
	}

	return {
		id: progression.id,
		opensOn: lineIndex === null ? null : RUNGS[lineIndex].id,
		lineIndex,
		borrows: foreign.map((symbol) => {
			const from = builtBy(symbol);
			return { symbol, from, stops: from ? Math.abs(from.accidentals) : null };
		})
	};
}

/** The whole library, anchored. Computed once; none of it depends on a player. */
export const PROGRESSION_ANCHORS: Record<string, ProgressionAnchor> = Object.fromEntries(
	PROGRESSIONS.map((progression) => [progression.id, progressionAnchor(progression)])
);

// ---------------------------------------------------------------------------
// Saying a borrowed chord in the key you are actually in
// ---------------------------------------------------------------------------

const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROOT_PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * A borrowed chord, moved from C into the key the departure is actually in.
 *
 * The anchors above are worked out in C, so their symbols are C's answers. A
 * label that did not move with the station would be the diagram telling a small
 * lie in the one place it makes its strongest claim — that a borrowed chord has
 * an address.
 *
 * Root and suffix, transposed by fifths and respelled from the destination's
 * own side of the circle. Deliberately narrow: it moves the root of a symbol
 * this library actually produces and leaves everything after it alone, which is
 * every chord in `PROGRESSIONS` and nothing more. A chart's arbitrary symbol
 * would want `spell()` and the music core; this wants nine roots.
 */
export function sayInKey(symbol: string, accidentals: number): string {
	const match = /^([A-G])([b#♭♯]?)(.*)$/.exec(symbol);
	if (!match) return symbol;

	const [, letter, accidental, suffix] = match;
	const offset = accidental === 'b' || accidental === '♭' ? -1 : accidental ? 1 : 0;
	const pc = (((ROOT_PITCH_CLASS[letter] + offset + 7 * accidentals) % 12) + 12) % 12;

	return (accidentals > 0 ? SHARP_NAMES : FLAT_NAMES)[pc] + suffix;
}
