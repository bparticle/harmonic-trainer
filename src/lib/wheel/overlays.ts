import {
	chordPitchClasses,
	diatonicSeventh,
	formatChord,
	type AbstractChord
} from '$lib/music/chord';
import {
	BRIGHTNESS_ORDER,
	fifthsDistance,
	formatKey,
	scale,
	scalePitchClasses,
	type Key,
	type Mode
} from '$lib/music/key';
import { pitchClass } from '$lib/music/note';
import { neighbours, sharedPitchClasses, type Neighbour } from '$lib/music/voiceleading';
import { cellsFor, mod12, positionOf, type Cell, type WheelGeometry } from './geometry';
import type { WheelConfig } from '$lib/settings';

/**
 * What each overlay draws.
 *
 * Everything here is derived from the music core — no overlay knows a pixel
 * coordinate, and none of them hardcodes a key. Rotating the wheel transposes
 * all of them for free.
 */

export type KeyOverlay = {
	scaleCells: Cell[];
	pitchClasses: number[];
	chords: Array<{ chord: AbstractChord; symbol: string; roman: string; cells: Cell[] }>;
};

const MAJOR_ROMAN = ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viim7b5'];
const MINOR_ROMAN = ['i7', 'iim7b5', 'bIIImaj7', 'iv7', 'v7', 'bVImaj7', 'bVII7'];

/** The current key: its scale shape and its seven diatonic sevenths. */
export function keyOverlay(k: Key, config: WheelConfig, geometry: WheelGeometry): KeyOverlay {
	const pitchClasses = scale(k).map(pitchClass);
	const tonic = pitchClass(k.tonic);
	const roman = k.mode === 'aeolian' ? MINOR_ROMAN : MAJOR_ROMAN;

	return {
		pitchClasses,
		scaleCells: cellsFor(pitchClasses, tonic, config, geometry),
		chords: [1, 2, 3, 4, 5, 6, 7].map((degree) => {
			const chord = diatonicSeventh(k, degree);
			const pcs = chordPitchClasses(chord);
			return {
				chord,
				symbol: formatChord(chord),
				roman: roman[degree - 1] ?? '',
				cells: cellsFor(pcs, pitchClass(chord.root), config, geometry)
			};
		})
	};
}

/** A single chord's shape. */
export function chordCells(
	chord: AbstractChord,
	config: WheelConfig,
	geometry: WheelGeometry
): Cell[] {
	return cellsFor(chordPitchClasses(chord), pitchClass(chord.root), config, geometry);
}

export type NeighbourOverlay = Neighbour & { cells: Cell[] };

/**
 * Chords a note or two away, ordered by how far the voices move.
 *
 * This is the browsing mode: start from something already under the fingers and
 * step outward. Gm7 to E♭∆ is one note, and seeing that on the wheel is the
 * point.
 */
export function neighbourOverlays(
	chord: AbstractChord,
	context: Key,
	config: WheelConfig,
	geometry: WheelGeometry,
	maxChanged = 2
): NeighbourOverlay[] {
	return neighbours(chord, context, maxChanged).map((n) => ({
		...n,
		cells: chordCells(n.chord, config, geometry)
	}));
}

// ---------------------------------------------------------------------------
// Modal brightness
// ---------------------------------------------------------------------------

/**
 * Where a scale sits on the circle of fifths.
 *
 * Any diatonic scale is seven *consecutive* circle-of-fifths positions, so it
 * reads on the wheel as one contiguous block. Darkening the mode slides that
 * block one step anticlockwise, which is exactly what the brightness axis is:
 * Lydian is furthest clockwise, Locrian furthest anti.
 */
export function scaleBlock(k: Key, config: WheelConfig): { start: number; end: number } | null {
	const positions = new Set(
		scale(k).map((n) => positionOf(pitchClass(n), 0, config))
	);
	if (positions.size !== 7) return null;

	for (let start = 0; start < 12; start++) {
		let contiguous = true;
		for (let i = 0; i < 7; i++) {
			if (!positions.has(mod12(start + i))) {
				contiguous = false;
				break;
			}
		}
		if (contiguous) return { start, end: mod12(start + 6) };
	}
	return null;
}

export type BrightnessStep = {
	mode: Mode;
	block: { start: number; end: number } | null;
	/** 0 is brightest (Lydian), 6 darkest (Locrian). */
	rank: number;
	current: boolean;
};

/** The whole brightness axis for one tonic, brightest first. */
export function brightnessAxis(k: Key, config: WheelConfig): BrightnessStep[] {
	return BRIGHTNESS_ORDER.map((mode, rank) => ({
		mode,
		rank,
		block: scaleBlock({ tonic: k.tonic, mode }, config),
		current: mode === k.mode
	}));
}

// ---------------------------------------------------------------------------
// Modulation
// ---------------------------------------------------------------------------

export type ModulationOverlay = {
	from: Key;
	to: Key;
	/** Steps apart on the circle of fifths, 0–6. */
	distance: number;
	fromPosition: number;
	toPosition: number;
	sharedPitchClasses: number[];
	sharedCells: Cell[];
	/** Chords diatonic in both keys — the hinges a modulation can turn on. */
	pivots: Array<{ symbol: string; romanInFrom: string; romanInTo: string; cells: Cell[] }>;
	summary: string;
};

/** Two keys, the arc between them, what they share and what they can pivot on. */
export function modulationOverlay(
	from: Key,
	to: Key,
	config: WheelConfig,
	geometry: WheelGeometry
): ModulationOverlay {
	const fromPcs = scalePitchClasses(from);
	const toPcs = scalePitchClasses(to);
	const shared = sharedPitchClasses([...fromPcs], [...toPcs]);

	const fromRoman = from.mode === 'aeolian' ? MINOR_ROMAN : MAJOR_ROMAN;
	const toRoman = to.mode === 'aeolian' ? MINOR_ROMAN : MAJOR_ROMAN;

	const pivots: ModulationOverlay['pivots'] = [];
	for (let degree = 1; degree <= 7; degree++) {
		const chord = diatonicSeventh(from, degree);
		const pcs = chordPitchClasses(chord);
		if (!pcs.every((pc) => toPcs.has(pc))) continue;

		// Same notes is not enough — it has to be a chord the target key builds too.
		const symbol = formatChord(chord);
		let matchedDegree = -1;
		for (let d = 1; d <= 7; d++) {
			if (formatChord(diatonicSeventh(to, d)) === symbol) {
				matchedDegree = d;
				break;
			}
		}
		if (matchedDegree < 0) continue;

		pivots.push({
			symbol,
			romanInFrom: fromRoman[degree - 1] ?? '',
			romanInTo: toRoman[matchedDegree - 1] ?? '',
			cells: cellsFor(pcs, pitchClass(chord.root), config, geometry)
		});
	}

	const distance = fifthsDistance(from, to);

	return {
		from,
		to,
		distance,
		fromPosition: positionOf(pitchClass(from.tonic), 0, config),
		toPosition: positionOf(pitchClass(to.tonic), 0, config),
		sharedPitchClasses: shared,
		sharedCells: cellsFor(shared, pitchClass(from.tonic), config, geometry),
		pivots,
		summary: summarise(from, to, distance, shared.length, pivots.length)
	};
}

function summarise(
	from: Key,
	to: Key,
	distance: number,
	sharedCount: number,
	pivotCount: number
): string {
	const steps = distance === 1 ? 'one step' : `${distance} steps`;
	const head =
		distance === 0
			? `${formatKey(from)} and ${formatKey(to)} sit on the same spot on the wheel`
			: `${formatKey(from)} to ${formatKey(to)} is ${steps} round the wheel`;

	if (pivotCount === 0) {
		return `${head}. They share ${sharedCount} notes and no diatonic chord at all, so there is nothing to pivot on — you have to go direct, or through a dominant.`;
	}
	return `${head}. They share ${sharedCount} notes and ${pivotCount} chord${pivotCount === 1 ? '' : 's'} that belong to both.`;
}

/** Position of a pitch class on the outer ring, for arcs and markers. */
export function outerPosition(pc: number, config: WheelConfig): number {
	return positionOf(pc, 0, config);
}
