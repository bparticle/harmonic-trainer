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
 * **The device.** How does the tune leave the key, if it does? Four named ways,
 * each with its own progression teaching it — see `Device` below.
 *
 * A chart demands the shapes it uses and the devices it uses. Ready means both
 * sets are covered. That is not a promise the tune is *easy* — how fast to play
 * it is the tempo ladder's question and stays there — only that nothing in it is
 * unheard-of.
 *
 * ## Where the teaching comes from
 *
 * The two halves of the drill room divide the work cleanly, and neither had to
 * be edited to make it so:
 *
 *   - **The ladder** teaches shapes, and never leaves the key. Seven rungs a
 *     key: the scale, then the triads a few at a time, then the sevenths. Every
 *     chord it builds is diatonic by construction.
 *   - **The progressions** teach devices. Levels one to three are movement
 *     inside the key; from level four each one is the first place a particular
 *     way out of the key is met.
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

/**
 * A way of leaving the key, named as a musician would name it.
 *
 * **This was an ordered three-step scale — `in_key < coloured < off_key` — and
 * that was wrong.** Walking the material proved it rather than arguing it: with
 * an ordinal, crossing one step opens every tune sitting on it, so one
 * progression unlocked eleven tunes at once and another unlocked seven. Three
 * rungs cannot describe a curriculum with twenty-three tunes on it.
 *
 * These are a **set**, exactly as the shapes are, because they are genuinely not
 * ordered. A tune full of borrowed chords is not harder or easier than one full
 * of secondary dominants; it is a different thing to learn, and each has its own
 * progression that teaches it.
 *
 *   - `blues`     a dominant seventh on I or IV, where the key asks for neither.
 *                 In no key is that correct, and it is most of a century of music.
 *   - `borrowed`  a chord from the parallel key: the minor iv, the ♭VII, the
 *                 ♭VImaj7. One note moves and the colour changes.
 *   - `secondary` a dominant aimed at a degree of the key other than the tonic —
 *                 III7, VI7, V7/vi — so a chord already inside the key arrives
 *                 like a destination.
 *   - `chromatic` a chord belonging to neither parallel key and resolving to
 *                 nothing inside it: ♭II7, ♯iv°7, ♭III7. The tune has left.
 *
 * The empty set is a tune that never leaves the key, which is the whole of what
 * the ladder teaches and what a first play-along should be.
 */
export type Device = 'blues' | 'borrowed' | 'secondary' | 'chromatic';

/** Every device, in the order a curriculum meets them. */
export const DEVICES: Device[] = ['borrowed', 'blues', 'secondary', 'chromatic'];

/** Said out loud, for a page explaining why a tune is not on offer. */
export const DEVICE_LABELS: Record<Device, string> = {
	blues: 'dominant sevenths where the key asks for none',
	borrowed: 'chords borrowed from the parallel key',
	secondary: 'dominants aimed at a chord other than the tonic',
	chromatic: 'chords belonging to no key the tune is in'
};

/** Short enough for a chip beside a tune in a list. */
export const DEVICE_CHIPS: Record<Device, string> = {
	blues: 'blues sevenths',
	borrowed: 'borrowed chords',
	secondary: 'secondary dominants',
	chromatic: 'chromatic chords'
};

/**
 * What each device weighs when tunes are put in order.
 *
 * Ordering only — nothing is ever gated on this number. Borrowing one chord from
 * the parallel key is the smallest step out of a key there is; a chord belonging
 * to neither parallel key is the largest, and weighs more than the other three
 * together so that a tune which modulates never sorts ahead of one that does not.
 */
const DEVICE_WEIGHT: Record<Device, number> = {
	borrowed: 1,
	blues: 2,
	secondary: 3,
	chromatic: 8
};

/** What a tune asks for: every shape in it, and every way it leaves the key. */
export type Demand = { shapes: Shape[]; devices: Device[] };

/** What you can answer with: the shapes and the devices you have met. */
export type Vocabulary = { shapes: Shape[]; devices: Device[] };

export const emptyVocabulary = (): Vocabulary => ({ shapes: [], devices: [] });

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
/** The natural minor exactly, which is the pool a major key borrows *from*. */
const PARALLEL_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);

const homeScale = (mode: 'major' | 'minor') => (mode === 'minor' ? MINOR_SCALE : MAJOR_SCALE);

/** The key of the same tonic and the other mode: where a borrowed chord comes from. */
const parallelScale = (mode: 'major' | 'minor') =>
	mode === 'minor' ? MAJOR_SCALE : PARALLEL_MINOR;

const wrap = (pc: number) => ((pc % 12) + 12) % 12;

/** Degrees of the key a dominant may sit on and still be the blues rather than a departure. */
const BLUES_ROOTS = new Set([0, 5]);

/**
 * How this chord leaves the key, or null if it does not.
 *
 * The order of the tests is load-bearing and worth reading as an argument.
 *
 * 1. **Everything in the key** is no device at all, and is the common case.
 * 2. **Everything in the parallel key** is `borrowed`, and this is checked
 *    before anything else because the parallel key is a real place a tune goes
 *    rather than a coincidence. It is what makes ♭VII7 the backdoor dominant
 *    instead of a chromatic accident, and the minor iv one moved note.
 * 3. **A dominant** then splits three ways. On the tonic or the fourth it is the
 *    `blues`, which in no key is correct and is the sound of most of the last
 *    century. Elsewhere, if it is rooted in the key and resolves down a fifth
 *    onto a degree of the key, it is a `secondary` dominant — aiming at
 *    something already here. Otherwise it is aiming outside, and that is
 *    `chromatic`.
 * 4. **Anything else** left over belongs to neither key and resolves to nothing
 *    in it: `chromatic`.
 */
export function deviceOf(chord: AbstractChord, mode: 'major' | 'minor'): Device | null {
	const home = homeScale(mode);
	const parallel = parallelScale(mode);
	const notes = chordPitchClasses(chord).map(wrap);
	const root = wrap(pitchClass(chord.root));

	if (notes.every((pc) => home.has(pc))) return null;
	if (notes.every((pc) => parallel.has(pc))) return 'borrowed';

	if (chord.quality === 'dom') {
		if (BLUES_ROOTS.has(root)) return 'blues';
		// Down a fifth is up a fourth. A dominant that lands on a degree of the key
		// is pointing at something you already know; one that does not has left.
		const resolvesTo = wrap(root + 5);
		return home.has(root) && home.has(resolvesTo) ? 'secondary' : 'chromatic';
	}

	return 'chromatic';
}

// ---------------------------------------------------------------------------
// Reading a grid
// ---------------------------------------------------------------------------

/**
 * C, always.
 *
 * Neither axis moves with the key — a shape is a shape in all twelve and a
 * chord is inside the key or outside it in all twelve — so the demand is read
 * once against C rather than twelve times against nothing in particular. This
 * is the same reason charts are stored as numerals in the first place.
 */
const HOME = makeKey('C');

const sortShapes = (shapes: Iterable<Shape>): Shape[] => [...new Set(shapes)].sort();

const sortDevices = (devices: Iterable<Device>): Device[] =>
	DEVICES.filter((device) => new Set(devices).has(device));

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
	const devices: Device[] = [];

	for (const numeral of numerals) {
		let chord: AbstractChord;
		try {
			chord = chordFromNumeral(numeral, HOME);
		} catch {
			shapes.push('unknown');
			devices.push('chromatic');
			continue;
		}
		shapes.push(shapeOf(chord));
		const device = deviceOf(chord, mode);
		if (device) devices.push(device);
	}

	return { shapes: sortShapes(shapes), devices: sortDevices(devices) };
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
		// Every rung is built from the scale it belongs to. No device, all seven.
		devices: []
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
		devices: sortDevices(demands.flatMap((d) => d.devices))
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
		devices: sortDevices([...ladder.devices, ...library.devices])
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
export type Shortfall = { shapes: Shape[]; devices: Device[] };

export function shortfall(demand: Demand, known: Vocabulary): Shortfall {
	const haveShapes = new Set(known.shapes);
	const haveDevices = new Set(known.devices);
	return {
		shapes: demand.shapes.filter((shape) => !haveShapes.has(shape)),
		devices: demand.devices.filter((device) => !haveDevices.has(device))
	};
}

export function isReady(demand: Demand, known: Vocabulary): boolean {
	const gap = shortfall(demand, known);
	return gap.shapes.length === 0 && gap.devices.length === 0;
}

/**
 * How far into what you know a tune reaches, as one number.
 *
 * Only ever used to put tunes in order, so that the first play-along of an
 * account is a four-chord loop and not the thirty-two bars of rhythm changes
 * that happen to have become legal on the same day. Devices count for more than
 * shapes because leaving the key is what makes a chart feel like somewhere you
 * have never been.
 */
export function reachOf(demand: Demand): number {
	const devices = demand.devices.reduce((total, device) => total + DEVICE_WEIGHT[device], 0);
	return devices * 10 + demand.shapes.length;
}

/** One line saying what a tune would need. For a page that has to explain a hole. */
export function describeShortfall(gap: Shortfall): string {
	const parts: string[] = [];

	const named = gap.shapes.filter((shape) => shape !== 'unknown');
	if (named.length) parts.push(named.join(', '));
	if (named.length !== gap.shapes.length) parts.push('chords this app cannot read');
	for (const device of gap.devices) parts.push(DEVICE_LABELS[device]);

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
export function taughtBy(gap: Shortfall): string[] {
	const wantedShapes = new Set(gap.shapes);
	const wantedDevices = new Set(gap.devices);

	return PROGRESSIONS.filter((progression) => {
		const demand = demandOfNumerals(progression.numerals, progression.mode);
		if (demand.shapes.some((shape) => wantedShapes.has(shape))) return true;
		return demand.devices.some((device) => wantedDevices.has(device));
	})
		.sort((a, b) => a.level - b.level)
		.map((progression) => progression.id);
}

/** Every rung, for a caller that wants the whole ladder's vocabulary. */
export const ALL_RUNGS: RungId[] = RUNGS.map((rung) => rung.id);
