import { chordPitchClasses, type AbstractChord, type ChordQuality } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { keyChangesIn } from '$lib/music/analyse';
import { pitchClass } from '$lib/music/note';
import { itemsForRung, RUNGS, STAGES, type RungId } from './ladder';
import { chordFromNumeral, PROGRESSIONS, progressionById } from './progressions';
import { RELATION_ORDER, relationBetween, type Relation } from './crossing';

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
 * ## Four axes, because there are four ways to be lost
 *
 * **The shape.** Can your hands make this chord at all? A dominant seventh is a
 * different thing to learn than a minor triad, and the complaint that started
 * this said so exactly: *chords I need to study one by one, practice the
 * shapes, get to know the names*. Shapes are counted without regard to where
 * they sit, because a B♭m7 is the same hand as a Dm7.
 *
 * **The device.** How does a *chord* colour its way out of the key, if it does
 * — a blues seventh, a borrowed iv, a secondary dominant — without the tonal
 * centre itself moving. Four named ways, each with its own progression teaching
 * it — see `Device` below.
 *
 * **The crossing.** Does the tune actually *modulate* — leave one key and
 * settle in another? This is the axis M17 added, and it exists because the
 * first two could not tell the difference between a coloured chord and a real
 * key change: read one chord at a time against a single reference key, a tune
 * that establishes a genuine new tonic came back as a fistful of `chromatic`
 * chords, indistinguishable from a tritone sub. `crossing.ts`'s `Relation` is
 * the vocabulary — the relative, the dominant, the subdominant, the parallel,
 * or `other` for everything further out — and it is taught by the crossing
 * exercises rather than by the progression library.
 *
 * **The tonality.** Is the tune in a major key or a minor one, and have you been
 * shown a minor key at all? This is the axis the bugfixing pass added, and it is
 * emphatically *not* the same question as whether your hands can make a minor
 * triad. The two came apart in the worst possible place. The ladder teaches
 * minor triads on its fourth rung — as the ii, iii and vi of a major key — so a
 * minor-mode tune cleared the shape gate long before anybody had been shown a
 * minor key to play it in. And `realiseChart` resolves numerals against the
 * major scale, so the key such a tune landed in was the **parallel** minor.
 * Somebody who had just been taught that the relative minor of C is A minor was
 * handed St. James Infirmary in C minor: Cm, Fm, G7, three flats, and no rung
 * anywhere on this ladder that teaches them. The relative minor rung is what
 * opens a minor key, it opens exactly one per stage, and that is the fact this
 * axis carries.
 *
 * A chart demands the shapes it uses, the devices it uses, the crossings it
 * makes, and the tonality it sits in. Ready means all four are covered. That is
 * not a promise the tune is *easy* — how fast to play it is the tempo ladder's
 * question and stays there — only that nothing in it is unheard-of.
 *
 * ## Where the teaching comes from
 *
 * Three sources, and none of them had to be edited to make this true:
 *
 *   - **The ladder** teaches shapes, and never leaves the key. Seven rungs a
 *     key: the scale, then the triads a few at a time, then the sevenths. Every
 *     chord it builds is diatonic by construction.
 *   - **The progressions** teach devices. Levels one to three are movement
 *     inside the key; from level four each one is the first place a particular
 *     way out of the key is met.
 *   - **Nothing teaches relations.** The crossing exercises did — all four near
 *     relations, from the first morning of an account — and two of the three
 *     have been withdrawn for asking far too much far too early. What is left
 *     teaches a pivot chord rather than the crossing it turns. See the note on
 *     `vocabularyOf` below, including the measurement that says no tune is lost
 *     by this.
 *   - **The relative minor rung** teaches the minor tonality, and is the only
 *     thing that does. A progression written in the minor is *material* in a
 *     minor key rather than a teacher of one — it has to be placed in a minor
 *     key itself, and can only be placed in one the ladder has opened.
 *
 * All three are read through the same classifier below, so "what a progression
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

/**
 * Major or minor, as a place to be rather than as a chord quality.
 *
 * A scalar on a demand and a set on a vocabulary, because a tune sits in exactly
 * one of them and a player may have been shown either or both.
 */
export type Tonality = 'major' | 'minor';

/** Said in a shortfall sentence, and short enough for a chip beside a tune. */
export const TONALITY_LABELS: Record<Tonality, string> = {
	major: 'a major key',
	minor: 'a minor key — the relative minor rung opens one'
};

export const TONALITY_CHIPS: Record<Tonality, string> = {
	major: 'major key',
	minor: 'minor key'
};

/**
 * What a tune asks for: every shape in it, every way it colours out of the key,
 * every key it actually goes to, and whether it sits in a major key or a minor.
 */
export type Demand = {
	shapes: Shape[];
	devices: Device[];
	crossings: Relation[];
	tonality: Tonality;
};

/** What you can answer with: the shapes, devices, crossings and keys you have met. */
export type Vocabulary = {
	shapes: Shape[];
	devices: Device[];
	crossings: Relation[];
	tonalities: Tonality[];
};

export const emptyVocabulary = (): Vocabulary => ({
	shapes: [],
	devices: [],
	crossings: [],
	tonalities: []
});

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
 *
 * `tonicPc` re-anchors all of the above onto a key other than C. Every caller
 * before M17 was inside a single fixed key and never passed it, so it defaults
 * to 0 and nothing about their reading changes. `demandOfNumerals` is the one
 * caller that does pass it, for a chord that a modulation has carried into a
 * different key: `home` and `parallel` stay the same two shapes, and shifting
 * the chord's own pitch classes by the new tonic is the same test asked from
 * where the tune actually is rather than from where it started.
 */
export function deviceOf(
	chord: AbstractChord,
	mode: 'major' | 'minor',
	tonicPc = 0
): Device | null {
	const home = homeScale(mode);
	const parallel = parallelScale(mode);
	const notes = chordPitchClasses(chord).map((pc) => wrap(pc - tonicPc));
	const root = wrap(pitchClass(chord.root) - tonicPc);

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
 * C, always. Minor charts get C's *aeolian*, for the one place mode actually
 * matters here.
 *
 * Neither of the first two axes moves with the key — a shape is a shape in all
 * twelve and a chord is inside the key or outside it in all twelve — so the
 * demand is read once against C rather than twelve times against nothing in
 * particular. This is the same reason charts are stored as numerals in the
 * first place. Numeral resolution itself is always against `HOME`, major or
 * minor tune alike — see `chordFromNumeral`'s own note and `realiseChart`'s —
 * so only the crossing detector, which has to test scale membership rather
 * than just build a chord, needs the minor variant at all.
 */
const HOME = makeKey('C');
const HOME_MINOR = makeKey('C', 'aeolian');

const sortShapes = (shapes: Iterable<Shape>): Shape[] => [...new Set(shapes)].sort();

const sortDevices = (devices: Iterable<Device>): Device[] =>
	DEVICES.filter((device) => new Set(devices).has(device));

/** Near to far, the same order `crossing.ts` teaches them in. */
const sortCrossings = (relations: Iterable<Relation>): Relation[] =>
	RELATION_ORDER.filter((relation) => new Set(relations).has(relation));

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
	// Only the numerals that actually parsed, in order, because a crossing is
	// found by walking real chords — a numeral this app cannot read has already
	// been counted, above, as the `unknown` shape and the `chromatic` device, and
	// asking a modulation detector to make sense of a gap would only teach it the
	// wrong tune.
	const chords: AbstractChord[] = [];

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
		chords.push(chord);
	}

	/*
	 * Where this actually goes, read off the same chords the shape pass just
	 * built. `keyChangesIn` is the wheel's own modulation detector — the one
	 * that finds a resolved ii–V–I and walks back for its pivot — so a chart's
	 * demand and the analysis view can never disagree about what counts as a
	 * modulation.
	 *
	 * The starting key follows `mode` even though numeral resolution never does:
	 * `chordFromNumeral` always reads against the major scale, by the same
	 * convention `realiseChart` documents, but the detector also has to test
	 * scale *membership* to know when a passage has left home, and a minor
	 * tune's home is the aeolian scale, not the major one built on the same
	 * letter.
	 */
	const startKey = mode === 'minor' ? HOME_MINOR : HOME;
	const changes = keyChangesIn(chords, startKey);
	const crossings = changes.map((change) => relationBetween(change.fromKey, change.toKey));

	/*
	 * Devices, read against wherever the tune actually is when each chord
	 * sounds — not always against C.
	 *
	 * This is the fix pass four is for, and it is not only about adding a third
	 * axis: a chord inside a passage that has genuinely modulated is at home in
	 * the key it modulated *to*, and asking `deviceOf` about it against the
	 * tune's original key was always going to say otherwise, because nothing
	 * about that question knows the tune has moved. Left uncorrected, a tune
	 * that fully establishes the dominant for sixteen bars would demand both
	 * the `chromatic` device *and* the `dominant` crossing for the same sixteen
	 * bars — one true fact about the tune, counted as two unrelated demands,
	 * one of which nothing has ever taught. Two built-in charts hit exactly
	 * this and became permanently unreachable the first time this shipped
	 * without the correction: `walk.test.ts`'s "everything eventually opens"
	 * is what caught it.
	 *
	 * The key in force at chord `i` is read the way `analyse()` reads it —
	 * `findLast` over the changes for the last one to take over at or before
	 * `i` — rather than a cursor stepping through `changes` in lockstep with
	 * `i`. A cursor only lands on a modulation whose `at` it hits exactly and
	 * in array order, so a pair of close modulations whose pivots walked back
	 * out of order would leave one of them never applied and the wheel's
	 * analysis and this demand quietly disagreeing about a chord's key.
	 * `deviceOf`'s `tonicPc` is what makes "at home in G" a different
	 * pitch-class test from "at home in C" without a second copy of the four
	 * rules it tests.
	 */
	const activeMode = (k: { mode: string }): 'major' | 'minor' =>
		k.mode === 'aeolian' ? 'minor' : 'major';
	for (let i = 0; i < chords.length; i++) {
		const change = changes.findLast((c) => c.at <= i);
		const activeKey = change ? change.toKey : startKey;
		const device = deviceOf(chords[i], activeMode(activeKey), pitchClass(activeKey.tonic));
		if (device) devices.push(device);
	}

	return {
		shapes: sortShapes(shapes),
		devices: sortDevices(devices),
		crossings: sortCrossings(crossings),
		tonality: mode
	};
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
		devices: [],
		// The ladder never leaves the key, so it has nothing to say about crossing
		// one either — that is `vocabularyOf`'s job, below.
		crossings: [],
		/*
		 * Any rung at all is a rung of a major key, and the relative minor rung is
		 * the one that opens a minor one. Nothing else on the ladder does, and
		 * nothing else in the app does either: this is the only place the minor
		 * tonality is granted, which is what makes the rule checkable.
		 */
		tonalities: seen.size === 0 ? [] : seen.has('relative-minor') ? ['major', 'minor'] : ['major']
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
		devices: sortDevices(demands.flatMap((d) => d.devices)),
		// None of the library modulates today — every progression returns to its
		// own tonic — so this is empty in practice and not by exclusion. A future
		// progression that genuinely changed key would be read by the same
		// `demandOfNumerals` call above and would teach it correctly without this
		// function needing to change at all.
		crossings: sortCrossings(demands.flatMap((d) => d.crossings)),
		/*
		 * Nothing. A progression written in the minor is *material* in a minor key,
		 * not a teacher of one — it has to be placed in a key itself, and can only
		 * be placed in one the ladder has opened. Granting the tonality here would
		 * let a minor progression unlock minor tunes by being met, which is the
		 * circularity that let one be offered in the parallel minor in the first
		 * place.
		 */
		tonalities: []
	};
}

/**
 * The halves of the drill room, added up.
 *
 * **The near relations used to be granted here and are not any more.** The
 * grant was honest while it lasted: `cardsForKeyMoved` made a card for all four
 * near relations in every key the frontier had opened, from the first morning,
 * so "which relations has this account been taught" had one answer and
 * modelling it as a lookup would have dressed up a constant. That exercise has
 * been withdrawn — see DECISIONS.md — and with it the teaching. A vocabulary
 * that kept claiming the relations would be claiming them on behalf of a lesson
 * nobody gives.
 *
 * **This costs no tune, and that is a measurement rather than a hope.** Of the
 * forty-five charts, two demand a crossing at all, and both of them also demand
 * `other` — the relation nothing has ever taught — so both were refused before
 * this changed and are refused for the same reason after. The count of ready
 * charts at every one of the seven rung depths is identical with the grant and
 * without it.
 *
 * So `crossings` now comes from the progression library alone, which today
 * supplies none: nothing in the app teaches a key change, and the gate says so
 * instead of pretending otherwise. `pivot_play` survives as an exercise but it
 * teaches a *chord* — the hinge two keys share — rather than the crossing it
 * hinges, and granting a relation for having spelled its pivot would be the
 * same overreach one size smaller.
 */
export function vocabularyOf(input: {
	rungs: Iterable<RungId>;
	progressions?: Iterable<string>;
}): Vocabulary {
	const rungIds = [...input.rungs];
	const ladder = vocabularyFromRungs(rungIds);
	const library = vocabularyFromProgressions(input.progressions ?? []);

	return {
		shapes: sortShapes([...ladder.shapes, ...library.shapes]),
		devices: sortDevices([...ladder.devices, ...library.devices]),
		crossings: sortCrossings(library.crossings),
		tonalities: ladder.tonalities
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
export type Shortfall = {
	shapes: Shape[];
	devices: Device[];
	crossings: Relation[];
	/** The kind of key the tune is in, when it is one you have never been in. */
	tonality: Tonality | null;
};

export function shortfall(demand: Demand, known: Vocabulary): Shortfall {
	const haveShapes = new Set(known.shapes);
	const haveDevices = new Set(known.devices);
	const haveCrossings = new Set(known.crossings);
	const haveTonalities = new Set(known.tonalities);
	return {
		shapes: demand.shapes.filter((shape) => !haveShapes.has(shape)),
		devices: demand.devices.filter((device) => !haveDevices.has(device)),
		crossings: demand.crossings.filter((relation) => !haveCrossings.has(relation)),
		tonality: haveTonalities.has(demand.tonality) ? null : demand.tonality
	};
}

export function isReady(demand: Demand, known: Vocabulary): boolean {
	const gap = shortfall(demand, known);
	return (
		gap.shapes.length === 0 &&
		gap.devices.length === 0 &&
		gap.crossings.length === 0 &&
		gap.tonality === null
	);
}

/**
 * What each crossing weighs when tunes are put in order.
 *
 * Ordering only, like `DEVICE_WEIGHT` beside it and for the same reason. The
 * relative costs nothing to the page — same notes, same shapes — so it sits at
 * the bottom; the parallel costs more than the dominant or subdominant even
 * though the tonic does not move, because three notes do, which is the hands'
 * measure rather than the ear's. `other` weighs as much as `chromatic`,
 * deliberately: neither is taught by anything yet, so a tune reaching for
 * either should sort exactly as far away.
 */
const CROSSING_WEIGHT: Record<Relation, number> = {
	home: 0,
	relative: 1,
	dominant: 2,
	subdominant: 2,
	parallel: 3,
	other: 8
};

/**
 * How far into what you know a tune reaches, as one number.
 *
 * Only ever used to put tunes in order, so that the first play-along of an
 * account is a four-chord loop and not the thirty-two bars of rhythm changes
 * that happen to have become legal on the same day. Devices and crossings count
 * for more than shapes because leaving the key — in colour or for good — is
 * what makes a chart feel like somewhere you have never been.
 */
export function reachOf(demand: Demand): number {
	const devices = demand.devices.reduce((total, device) => total + DEVICE_WEIGHT[device], 0);
	const crossings = demand.crossings.reduce(
		(total, relation) => total + CROSSING_WEIGHT[relation],
		0
	);
	return (devices + crossings) * 10 + demand.shapes.length;
}

/**
 * Said in a shortfall sentence: "you have not met … {this}".
 *
 * `home` never appears — a crossing to where you already are is not one, and
 * `demandOfNumerals` never produces it — but the map is total for the same
 * reason `DEVICE_LABELS` covers every `Device`: a `Record` with a hole in it is
 * a runtime error waiting for the day a caller asks the wrong question.
 */
export const CROSSING_LABELS: Record<Relation, string> = {
	home: 'no key change at all',
	relative: 'a move to the relative',
	dominant: 'a move to the dominant',
	subdominant: 'a move to the subdominant',
	parallel: 'a move to the parallel',
	other: 'a key change nothing here has taught yet'
};

/** Short enough for a chip beside a tune in a list, next to `DEVICE_CHIPS`. */
export const CROSSING_CHIPS: Record<Relation, string> = {
	home: 'no change',
	relative: 'to the relative',
	dominant: 'to the dominant',
	subdominant: 'to the subdominant',
	parallel: 'to the parallel',
	other: 'a distant key'
};

/** One line saying what a tune would need. For a page that has to explain a hole. */
export function describeShortfall(gap: Shortfall): string {
	const parts: string[] = [];

	// The key comes first, because it is the largest thing that can be missing:
	// a tune in a key you have never been in is not a tune with a chord problem.
	if (gap.tonality) parts.push(TONALITY_LABELS[gap.tonality]);
	const named = gap.shapes.filter((shape) => shape !== 'unknown');
	if (named.length) parts.push(named.join(', '));
	if (named.length !== gap.shapes.length) parts.push('chords this app cannot read');
	for (const device of gap.devices) parts.push(DEVICE_LABELS[device]);
	for (const relation of gap.crossings) parts.push(CROSSING_LABELS[relation]);

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
