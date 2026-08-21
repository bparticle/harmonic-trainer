import { RUNGS, STAGES, type Stage } from '$lib/curriculum/ladder';
import { parseKey } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

/**
 * How much of the record sits in each of the twelve keys.
 *
 * The home page draws twelve swatches and needs one honest number per key. That
 * number is the chords the record has heard in it — the same `GROUP BY` over
 * `chord_attempts` the profile's twelve keys are drawn from, deliberately, so
 * the two pages are showing one fact rather than two readings of it. Nothing
 * here estimates and nothing here counts a page left open.
 *
 * Modes fold into their tonic: a chord heard in `Eb dorian` was heard in E♭,
 * the same reading `coldSpotsFrom` gives a local key. The question a swatch
 * answers is which corners of the keyboard have been visited, not which mode
 * was written at the top of a chart — and a swatch is coloured by a pitch
 * class, which is exactly as much as a hue is ever allowed to mean here.
 *
 * **A key with nothing in it is `fresh`, never zero.** Zero is a score and this
 * is not one. Ten empty swatches on the home page are ten places to go, each of
 * them one press away from being today's workout, and the difference between
 * "nothing yet" and "nothing achieved" is the whole reason this type has a
 * boolean where it could have had a comparison.
 *
 * Pure, so the strip can be checked without a database — the same reason the
 * composer takes its inputs rather than fetching them.
 */

/** One key the record has chords in, as the query hands it over. */
export type KeyRow = { key: string; chords: number };

/** Where the ladder is standing, which is all this needs of it. */
export type LadderAt = { stageIndex: number; rungIndex: number };

export type KeyStanding = {
	/** The stage's key, as stored — ASCII, so it survives the database. */
	key: string;
	relativeMinor: string;
	/** The tonic's pitch class, which is where the swatch gets its colour. */
	pc: number;
	/** Chords the record heard in this key, however they were spelled. */
	chords: number;
	/** How full to draw the swatch, 0–1 against the busiest key. */
	fill: number;
	/** Nothing has ever been played here. Somewhere to go, not something failed. */
	fresh: boolean;
	/** Rungs of this key the ladder has introduced. Never a gate. */
	reached: number;
	/** How many rungs a key has, so a caller need not import the ladder. */
	rungs: number;
	/** The ladder is standing in this key right now. */
	here: boolean;
};

/**
 * The smallest fill a key with anything in it gets.
 *
 * Scaled honestly, one chord against five hundred is a third of a pixel, and a
 * swatch that reads as empty when it is not would be the strip saying something
 * false about the only thing it is for. The count printed beside it is exact,
 * and the fill is a picture of a proportion rather than a measurement of one.
 */
const SLIVER = 0.07;

/** A key label's tonic, or null for a spelling this build cannot read. */
function tonicOf(label: string): number | null {
	try {
		return pitchClass(parseKey(label).tonic);
	} catch {
		// An older row, or a hand-edited one. It is dropped rather than filed
		// under a guess: a swatch is a claim about a specific key.
		return null;
	}
}

/** Chords per tonic, every mode folded in, for however many rows there are. */
export function chordsByTonic(rows: KeyRow[]): Map<number, number> {
	const byTonic = new Map<number, number>();
	for (const row of rows) {
		const pc = tonicOf(row.key);
		if (pc === null) continue;
		byTonic.set(pc, (byTonic.get(pc) ?? 0) + row.chords);
	}
	return byTonic;
}

/**
 * The twelve keys, in the order the ladder meets them.
 *
 * The ladder's order and not the wheel's, because this is the picker: the keys
 * are laid out the way the curriculum introduces them, which is also the order
 * the page has always shown them in.
 */
export function keyStandings(
	rows: KeyRow[],
	at: LadderAt,
	stages: Stage[] = STAGES,
	rungs: number = RUNGS.length
): KeyStanding[] {
	const byTonic = chordsByTonic(rows);
	const busiest = Math.max(1, ...byTonic.values());

	return stages.map((stage, index) => {
		const pc = tonicOf(stage.key) ?? 0;
		const chords = byTonic.get(pc) ?? 0;
		return {
			key: stage.key,
			relativeMinor: stage.relativeMinor,
			pc,
			chords,
			fill: chords === 0 ? 0 : Math.max(SLIVER, chords / busiest),
			fresh: chords === 0,
			reached: rungsReached(at, index, rungs),
			rungs,
			here: index === at.stageIndex
		};
	});
}

/**
 * How many rungs of one key the ladder has introduced.
 *
 * The same walk `reachedSoFar` takes, counted rather than listed — every key
 * behind the ladder has all its rungs, the one it is standing in has everything
 * up to and including where it stands, and the ones ahead have none yet. A test
 * checks this against `reachedSoFar` itself, because two answers to one question
 * eventually disagree.
 */
export function rungsReached(at: LadderAt, index: number, rungs: number = RUNGS.length): number {
	if (index < at.stageIndex) return rungs;
	if (index > at.stageIndex) return 0;
	return Math.min(rungs, at.rungIndex + 1);
}

/** How many of the twelve hold anything. A count of places been, never a score. */
export function keysPlayed(standings: KeyStanding[]): number {
	return standings.filter((standing) => !standing.fresh).length;
}
