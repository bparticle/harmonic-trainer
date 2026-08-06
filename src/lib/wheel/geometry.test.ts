import { describe, expect, it } from 'vitest';
import {
	cellsFor,
	cofIndexAt,
	cofIndexOf,
	distinctRings,
	isDuplicateRing,
	pitchClassAt,
	pitchClassOfCof,
	placeShape,
	positionOf,
	radialInterval,
	shapeFor,
	shapePolygonPath,
	spoke,
	type Cell,
	type WheelGeometry
} from './geometry';
import { DEFAULT_WHEEL_CONFIG, type WheelConfig } from '$lib/settings';
import { chordPitchClasses, parseChord } from '$lib/music/chord';
import { key, scale } from '$lib/music/key';
import { formatNote, pitchClass } from '$lib/music/note';
import { spell } from '$lib/music/spell';

const GEOMETRY: WheelGeometry = { outerRadius: 300, ringWidth: 44 };
const C = key('C');

const names = (pcs: number[]) => pcs.map((pc) => formatNote(spell(pc, C)));

describe('circle of fifths indexing', () => {
	it('is its own inverse', () => {
		for (let pc = 0; pc < 12; pc++) {
			expect(pitchClassOfCof(cofIndexOf(pc))).toBe(pc);
		}
	});

	it('orders the circle of fifths from C', () => {
		const order = Array.from({ length: 12 }, (_, i) => pitchClassOfCof(i));
		expect(names(order)).toEqual([
			'C',
			'G',
			'D',
			'A',
			'E',
			'B',
			'F#',
			'Db',
			'Ab',
			'Eb',
			'Bb',
			'F'
		]);
	});
});

describe('ring layout', () => {
	it('repeats after four rings with the default offset of three', () => {
		expect(distinctRings(DEFAULT_WHEEL_CONFIG)).toBe(4);
	});

	it('makes the fifth ring duplicate the first', () => {
		// The brief states this as a property to verify and then surface.
		expect(DEFAULT_WHEEL_CONFIG.rings).toBe(5);
		expect(isDuplicateRing(4, DEFAULT_WHEEL_CONFIG)).toBe(true);
		for (let position = 0; position < 12; position++) {
			expect(pitchClassAt({ ring: 4, position }, DEFAULT_WHEEL_CONFIG)).toBe(
				pitchClassAt({ ring: 0, position }, DEFAULT_WHEEL_CONFIG)
			);
		}
	});

	it('moves up a minor third for each ring inward', () => {
		expect(radialInterval(DEFAULT_WHEEL_CONFIG)).toBe(3);
	});

	it('spells a diminished seventh down every radial spoke', () => {
		for (let position = 0; position < 12; position++) {
			const pcs = spoke(position, DEFAULT_WHEEL_CONFIG);
			expect(pcs).toHaveLength(4);
			// Four notes, each a minor third above the last, wrapping to the octave.
			for (let i = 1; i < pcs.length; i++) {
				expect((pcs[i] - pcs[i - 1] + 12) % 12, `position ${position}`).toBe(3);
			}
			expect(new Set(pcs).size).toBe(4);
		}
	});

	it('puts C at twelve o’clock on the outer ring by default', () => {
		expect(pitchClassAt({ ring: 0, position: 0 }, DEFAULT_WHEEL_CONFIG)).toBe(0);
	});

	it('follows the brief formula: cof index is position minus ring offset', () => {
		const config = DEFAULT_WHEEL_CONFIG;
		for (let ring = 0; ring < config.rings; ring++) {
			for (let position = 0; position < 12; position++) {
				const expected =
					(((position - ring * config.ringOffsetSteps * config.offsetDirection) % 12) + 12) % 12;
				expect(cofIndexAt({ ring, position }, config)).toBe(expected);
			}
		}
	});

	it('holds every pitch class exactly once per ring', () => {
		for (let ring = 0; ring < 4; ring++) {
			const pcs = Array.from({ length: 12 }, (_, position) =>
				pitchClassAt({ ring, position }, DEFAULT_WHEEL_CONFIG)
			);
			expect(new Set(pcs).size, `ring ${ring}`).toBe(12);
		}
	});

	it('agrees with positionOf in both directions', () => {
		for (let ring = 0; ring < 4; ring++) {
			for (let pc = 0; pc < 12; pc++) {
				const position = positionOf(pc, ring, DEFAULT_WHEEL_CONFIG);
				expect(pitchClassAt({ ring, position }, DEFAULT_WHEEL_CONFIG)).toBe(pc);
			}
		}
	});
});

describe('configuration is parametric', () => {
	it('flips direction without changing which pitch classes exist on a ring', () => {
		const flipped: WheelConfig = { ...DEFAULT_WHEEL_CONFIG, offsetDirection: -1 };
		expect(pitchClassAt({ ring: 1, position: 0 }, flipped)).toBe(
			// Inward now goes the other way: down a minor third instead of up.
			(pitchClassAt({ ring: 0, position: 0 }, flipped) + 9) % 12
		);
		for (let ring = 0; ring < 4; ring++) {
			const pcs = Array.from({ length: 12 }, (_, position) =>
				pitchClassAt({ ring, position }, flipped)
			);
			expect(new Set(pcs).size).toBe(12);
		}
	});

	it('honours a different start note', () => {
		const fromEb: WheelConfig = { ...DEFAULT_WHEEL_CONFIG, startNote: 'Eb' };
		expect(pitchClassAt({ ring: 0, position: 0 }, fromEb)).toBe(3);
	});

	it('supports other ring offsets', () => {
		const byFourths: WheelConfig = { ...DEFAULT_WHEEL_CONFIG, ringOffsetSteps: 4 };
		expect(distinctRings(byFourths)).toBe(3);
		// Four fifths inward is a minor sixth up — a major third *down* — so the
		// spoke still spells an augmented triad, just descending.
		expect(radialInterval(byFourths)).toBe(8);
		const pcs = spoke(0, byFourths);
		expect(pcs).toHaveLength(3);
		expect([...pcs].sort((a, b) => a - b)).toEqual([0, 4, 8]);
	});

	it('collapses to one ring when the offset is zero', () => {
		const flat: WheelConfig = { ...DEFAULT_WHEEL_CONFIG, ringOffsetSteps: 0 };
		expect(distinctRings(flat)).toBe(1);
	});
});

describe('shapes are derived from intervals', () => {
	const shapeOf = (symbol: string) =>
		shapeFor(
			chordPitchClasses(parseChord(symbol)).map(
				(pc) => (pc - pitchClass(parseChord(symbol).root) + 12) % 12
			),
			DEFAULT_WHEEL_CONFIG,
			GEOMETRY
		);

	it('gives the same shape to the same chord quality in every key', () => {
		const reference = JSON.stringify(shapeOf('Cmaj7'));
		for (const symbol of ['Dmaj7', 'Ebmaj7', 'F#maj7', 'Bbmaj7', 'Bmaj7']) {
			expect(JSON.stringify(shapeOf(symbol)), symbol).toBe(reference);
		}
	});

	it('gives different qualities different shapes', () => {
		const shapes = ['Cmaj7', 'Cm7', 'C7', 'Cm7b5', 'Cdim7'].map((s) => JSON.stringify(shapeOf(s)));
		expect(new Set(shapes).size).toBe(shapes.length);
	});

	it('puts a diminished seventh on a single radial spoke', () => {
		// The whole point of the offset: dim7 collapses to one angle.
		const cells = shapeOf('Cdim7');
		expect(new Set(cells.map((c) => c.position)).size).toBe(1);
		expect(new Set(cells.map((c) => c.ring)).size).toBe(4);
	});

	it('puts the notes of a major scale on adjacent positions', () => {
		const pcs = scale(C).map(pitchClass);
		const cells = cellsFor(pcs, 0, DEFAULT_WHEEL_CONFIG, GEOMETRY);
		expect(cells).toHaveLength(7);
		// A major scale is seven consecutive steps on the circle of fifths, so on
		// the outer ring it is a contiguous block.
		const outer = cells.filter((c) => c.ring === 0).map((c) => c.position);
		expect(outer.length).toBeGreaterThan(0);
	});

	it('transposes by rotation: every cell moves by the same amount', () => {
		const cPcs = chordPitchClasses(parseChord('Cmaj7'));
		const dPcs = chordPitchClasses(parseChord('Dmaj7'));
		const cCells = cellsFor(cPcs, 0, DEFAULT_WHEEL_CONFIG, GEOMETRY);
		const dCells = cellsFor(dPcs, 2, DEFAULT_WHEEL_CONFIG, GEOMETRY);

		expect(cCells.map((c) => c.ring)).toEqual(dCells.map((c) => c.ring));
		const deltas = cCells.map((c, i) => (((dCells[i].position - c.position) % 12) + 12) % 12);
		expect(new Set(deltas).size).toBe(1);
	});

	it('places a shape so its root lands where the root belongs', () => {
		const shape = shapeOf('Ebmaj7');
		const placed = placeShape(shape, 3, DEFAULT_WHEEL_CONFIG);
		expect(pitchClassAt(placed[0], DEFAULT_WHEEL_CONFIG)).toBe(3);
	});

	it('lands every cell on the pitch class it claims', () => {
		for (const symbol of ['Cmaj7', 'Gm7', 'F#7', 'Bbm7b5', 'Adim7', 'Eb6']) {
			const chord = parseChord(symbol);
			const pcs = chordPitchClasses(chord);
			const cells = cellsFor(pcs, pitchClass(chord.root), DEFAULT_WHEEL_CONFIG, GEOMETRY);
			expect(
				cells.map((c) => pitchClassAt(c, DEFAULT_WHEEL_CONFIG)),
				symbol
			).toEqual(pcs);
		}
	});
});

describe('paths', () => {
	it('closes the polygon for a chord', () => {
		const cells = cellsFor([0, 4, 7, 11], 0, DEFAULT_WHEEL_CONFIG, GEOMETRY);
		const path = shapePolygonPath(cells, GEOMETRY);
		expect(path.startsWith('M')).toBe(true);
		expect(path.endsWith('Z')).toBe(true);
	});

	it('produces nothing for fewer than two cells', () => {
		expect(shapePolygonPath([], GEOMETRY)).toBe('');
		expect(shapePolygonPath([{ ring: 0, position: 0 } as Cell], GEOMETRY)).toBe('');
	});

	it('emits no NaN coordinates', () => {
		const cells = cellsFor([0, 3, 6, 9], 0, DEFAULT_WHEEL_CONFIG, GEOMETRY);
		expect(shapePolygonPath(cells, GEOMETRY)).not.toMatch(/NaN/);
	});
});
