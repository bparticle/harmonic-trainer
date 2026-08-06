import { ivl, transpose } from '$lib/music/interval';
import { parseNote, pitchClass, type Note } from '$lib/music/note';
import type { WheelConfig } from '$lib/settings';

/**
 * Geometry of the harmonic wheel.
 *
 * Five nested circles of fifths, each ring rotated relative to the one outside
 * it. Angular position is the circle of fifths; moving inward one ring is a
 * fixed number of fifths, which with the default offset of three works out as a
 * minor third. That is what makes a radial spoke spell a diminished seventh and
 * the fifth ring duplicate the first — both verified in the tests, and both
 * surfaced in the UI, because they are what makes diminished symmetry and
 * tritone substitution visible rather than theoretical.
 *
 * Nothing here draws anything. Shapes are *derived* from interval sets as
 * relative cell offsets, which is why transposing a chord rotates its shape
 * instead of recomputing it.
 */

export type Cell = { ring: number; position: number };
export type Point = { x: number; y: number };

/** A shape drawn over the wheel. Rendering concern, but shared by both sides. */
export type Highlight = {
	cells: Cell[];
	/** Draw a closed outline through the cell centres. */
	outline?: boolean;
	/** 0–1; dims the overlay without changing its hue. */
	strength?: number;
	label?: string;
};

/** Radii the renderer draws at. Separate from the harmonic layout above. */
export type WheelGeometry = {
	outerRadius: number;
	ringWidth: number;
};

const TAU = Math.PI * 2;

export const mod12 = (n: number) => (((n % 12) + 12) % 12);

function gcd(a: number, b: number): number {
	return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/**
 * Pitch class to circle-of-fifths index, and back.
 *
 * Both directions multiply by seven, because seven fifths is seven semitones
 * and 7 × 7 = 49 ≡ 1 (mod 12) — the map is its own inverse. Two names are kept
 * because the call sites mean different things.
 */
export const cofIndexOf = (pc: number) => mod12(pc * 7);
export const pitchClassOfCof = (cof: number) => mod12(cof * 7);

/** Circle-of-fifths index sitting at twelve o'clock on the outermost ring. */
export function startCof(config: WheelConfig): number {
	return cofIndexOf(pitchClass(parseNote(config.startNote)));
}

/**
 * How many rings before the pattern repeats. With an offset of three this is
 * four, so a five-ring wheel has its fifth ring duplicating its first.
 */
export function distinctRings(config: WheelConfig): number {
	const steps = mod12(config.ringOffsetSteps);
	return steps === 0 ? 1 : 12 / gcd(12, steps);
}

/** True when this ring is a repeat of one further out. */
export function isDuplicateRing(ring: number, config: WheelConfig): boolean {
	return ring >= distinctRings(config);
}

function ringShift(ring: number, config: WheelConfig): number {
	return ring * config.ringOffsetSteps * config.offsetDirection;
}

/** Circle-of-fifths index held by a cell. This is the brief's formula. */
export function cofIndexAt(cell: Cell, config: WheelConfig): number {
	return mod12(cell.position - ringShift(cell.ring, config) + startCof(config));
}

export function pitchClassAt(cell: Cell, config: WheelConfig): number {
	return pitchClassOfCof(cofIndexAt(cell, config));
}

/** Where a pitch class sits on a given ring. */
export function positionOf(pc: number, ring: number, config: WheelConfig): number {
	return mod12(cofIndexOf(pc) - startCof(config) + ringShift(ring, config));
}

/**
 * The pitch classes down a radial spoke, outermost first.
 *
 * With the default configuration this is a diminished seventh chord, and that
 * is not a coincidence worth hiding: it is why the wheel makes dim7 symmetry
 * and tritone substitution legible at a glance.
 */
export function spoke(position: number, config: WheelConfig): number[] {
	return Array.from({ length: distinctRings(config) }, (_, ring) =>
		pitchClassAt({ ring, position }, config)
	);
}

/**
 * The wheel's own note names, which never change.
 *
 * The labels on a physical wheel are painted on. Turning it does not rewrite
 * them, so neither should this: re-spelling every cell against the current key
 * meant rotating from C to G♭ silently rewrote F♯ as G♭ everywhere, which reads
 * as the object changing under your hands.
 *
 * Spelling comes from distance along the circle of fifths instead. Up to six
 * fifths clockwise takes sharps; past that it is shorter to come back
 * anticlockwise with flats. That yields the conventional set — C D♭ D E♭ E F F♯
 * G A♭ A B♭ B — whatever key is in play.
 *
 * Key-dependent spelling still belongs everywhere else: a chord symbol in G♭
 * must read G♭∆, not F♯∆. That is `spell()`'s job, not this one.
 */
export function wheelNoteName(pc: number): Note {
	const cof = cofIndexOf(pc);
	const C: Note = { letter: 'C', alter: 0, octave: 4 };

	// Down a fifth and up a fourth land on the same pitch class, so both
	// directions can be walked with an ascending interval.
	const steps = cof <= 6 ? cof : 12 - cof;
	const interval = cof <= 6 ? ivl('P5') : ivl('P4');

	let note = C;
	for (let i = 0; i < steps; i++) note = transpose(note, interval);
	return { ...note, octave: 4 };
}

/** Semitones gained by moving inward one ring at the same angle. */
export function radialInterval(config: WheelConfig): number {
	return mod12(pitchClassOfCof(-config.ringOffsetSteps * config.offsetDirection));
}

// ---------------------------------------------------------------------------
// Rendering coordinates
// ---------------------------------------------------------------------------

/** Angle of a position, in radians, with position zero at twelve o'clock. */
export function angleOf(position: number): number {
	return (position / 12) * TAU - Math.PI / 2;
}

export function ringRadii(ring: number, geometry: WheelGeometry) {
	const outer = geometry.outerRadius - ring * geometry.ringWidth;
	return { outer, inner: outer - geometry.ringWidth };
}

export function cellCentre(cell: Cell, geometry: WheelGeometry): Point {
	const angle = angleOf(cell.position);
	const { outer, inner } = ringRadii(cell.ring, geometry);
	const radius = (outer + inner) / 2;
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function distanceBetween(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * The shape of an interval set, as cell offsets from a root at (ring 0,
 * position 0).
 *
 * Each note could sit on any ring — every pitch class appears once per ring —
 * so the compact one is chosen: whichever cell renders closest to the root.
 * The result depends only on the intervals, never on the key, which is exactly
 * why rotating the wheel transposes a shape for free.
 */
export function shapeFor(
	semitonesFromRoot: number[],
	config: WheelConfig,
	geometry: WheelGeometry
): Cell[] {
	const rings = distinctRings(config);
	const origin = cellCentre({ ring: 0, position: 0 }, geometry);

	return semitonesFromRoot.map((semitones) => {
		const cofDelta = cofIndexOf(mod12(semitones));

		let best: { cell: Cell; distance: number } | null = null;
		for (let ring = 0; ring < rings; ring++) {
			const cell: Cell = { ring, position: mod12(cofDelta + ringShift(ring, config)) };
			const distance = distanceBetween(cellCentre(cell, geometry), origin);
			if (!best || distance < best.distance) best = { cell, distance };
		}
		return best!.cell;
	});
}

/** Place a shape so its root lands on `rootPc`, on the outermost ring. */
export function placeShape(shape: Cell[], rootPc: number, config: WheelConfig): Cell[] {
	const rootPosition = positionOf(rootPc, 0, config);
	return shape.map((cell) => ({
		ring: cell.ring,
		position: mod12(cell.position + rootPosition)
	}));
}

/** Cells occupied by a set of pitch classes, anchored on a root. */
export function cellsFor(
	pitchClasses: number[],
	rootPc: number,
	config: WheelConfig,
	geometry: WheelGeometry
): Cell[] {
	const semitones = pitchClasses.map((pc) => mod12(pc - rootPc));
	return placeShape(shapeFor(semitones, config, geometry), rootPc, config);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function polar(angle: number, radius: number): Point {
	return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** The annular sector a cell occupies, as an SVG path. */
export function cellSectorPath(
	cell: Cell,
	geometry: WheelGeometry,
	padAngle = 0.012,
	padRadius = 1.5
): string {
	const half = TAU / 24 - padAngle;
	const centre = angleOf(cell.position);
	const { outer, inner } = ringRadii(cell.ring, geometry);
	const ro = outer - padRadius;
	const ri = inner + padRadius;

	const a0 = centre - half;
	const a1 = centre + half;
	const p1 = polar(a0, ro);
	const p2 = polar(a1, ro);
	const p3 = polar(a1, ri);
	const p4 = polar(a0, ri);

	return [
		`M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
		`A ${ro} ${ro} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
		`L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
		`A ${ri} ${ri} 0 0 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
		'Z'
	].join(' ');
}

/**
 * A closed polygon through the centres of a set of cells, ordered around their
 * centroid so it never crosses itself.
 *
 * This is the outline that makes a chord read as one rigid object — the thing
 * that stays the same shape when you rotate the wheel.
 */
export function shapePolygonPath(cells: Cell[], geometry: WheelGeometry): string {
	if (cells.length === 0) return '';
	const points = cells.map((cell) => cellCentre(cell, geometry));
	if (points.length === 1) return '';

	const centroid = points.reduce(
		(acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }),
		{ x: 0, y: 0 }
	);

	const ordered = [...points].sort(
		(a, b) =>
			Math.atan2(a.y - centroid.y, a.x - centroid.x) -
			Math.atan2(b.y - centroid.y, b.x - centroid.x)
	);

	return (
		ordered
			.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
			.join(' ') + ' Z'
	);
}

/** An arc between two positions, used for modulation distance and brightness. */
export function arcPath(
	fromPosition: number,
	toPosition: number,
	radius: number,
	clockwise = true
): string {
	const a0 = angleOf(fromPosition);
	const a1 = angleOf(toPosition);
	const p0 = polar(a0, radius);
	const p1 = polar(a1, radius);

	const sweep = clockwise ? 1 : 0;
	const delta = mod12(clockwise ? toPosition - fromPosition : fromPosition - toPosition);
	const largeArc = delta > 6 ? 1 : 0;

	return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}
