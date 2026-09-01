import {
	FLAT_REACH,
	SHARP_REACH,
	STATIONS,
	columnOf,
	stageAtAccidentals
} from '$lib/curriculum/atlas';
import { RUNGS, STAGES, stageByKey, type RungId } from '$lib/curriculum/ladder';
import type { KeyStanding } from './warmth';
import type { PathStep } from './journey';

/**
 * The ladder as a drawing.
 *
 * Seven horizontal lines, twelve vertical stations, and a ragged edge where the
 * building stopped. Everything here is coordinates and counts; the music is in
 * `curriculum/atlas.ts` and the record is in `warmth.ts` and `journey.ts`, both
 * of which this takes as arguments rather than fetching. That is the same
 * arrangement `wheel/geometry.ts` has with `Wheel.svelte`, and it is what lets
 * the whole picture be checked without a database or a browser.
 *
 * ## What each mark is allowed to mean
 *
 * The house rule is that hue means pitch, and a transit diagram's signature is
 * coloured lines — so the convention is inverted rather than broken. **The
 * stations carry the colour and the lines are drawn in weight.** A station is a
 * key and a key wears its tonic's swatch; a line is a rung, a rung has no pitch,
 * and it gets ink and stroke width instead. Colour reads down the page, structure
 * reads across it, and every hue on the diagram is a tonic.
 *
 * ## Why the frontier is not an argument here
 *
 * It could be, and it would mean deriving `reached` and `keyNames` a second
 * time. `keyStandings` already counted how many rungs each key has open and
 * `ladderPath` already listed which keys each rung reaches, so this composes
 * their answers instead of recomputing them. Two readings of one frontier that
 * disagreed would be a page arguing with itself, and the cheapest way to make
 * that impossible is to have one reading.
 */

/** One key, as a place on the map. */
export type Station = {
	key: string;
	relativeMinor: string;
	/** The tonic's pitch class, which is where the swatch gets its colour. */
	pc: number;
	accidentals: number;
	/** Where the curriculum meets it. Not where it is drawn. */
	stageIndex: number;
	/** Where it is drawn: 0 at the flat end, 11 at the sharp end. */
	column: number;
	/** How many lines call here. The interchange size. */
	lines: number;
	/** Any line at all calls here. */
	onNetwork: boolean;
	/** Chords the record holds in this key, and how full to draw the roundel. */
	chords: number;
	fill: number;
	/** Nothing has ever been played here. Somewhere to go, not something failed. */
	fresh: boolean;
};

/** One rung, as a line across the map. */
export type Line = {
	rungId: RungId;
	label: string;
	teaches: string;
	index: number;
	/** How many keys it is open in. Zero for a line that has not opened. */
	stops: number;
	/** The columns it runs between, or null where it has not opened. */
	from: number | null;
	to: number | null;
	/** Which keys, so a caller can mark the station dots without a lookup. */
	keys: string[];
	/**
	 * The stop one more key would add — **only where that stop can be taken**.
	 *
	 * The direction alternates, because the ladder alternates: a line reaching
	 * three sharps extends to a fourth sharp, and the one below it extends to a
	 * third flat. Drawing the stub in the correct direction is the difference
	 * between a diagram that shows how this curriculum grows and one that implies
	 * it only ever grows one way.
	 *
	 * **Null where `widen` would refuse**, which is not a detail. A frontier like
	 * `[2, 2, 2, 1, 1, 1, 1]` has three lines whose next key is F, and only the
	 * top one may take it — the other two would stand a rung wider than the rung
	 * above them, which is the one shape the staircase may never have. Drawing
	 * all three put two stops on the map that no control could reach, and it was
	 * found the way these things are found: by somebody pressing them and asking
	 * why nothing happened.
	 */
	next: { key: string; column: number; pc: number } | null;
	/** Everything the record holds for this rung, across every key it is open in. */
	reviews: number;
	correct: number;
	solid: boolean;
	untouched: boolean;
};

export type Network = {
	stations: Station[];
	lines: Line[];
	/** The line that would open next, drawn as a stub at C. Null at the bottom. */
	opensNext: { rungId: RungId; label: string; index: number } | null;
	/** How much of the map exists, as cells out of eighty-four. */
	cells: number;
	total: number;
	fill: number;
	/** The two ends of the loop, for the join drawn across the top. */
	ends: { flat: number; sharp: number };
};

const pcOfStanding = (standings: KeyStanding[], key: string) =>
	standings.find((standing) => standing.key === key)?.pc ?? 0;

/**
 * The whole diagram, from the two readings the page already has.
 *
 * `path` carries depth — one row per rung, with what the record holds across
 * every key it reaches. `standings` carries breadth — one entry per key, with
 * what the record holds in it. Between them they are the frontier and the
 * record, and neither is recomputed here.
 */
export function network(path: PathStep[], standings: KeyStanding[]): Network {
	const stations: Station[] = STATIONS.map((stage) => {
		const standing = standings.find((entry) => entry.key === stage.key);
		const stageIndex = STAGES.findIndex((entry) => entry.key === stage.key);
		return {
			key: stage.key,
			relativeMinor: stage.relativeMinor,
			pc: standing?.pc ?? 0,
			accidentals: stage.accidentals,
			stageIndex,
			column: columnOf(stage),
			lines: standing?.reached ?? 0,
			onNetwork: (standing?.reached ?? 0) > 0,
			chords: standing?.chords ?? 0,
			fill: standing?.fill ?? 0,
			fresh: standing?.fresh ?? true
		};
	});

	const lines: Line[] = path.map((step, index) => {
		const columns = step.keyNames
			.map((key) => stageByKey(key))
			.filter((stage): stage is NonNullable<typeof stage> => Boolean(stage))
			.map(columnOf);

		/*
		 * The next key is the next one the *ladder* would reach, which is a step
		 * along its own order and not along the map's — and it is only drawn where
		 * `widen` would allow it. The rule is read off the path rather than off a
		 * frontier: a rung may not end up open in more keys than the rung above
		 * it, and `step.keys` is that count.
		 */
		const above = index === 0 ? Number.POSITIVE_INFINITY : path[index - 1].keys;
		const canWiden = step.keys > 0 && step.keys < STAGES.length && step.keys < above;
		const nextStage = canWiden ? STAGES[step.keys] : null;

		return {
			rungId: step.rungId,
			label: step.label,
			teaches: step.teaches,
			index: step.rungIndex,
			stops: step.keys,
			from: columns.length ? Math.min(...columns) : null,
			to: columns.length ? Math.max(...columns) : null,
			keys: step.keyNames,
			next: nextStage
				? {
						key: nextStage.key,
						column: columnOf(nextStage),
						pc: pcOfStanding(standings, nextStage.key)
					}
				: null,
			reviews: step.reviews,
			correct: step.correct,
			solid: step.solid,
			untouched: step.untouched
		};
	});

	const ahead = path.find((step) => step.state === 'ahead');
	const cells = path.reduce((total, step) => total + step.keys, 0);

	return {
		stations,
		lines,
		opensNext: ahead ? { rungId: ahead.rungId, label: ahead.label, index: ahead.rungIndex } : null,
		cells,
		total: STAGES.length * RUNGS.length,
		fill: cells / (STAGES.length * RUNGS.length),
		ends: { flat: 0, sharp: FLAT_REACH + SHARP_REACH }
	};
}

/** The station a key names, wherever a caller has only the name. */
export function stationOf(net: Network, key: string): Station | undefined {
	return net.stations.find((station) => station.key === key);
}

/**
 * Where a borrowed chord sits when the departure is not C.
 *
 * The anchors in `atlas.ts` are worked out in C. Moving the departure moves
 * every borrow with it by the same number of accidentals, which is the whole of
 * transposition on this map — one fifth is one stop, in both directions, and
 * the ends wrap.
 */
export function borrowColumn(borrowAccidentals: number, fromAccidentals: number): number {
	return columnOf(stageAtAccidentals(borrowAccidentals + fromAccidentals));
}
