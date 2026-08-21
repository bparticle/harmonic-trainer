import { chordPitchClasses, type AbstractChord, type ChordQuality } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';
import { itemsForRung, RUNGS, STAGES, type RungId } from './ladder';
import { chordFromNumeral, PROGRESSIONS, progressionById } from './progressions';

/**
 * What a tune asks of you, and what you have been shown.
 *
 * This exists because of a gap you could fall down. The drill room would ask
 * for a C triad and the seven notes of C major — the first two rungs, and
 * genuinely easy — and the same workout would then send you to the play-along
 * page to get round a three-tonic cycle: Cmaj7, E♭7, A♭maj7, B7, chords nobody
 * had mentioned, in keys nobody had been to. The two halves of a workout were
 * composed by modules that had never been introduced.
 *
 * The fix is not a difficulty number typed onto each chart. A hand-written
 * rating is a second opinion about the material that drifts the moment a grid
 * is edited, and it cannot say *which* chord is the problem. Instead a chart
 * states its own demand, derived from the grid it already has, and the ladder
 * and the progression library state what they teach, derived from the chords
 * they already build. A mission is set only where the second covers the first.
 *
 * ## Two axes, because there are two ways to be lost
 *
 * **The shape.** Can your hands make this chord at all? A dominant seventh is a
 * different thing to learn than a minor triad, and the complaint that started
 * this said so exactly: *chords I need to study one by one, practice the
 * shapes, get to know the names*. Shapes are counted without regard to where
 * they sit, because a B♭m7 is the same hand as a Dm7.
 *
 * **The ground.** How far from the key does the chord stand? Three steps, and
 * they are ordered:
 *
 *   - `in_key`   every note is in the key. The seven triads, the seven sevenths.
 *   - `coloured` the root is a degree of the key but a note is not: the blues
 *                I7, a secondary dominant, a borrowed iv. One foot outside.
 *   - `off_key`  the root itself is not in the key: ♭II7, ♯iv°7, ♭III7. The
 *                tune has left, whether for a bar or for good.
 *
 * A chart demands the union of its shapes and the furthest ground it stands on.
 * You know a shape once anything has taught it, and you stand on ground once
 * anything has taken you there. Ready means every shape known and the ground
 * reached — which is not a promise the tune is *easy*, only that nothing in it
 * is unheard-of. How fast to play it is the tempo ladder's question and stays
 * there.
 *
 * ## Where the teaching comes from
 *
 * The two halves of the drill room turn out to divide the work cleanly, and
 * neither had to be edited to make it so:
 *
 *   - **The ladder** teaches shapes, all of them on home ground. Seven rungs a
 *     key: the scale, then the triads a few at a time, then the sevenths.
 *   - **The progressions** teach ground. The blues is where a dominant seventh
 *     first sits somewhere it has no business sitting; the tritone sub and the
 *     backdoor are where the root itself leaves the key. Level 5 of that
 *     library is exactly the chromatic vocabulary, and now it unlocks something.
 *
 * Both are read through the same classifier below, so "what a progression
 * teaches" and "what a chart demands" cannot be measured on different rulers.
 *
 * Pure, and deliberately so: no clock, no database, no browser. The composer is
 * pure and this is one of its inputs.
 */

// ---------------------------------------------------------------------------
// The two axes
// ---------------------------------------------------------------------------

/**
 * A chord shape, at the grain a pair of hands cares about.
 *
 * Folded rather than one-per-quality, and the fold is about the hand rather
 * than about the theory. A C6 is a C major triad with a sixth on top and the
 * chart prints the symbol, so it does not wait on a rung of its own; a
 * fully-diminished seventh is the vii° you already met with the stack carried
 * one third further. What is *not* folded is anything whose middle changes: a
 * minor seventh is not a minor triad plus colour, it is the sound the whole of
 * the sevenths rung exists to teach.
 *
 * `unknown` is the honest answer for a numeral this app cannot parse, which is
 * possible on a chart typed in by hand. Nothing teaches it, so a chart holding
 * one is never set as a mission and is still there to be opened by choice.
 */
export type Shape =
	| 'major'
	| 'minor'
	| 'diminished'
	| 'augmented'
	| 'suspended'
	| 'major seventh'
	| 'minor seventh'
	| 'dominant seventh'
	| 'half-diminished'
	| 'minor-major seventh'
	| 'unknown';

/** How far from the key a chord stands. Ordered; `GROUND_ORDER` is the order. */
export type Ground = 'in_key' | 'coloured' | 'off_key';

export const GROUND_ORDER: Record<Ground, number> = { in_key: 0, coloured: 1, off_key: 2 };

/** Said out loud, for a page that has to explain why a tune is not on offer. */
export const GROUND_LABELS: Record<Ground, string> = {
	in_key: 'chords from inside the key',
	coloured: 'chords that borrow a note from outside the key',
	off_key: 'chords rooted outside the key'
};

/** Where each step of the ground is first met, for the same sentence. */
export const GROUND_TAUGHT_BY: Record<Ground, string> = {
	in_key: 'the triads and sevenths of a key',
	coloured: 'the blues, and the secondary dominants',
	off_key: 'the tritone sub, and the backdoor cadence'
};

/** What a tune asks for: every shape in it, and the furthest it goes from home. */
export type Demand = { shapes: Shape[]; ground: Ground };

/** What you can answer with: the shapes you have met, and how far you have been. */
export type Vocabulary = { shapes: Shape[]; ground: Ground };

export const emptyVocabulary = (): Vocabulary => ({ shapes: [], ground: 'in_key' });

// ---------------------------------------------------------------------------
// Reading one chord
// ---------------------------------------------------------------------------

/**
 * Does this chord carry a seventh?
 *
 * Three ways it can, and all three are the same fact. Some qualities are a
 * seventh by definition — a dominant with the seventh taken off is a major
 * triad and a different chord — and any extension at all implies one, because
 * a ninth with no seventh under it is an `add9` and this codebase keeps those
 * in a separate field precisely so that rule can be trusted here.
 */
const SEVENTH_BY_QUALITY = new Set<ChordQuality>(['dom', 'dim7', 'minMaj']);

const hasSeventh = (chord: AbstractChord): boolean =>
	SEVENTH_BY_QUALITY.has(chord.quality) || chord.extensions.length > 0;

/** The shape a chord makes. See `Shape` for what is folded together and why. */
export function shapeOf(chord: AbstractChord): Shape {
	const seventh = hasSeventh(chord);
	switch (chord.quality) {
		case 'dom':
			return 'dominant seventh';
		case 'dim7':
			return 'diminished';
		case 'aug':
			return 'augmented';
		case 'sus2':
		case 'sus4':
			return 'suspended';
		case 'maj6':
			return 'major';
		case 'min6':
			return 'minor';
		case 'minMaj':
			return 'minor-major seventh';
		case 'min7b5':
			return seventh ? 'half-diminished' : 'diminished';
		case 'maj':
			return seventh ? 'major seventh' : 'major';
		case 'min':
			return seventh ? 'minor seventh' : 'minor';
	}
}

/**
 * The notes a key is allowed to contain, as offsets from its tonic.
 *
 * Major is the major scale and nothing else. Minor is the natural minor **plus
 * the raised seventh**, and that is not a hedge: the V of a minor key is a
 * dominant in every minor tune ever written, and a model that called it foreign
 * would rate a minor ii–V as more distant than a tritone sub. The leading note
 * is part of what "minor key" means to a player, so it is part of it here.
 */
const MAJOR_SCALE = new Set([0, 2, 4, 5, 7, 9, 11]);
const MINOR_SCALE = new Set([0, 2, 3, 5, 7, 8, 10, 11]);

const scaleFor = (mode: 'major' | 'minor') => (mode === 'minor' ? MINOR_SCALE : MAJOR_SCALE);

const wrap = (pc: number) => ((pc % 12) + 12) % 12;

/** How far from home one chord stands, in the mode the chart is announced in. */
export function groundOf(chord: AbstractChord, mode: 'major' | 'minor'): Ground {
	const inKey = scaleFor(mode);
	const root = wrap(pitchClass(chord.root));
	if (!inKey.has(root)) return 'off_key';
	return chordPitchClasses(chord).every((pc) => inKey.has(wrap(pc))) ? 'in_key' : 'coloured';
}

// ---------------------------------------------------------------------------
// Reading a grid
// ---------------------------------------------------------------------------

/**
 * C, always.
 *
 * Neither axis moves with the key — a shape is a shape in all twelve and a
 * root is inside the key or outside it in all twelve — so the demand is read
 * once against C rather than twelve times against nothing in particular. This
 * is the same reason charts are stored as numerals in the first place.
 */
const HOME = makeKey('C');

const worst = (grounds: Ground[]): Ground =>
	grounds.reduce<Ground>(
		(far, one) => (GROUND_ORDER[one] > GROUND_ORDER[far] ? one : far),
		'in_key'
	);

const sortShapes = (shapes: Iterable<Shape>): Shape[] => [...new Set(shapes)].sort();

/**
 * What a list of Roman numerals asks for.
 *
 * The one place a numeral becomes a demand, used on charts and on progressions
 * alike. A numeral this app cannot read contributes the `unknown` shape rather
 * than an exception — a chart typed in by hand is allowed to hold a symbol the
 * parser has never seen, and the consequence should be that it is never *set*
 * for you, not that the workout fails to compose.
 */
export function demandOfNumerals(numerals: string[], mode: 'major' | 'minor'): Demand {
	const shapes: Shape[] = [];
	const grounds: Ground[] = [];

	for (const numeral of numerals) {
		let chord: AbstractChord;
		try {
			chord = chordFromNumeral(numeral, HOME);
		} catch {
			shapes.push('unknown');
			grounds.push('off_key');
			continue;
		}
		shapes.push(shapeOf(chord));
		grounds.push(groundOf(chord, mode));
	}

	return { shapes: sortShapes(shapes), ground: worst(grounds) };
}

/**
 * What a chart asks for.
 *
 * A bar holds one or two numerals separated by a space, which is the grid's own
 * convention and is read here rather than anywhere new.
 */
export function demandOfGrid(grid: string[][], mode: 'major' | 'minor'): Demand {
	return demandOfNumerals(
		grid.flatMap((row) => row.flatMap((bar) => bar.split(/\s+/).filter(Boolean))),
		mode
	);
}

// ---------------------------------------------------------------------------
// What the drill room teaches
// ---------------------------------------------------------------------------

/**
 * The shapes a rung teaches, read off the chords the rung actually builds.
 *
 * Derived rather than listed, so a rung that changes what it asks changes what
 * it unlocks in the same edit. Read on the C stage because, again, a shape is a
 * shape in all twelve — the relative minor's triads are minor triads whether
 * the stage is C or G♭.
 */
export function shapesForRung(rungId: RungId): Shape[] {
	return sortShapes(
		itemsForRung(rungId, STAGES[0])
			.map((item) => item.chord)
			.filter((chord): chord is AbstractChord => Boolean(chord))
			.map(shapeOf)
	);
}

/** Everything a set of reached rungs teaches. Keys do not come into it. */
export function vocabularyFromRungs(rungIds: Iterable<RungId>): Vocabulary {
	const seen = new Set<RungId>(rungIds);
	return {
		shapes: sortShapes([...seen].flatMap(shapesForRung)),
		// Every rung is built from the scale it belongs to. Home ground, all seven.
		ground: 'in_key'
	};
}

/** Everything a set of met progressions teaches, ids as `PROGRESSIONS` names them. */
export function vocabularyFromProgressions(ids: Iterable<string>): Vocabulary {
	const demands = [...new Set(ids)]
		.map(progressionById)
		.filter((p): p is NonNullable<typeof p> => Boolean(p))
		.map((p) => demandOfNumerals(p.numerals, p.mode));

	return {
		shapes: sortShapes(demands.flatMap((d) => d.shapes)),
		ground: worst(demands.map((d) => d.ground))
	};
}

/** The two halves of the drill room, added up. */
export function vocabularyOf(input: {
	rungs: Iterable<RungId>;
	progressions?: Iterable<string>;
}): Vocabulary {
	const ladder = vocabularyFromRungs(input.rungs);
	const library = vocabularyFromProgressions(input.progressions ?? []);
	return {
		shapes: sortShapes([...ladder.shapes, ...library.shapes]),
		ground: worst([ladder.ground, library.ground])
	};
}

// ---------------------------------------------------------------------------
// The comparison
// ---------------------------------------------------------------------------

/**
 * What this tune would ask of you that nobody has shown you yet.
 *
 * Empty on both counts is what "ready" means, and returning the gap rather than
 * a boolean is deliberate: a page that can only say *not yet* is a locked door,
 * and a page that can say *you have not met a dominant seventh* is a curriculum.
 */
export function shortfall(
	demand: Demand,
	known: Vocabulary
): { shapes: Shape[]; ground: Ground | null } {
	const have = new Set(known.shapes);
	return {
		shapes: demand.shapes.filter((shape) => !have.has(shape)),
		ground: GROUND_ORDER[demand.ground] > GROUND_ORDER[known.ground] ? demand.ground : null
	};
}

export function isReady(demand: Demand, known: Vocabulary): boolean {
	const gap = shortfall(demand, known);
	return gap.shapes.length === 0 && gap.ground === null;
}

/**
 * How far into what you know a tune reaches, as one number.
 *
 * Only ever used to put the ready tunes in order, so that the first play-along
 * of an account is the four-chord loop and not the thirty-two bars of rhythm
 * changes that happen to have become legal on the same day. Ground counts for
 * more than shape count because leaving the key is the thing that makes a chart
 * feel like somewhere you have never been.
 */
export function reachOf(demand: Demand): number {
	return GROUND_ORDER[demand.ground] * 10 + demand.shapes.length;
}

/** One line saying what a tune would need. For the page that has to explain a hole. */
export function describeShortfall(gap: { shapes: Shape[]; ground: Ground | null }): string {
	const parts: string[] = [];
	if (gap.shapes.length) {
		const named = gap.shapes.filter((shape) => shape !== 'unknown');
		if (named.length) parts.push(named.join(', '));
		if (named.length !== gap.shapes.length) parts.push('chords this app cannot read');
	}
	if (gap.ground) parts.push(GROUND_LABELS[gap.ground]);
	if (parts.length === 0) return '';
	const last = parts.pop() as string;
	return parts.length ? `${parts.join(', ')} and ${last}` : last;
}

/**
 * Every progression that would teach one of these, nearest first.
 *
 * The other half of refusing to be a locked door: having said what is missing,
 * this says where to go and get it. Ordered by the library's own levels, so the
 * answer to "how do I unlock the blues" is the blues rather than the tritone
 * sub that would also technically do it.
 */
export function taughtBy(gap: { shapes: Shape[]; ground: Ground | null }): string[] {
	const wantedShapes = new Set(gap.shapes);
	return PROGRESSIONS.filter((progression) => {
		const demand = demandOfNumerals(progression.numerals, progression.mode);
		if (demand.shapes.some((shape) => wantedShapes.has(shape))) return true;
		return gap.ground !== null && demand.ground === gap.ground;
	})
		.sort((a, b) => a.level - b.level)
		.map((progression) => progression.id);
}

/** Every rung, for a caller that wants the whole ladder's vocabulary. */
export const ALL_RUNGS: RungId[] = RUNGS.map((rung) => rung.id);
