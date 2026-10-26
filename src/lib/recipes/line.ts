import type { AbstractChord } from '$lib/music/chord';
import { ivl, transpose } from '$lib/music/interval';
import { LETTER_SEMITONES, midi, parseNote, pitchClass, type Note } from '$lib/music/note';
import { cook, rootsFor, rootTier, tonesOf, type RecipeId, type Tone } from './recipes';

/**
 * The line: every stop, in the order it is meant to be ridden, and the items
 * each one serves.
 *
 * Every answer on this line is a note, played. Nothing here is a multiple
 * choice with the keyboard standing in for buttons — a key pressed is always
 * the pitch it sounds, so whatever the hands learn is true of the instrument.
 *
 * Each stop climbs the same three rungs of help, and nothing else changes as it
 * climbs:
 *
 *   - **keys** — the notes to find are drawn on the keyboard itself. Copy them.
 *     This is how a stop teaches, by being played once, and it is never scored.
 *   - **card** — only the recipe is shown: the shape, with the distances
 *     counted. The keys are yours to find.
 *   - **name** — only the name. The recipe has to come from memory.
 */

export type Hint = 'keys' | 'card' | 'name';
export type ItemKind = 'hop' | 'build' | 'morph' | 'fill' | 'circle';

export type Item = {
	kind: ItemKind;
	hint: Hint;
	/** The finished shape, root first, the root in octave 3. */
	tones: Tone[];
	/** Indices into `tones` already sounding when the item starts. */
	given: number[];
	/** Indices into `tones` still to be played. */
	wanted: number[];
	/** What the finished shape is called, when it is a chord. */
	chord: AbstractChord | null;
	recipe: RecipeId | null;
	/** For a morph, the chord it starts from. */
	before: { chord: AbstractChord; tones: Tone[]; recipe: RecipeId } | null;
	/** For a trip round the circle: which hop this is, and which way round. */
	circle: { step: number; direction: 1 | -1 } | null;
};

export type LineId = 'recipes' | 'circle';

/**
 * Where a stop sits in the syllabus. The map draws a label where each one
 * starts, so the line reads as what it is — intervals first, because they are
 * what every recipe is measured in, then the chords built from them.
 */
export const SECTIONS = {
	intervals: { title: 'Intervals', note: 'The distances recipes are made of.' },
	triads: { title: 'Triads', note: 'Three notes: root, third, fifth.' },
	sevenths: { title: 'Seventh chords', note: 'A triad with a seventh on top.' },
	review: { title: 'Review', note: 'By chord symbol only.' },
	circle: { title: 'Circle of fifths', note: 'Branches off at the perfect fifth.' }
} as const;
export type SectionId = keyof typeof SECTIONS;

/**
 * A worked example for a stop's briefing, always on C: the shape it teaches,
 * drawn the way the card will draw it. `ghost` is where the moving note was in
 * the chord it comes from, when the stop is about moving one.
 */
export type Figure = {
	tones: Tone[];
	chord: AbstractChord | null;
	recipe: RecipeId | null;
	/** The chord this one is made from, for a stop that moves one note. */
	from: RecipeId | null;
	ghost: { offset: number; pc: number } | null;
};

export const STOP_IDS = [
	'half',
	'whole',
	'thirds',
	'fifth',
	'major',
	'minor',
	'flip',
	'order',
	'stretch',
	'sus',
	'sevenths',
	'family',
	'missing',
	'menu',
	'clockwise',
	'anticlockwise',
	'by-heart'
] as const;
export type StopId = (typeof STOP_IDS)[number];

/**
 * A stop's badge on the map: a small drawing of what it teaches, on C.
 *
 * `open` marks the tone the stop is about — the one that moves, or the one
 * that is missing — drawn hollow so the badge says what you will be asked for.
 */
export type Emblem =
	{ kind: 'shape'; tones: Tone[]; open: number[] } | { kind: 'wheel'; direction: 1 | -1 | 0 };

export type Stop = {
	id: StopId;
	line: LineId;
	section: SectionId;
	/** The standard name of what the stop teaches. Never a pun. */
	title: string;
	/** One line for the map: the fact, in the terms a theory book uses. */
	summary: string;
	/**
	 * Read before the first item: what the thing is, in standard terms, and
	 * what the items are going to ask. Short paragraphs, plain text.
	 */
	brief: string[];
	figures: Figure[];
	emblem: Emblem;
	/**
	 * The items follow on from one another, so a slip cannot be sent round
	 * again at the end. A trip round the circle is one journey, not twelve
	 * questions.
	 */
	chain: boolean;
	make: (random: () => number) => Item[];
};

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/**
 * A seeded generator, so a round is reproducible from its seed alone.
 *
 * That is what lets the server check a submitted round against the items it
 * actually contained without the page having to send them — see `replay`.
 */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
	const out = [...values];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function pick<T>(values: readonly T[], random: () => number): T {
	return values[Math.floor(random() * values.length)];
}

const repeat = <T>(value: T, count: number): T[] => Array.from({ length: count }, () => value);

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** A spelling placed at an exact key, so `B♭` at 58 is B♭3 and at 70 is B♭4. */
function at(spelling: string, key: number): Note {
	const parsed = parseNote(spelling);
	const octave = Math.floor((key - LETTER_SEMITONES[parsed.letter] - parsed.alter) / 12) - 1;
	return { ...parsed, octave };
}

/**
 * How a key is spelled when it is reached by counting rather than by an
 * interval. Sharps going up, because a key one to the right of C is the one
 * written with a sharp on it; the three flats that every chart writes as flats
 * stay flats.
 */
const COUNTED = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** A starting key, in octave 3. */
function start(pc: number): Note {
	return at(COUNTED[pc], 48 + pc);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/**
 * A hop: one key lit, one to find a counted distance above it.
 *
 * With an interval the landing is spelled as that interval — the third above E
 * is G♯, not A♭; the whole step above C♯ is D♯, not E♭ — and labelled with
 * its degree when it has one worth reading. Without one, it is just a count
 * of half steps and the landing is spelled the way it is counted.
 */
function hop(
	from: Note,
	keys: number,
	hint: Hint,
	interval?: string,
	circle: Item['circle'] = null
): Item {
	const landing = interval
		? transpose(from, ivl(interval))
		: at(COUNTED[(pitchClass(from) + keys) % 12], midi(from) + keys);
	const degree = interval ? degreeOf(interval) : '';
	return {
		kind: circle ? 'circle' : 'hop',
		hint,
		tones: [
			{ note: from, offset: 0, degree: degree ? '1' : '' },
			{ note: landing, offset: keys, degree }
		],
		given: [0],
		wanted: [1],
		chord: null,
		recipe: null,
		before: null,
		circle
	};
}

/**
 * The degree a hop's landing is labelled with. A whole step has none: under a
 * lone pair of notes a `2` would read as a count, and the count is the lesson.
 */
function degreeOf(interval: string): string {
	return { m3: '♭3', M3: '3', P4: '4', P5: '5' }[interval] ?? '';
}

/** Build a chord from its recipe. With the name only, the root is yours to find too. */
function build(recipe: RecipeId, root: Note, hint: Hint): Item {
	const chord = cook(recipe, root);
	const tones = tonesOf(chord);
	const rootGiven = hint !== 'name';
	return {
		kind: 'build',
		hint,
		tones,
		given: rootGiven ? [0] : [],
		wanted: tones.map((_, i) => i).filter((i) => !rootGiven || i > 0),
		chord,
		recipe,
		before: null,
		circle: null
	};
}

/** Turn one chord into another on the same root. Only what changes is played. */
function morph(from: RecipeId, to: RecipeId, root: Note, hint: Hint): Item {
	const before = cook(from, root);
	const chord = cook(to, root);
	const tones = tonesOf(chord);
	const kept = new Set(tonesOf(before).map((tone) => pitchClass(tone.note)));
	const indices = tones.map((_, i) => i);
	return {
		kind: 'morph',
		hint,
		tones,
		given: indices.filter((i) => kept.has(pitchClass(tones[i].note))),
		wanted: indices.filter((i) => !kept.has(pitchClass(tones[i].note))),
		chord,
		recipe: to,
		before: { chord: before, tones: tonesOf(before), recipe: from },
		circle: null
	};
}

/** A chord with one ingredient taken out. */
function fill(recipe: RecipeId, root: Note, missing: number, hint: Hint): Item {
	const chord = cook(recipe, root);
	const tones = tonesOf(chord);
	return {
		kind: 'fill',
		hint,
		tones,
		given: tones.map((_, i) => i).filter((i) => i !== missing),
		wanted: [missing],
		chord,
		recipe,
		before: null,
		circle: null
	};
}

/**
 * Roots for a recipe, easiest first.
 *
 * Shuffled within each tier so no two rounds are alike, and the tiers kept in
 * order so a stop's first items are its plainest: the shape is learnt on the
 * white keys before it has to be found among the black ones.
 */
function servings(recipe: RecipeId, random: () => number): Note[] {
	const roots = rootsFor(recipe);
	return [0, 1, 2].flatMap((tier) =>
		shuffle(
			roots.filter((root) => rootTier(recipe, root) === tier),
			random
		)
	);
}

/**
 * Hands out roots without repeating one: in order for the items that teach, at
 * random for the items that test. C is held back by default, because every
 * stop has already been shown on C by the time it asks for anything.
 */
function server(roots: Note[], used = new Set<number>([0])) {
	const serve = (root: Note) => {
		used.add(pitchClass(root));
		return root;
	};
	const fresh = () => roots.filter((root) => !used.has(pitchClass(root)));
	return {
		take: (): Note => serve(fresh()[0] ?? roots[0]),
		any: (random: () => number): Note => {
			const left = fresh();
			return serve(pick(left.length ? left : roots, random));
		}
	};
}

/** `C` in octave 3, for the first item of a stop: everyone's first chord is on C. */
const C = start(0);

/**
 * A stop that serves one recipe: copy it on C, then find it from its shape,
 * then from its name.
 */
function recipeStop(recipe: RecipeId, cards: number, names: number) {
	return (random: () => number): Item[] => {
		const roots = server(servings(recipe, random));
		return [
			build(recipe, C, 'keys'),
			...repeat('card' as const, cards).map((hint) => build(recipe, roots.take(), hint)),
			...repeat('name' as const, names).map((hint) => build(recipe, roots.any(random), hint))
		];
	};
}

/** A mixed order of chords, by name only, none repeated. */
function orders(recipes: RecipeId[], count: number, random: () => number): Item[] {
	const seen = new Set<string>();
	const items: Item[] = [];
	// Every recipe at least once before any comes round a second time.
	const sequence = [
		...shuffle(recipes, random),
		...Array.from({ length: count }, () => pick(recipes, random))
	].slice(0, count);
	for (const recipe of sequence) {
		const roots = rootsFor(recipe).filter((root) => !seen.has(`${recipe}|${pitchClass(root)}`));
		const root = pick(roots.length ? roots : rootsFor(recipe), random);
		seen.add(`${recipe}|${pitchClass(root)}`);
		items.push(build(recipe, root, 'name'));
	}
	return items;
}

/** Morphs on random roots that can carry both chords plainly. */
function morphs(
	pairs: Array<[RecipeId, RecipeId]>,
	hint: Hint,
	random: () => number,
	avoid = new Set<number>()
): Item[] {
	return pairs.map(([from, to]) => {
		const both = rootsFor(from).filter((root) =>
			rootsFor(to).some((other) => other.letter === root.letter && other.alter === root.alter)
		);
		const fresh = both.filter((root) => !avoid.has(pitchClass(root)));
		const root = pick(fresh.length ? fresh : both, random);
		avoid.add(pitchClass(root));
		return morph(from, to, root, hint);
	});
}

// ---------------------------------------------------------------------------
// The circle
// ---------------------------------------------------------------------------

/**
 * The twelve keys a fifth apart, as the trip round spells them.
 *
 * Sharps on the way up from C and flats on the way down, changing over at the
 * bottom of the circle where F♯ and G♭ share a key. Going clockwise the trip
 * leaves F♯ for D♭ rather than C♯ — seven sharps would be the right answer and
 * the wrong lesson — and going the other way it leaves G♭ for B.
 */
export const CLOCKWISE = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
export const ANTICLOCKWISE = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G'];

/** Twelve hops, C to C. A fifth is seven half steps up; a fourth, five. */
function trip(direction: 1 | -1, hints: Hint[]): Item[] {
	const names = direction === 1 ? CLOCKWISE : ANTICLOCKWISE;
	const keys = direction === 1 ? 7 : 5;
	return hints.map((hint, i) => {
		const from = at(names[i], 48 + pitchClass(parseNote(names[i])));
		const landing = at(names[(i + 1) % 12], midi(from) + keys);
		const item = hop(from, keys, hint, undefined, { step: i + 1, direction });
		item.tones[1] = { ...item.tones[1], note: landing };
		return item;
	});
}

// ---------------------------------------------------------------------------
// The stops
// ---------------------------------------------------------------------------

/** A chord on C, and where the note that moved used to be when it came from another. */
function chordFigure(recipe: RecipeId, from?: RecipeId): Figure {
	const chord = cook(recipe, C);
	const tones = tonesOf(chord);
	let ghost: Figure['ghost'] = null;
	if (from) {
		const before = tonesOf(cook(from, C));
		const moved = tones.findIndex((tone, i) => before[i] && before[i].offset !== tone.offset);
		if (moved >= 0) ghost = { offset: before[moved].offset, pc: pitchClass(before[moved].note) };
	}
	return { tones, chord, recipe, from: from ?? null, ghost };
}

function stepFigure(fromPc: number, keys: number, interval?: string): Figure {
	return {
		tones: hop(start(fromPc), keys, 'keys', interval).tones,
		chord: null,
		recipe: null,
		from: null,
		ghost: null
	};
}

function shapeEmblem(recipe: RecipeId, open: number[] = []): Emblem {
	return { kind: 'shape', tones: tonesOf(cook(recipe, C)), open };
}

function hopEmblem(keys: number, interval?: string): Emblem {
	return { kind: 'shape', tones: hop(C, keys, 'keys', interval).tones, open: [1] };
}

export const STOPS: Stop[] = [
	{
		id: 'half',
		line: 'recipes',
		section: 'intervals',
		title: 'Half steps',
		summary: 'The smallest distance: the very next key.',
		brief: [
			'A half step (also called a semitone) is the distance from one key to the very next one — black or white, whichever comes next. Every distance on this page is counted in half steps.',
			'Most white keys have a black key next door. E–F and B–C do not: from E, the next key up is F.',
			'You are given a note; play the key a half step above it. The first two play themselves for you to copy.'
		],
		figures: [stepFigure(0, 1), stepFigure(4, 1)],
		emblem: hopEmblem(1),
		chain: false,
		make: (random) => {
			// E and B first, because the white key next door is the surprise.
			const rest = shuffle([1, 2, 3, 5, 6, 7, 8, 9, 10], random).slice(0, 4);
			return [
				hop(start(0), 1, 'keys'),
				hop(start(4), 1, 'keys'),
				hop(start(11), 1, 'card'),
				...rest.map((pc) => hop(start(pc), 1, 'card'))
			];
		}
	},
	{
		id: 'whole',
		line: 'recipes',
		section: 'intervals',
		title: 'Whole steps',
		summary: 'Two half steps: skip exactly one key.',
		brief: [
			'A whole step (a whole tone) is two half steps. Count every key, black and white: skip exactly one and play the next.',
			'From C that is D. From E it is F♯, not F — E to F is only a half step. The same happens at B: a whole step up is C♯.',
			'Every question in this stop is a whole step up. Near the end the count is hidden and the name is all you get.'
		],
		figures: [stepFigure(0, 2, 'M2'), stepFigure(4, 2, 'M2')],
		emblem: hopEmblem(2),
		chain: false,
		make: (random) => {
			// Only whole steps. The first version slipped half steps in among them
			// as review, under a title that said otherwise; see DECISIONS.
			const rest = shuffle([1, 2, 3, 5, 6, 7, 8, 9, 10], random);
			const trap = pick([4, 11], random);
			return [
				hop(start(0), 2, 'keys', 'M2'),
				hop(start(4), 2, 'keys', 'M2'),
				hop(start(11), 2, 'card', 'M2'),
				...rest.slice(0, 4).map((pc) => hop(start(pc), 2, 'card', 'M2')),
				...shuffle([trap, ...rest.slice(4, 6)], random).map((pc) => hop(start(pc), 2, 'name', 'M2'))
			];
		}
	},
	{
		id: 'thirds',
		line: 'recipes',
		section: 'intervals',
		title: 'Major and minor thirds',
		summary: '4 half steps or 3: what makes a chord major or minor.',
		brief: [
			'A third spans three letter names: C to E, D to F, A to C. A major third is 4 half steps; a minor third is 3.',
			'Which third sits above the root is what makes a chord major or minor, so this is the distance worth knowing cold.',
			'You are given a note; play the third above it. The two kinds are mixed, and the heading says which one each question wants.'
		],
		figures: [stepFigure(0, 4, 'M3'), stepFigure(0, 3, 'm3')],
		emblem: hopEmblem(4, 'M3'),
		chain: false,
		make: (random) => {
			// White-key roots only: a third is counted before it is spelled.
			const roots = server(
				shuffle(
					rootsFor('major').filter((root) => root.alter === 0),
					random
				)
			);
			const intervals = shuffle(['M3', 'm3', 'M3', 'm3', 'M3', 'm3', 'M3'], random);
			return [
				hop(C, 4, 'keys', 'M3'),
				hop(C, 3, 'keys', 'm3'),
				...intervals.map((interval, i) =>
					hop(roots.any(random), interval === 'M3' ? 4 : 3, i < 4 ? 'card' : 'name', interval)
				)
			];
		}
	},
	{
		id: 'fifth',
		line: 'recipes',
		section: 'intervals',
		title: 'Perfect fifth',
		summary: '7 half steps: the outer note of a major or minor triad.',
		brief: [
			'A perfect fifth is 7 half steps and spans five letter names: C to G, D to A. Every major and minor triad has one, from its root to its top note.',
			'It is also the step that takes you round the circle of fifths, which branches off the line here.',
			'You are given a note; play the perfect fifth above it.'
		],
		figures: [stepFigure(0, 7, 'P5')],
		emblem: hopEmblem(7, 'P5'),
		chain: false,
		make: (random) => {
			const roots = server(servings('major', random));
			return [
				hop(C, 7, 'keys', 'P5'),
				...repeat('card' as const, 3).map((hint) => hop(roots.take(), 7, hint, 'P5')),
				...repeat('name' as const, 3).map((hint) => hop(roots.any(random), 7, hint, 'P5'))
			];
		}
	},
	{
		id: 'major',
		line: 'recipes',
		section: 'triads',
		title: 'Major triad',
		summary: 'Root, major third, perfect fifth: 1 3 5.',
		brief: [
			'A triad is three notes stacked in thirds. The major triad’s recipe is the root, the major third above it (4 half steps) and the perfect fifth above it (7 half steps). Counted from note to note, that is 4 and then 3.',
			'The recipe is the same on every root: C E G, F A C, D F♯ A. The notes change; the distances never do.',
			'First copy C major. Then the root is put on the keys for you and the card shows the distances: add the third and the fifth. Last, only the chord symbol is shown — a letter on its own means major — and you play all three notes.'
		],
		figures: [chordFigure('major')],
		emblem: shapeEmblem('major'),
		chain: false,
		make: recipeStop('major', 3, 3)
	},
	{
		id: 'minor',
		line: 'recipes',
		section: 'triads',
		title: 'Minor triad',
		summary: 'Root, minor third, perfect fifth: 1 ♭3 5.',
		brief: [
			'The minor triad keeps the major triad’s root and fifth and lowers the third: a minor third, 3 half steps above the root. Counted from note to note, that is 3 and then 4 — the major triad’s distances the other way round.',
			'On C: C E♭ G. On A: A C E. The symbol is the root with a small m: Cm, Am.',
			'Copy C minor, then build it from the card with the root given, then from the symbol alone.'
		],
		figures: [chordFigure('minor')],
		emblem: shapeEmblem('minor'),
		chain: false,
		make: recipeStop('minor', 3, 3)
	},
	{
		id: 'flip',
		line: 'recipes',
		section: 'triads',
		title: 'Major to minor and back',
		summary: 'Move the third a half step; the root and fifth stay.',
		brief: [
			'A major and a minor triad on the same root share two notes. Only the third moves: down a half step turns major into minor, up a half step turns minor into major.',
			'A chord is put on the keys with the chord to make beside it — C → Cm. Play only the note that changes.'
		],
		figures: [chordFigure('major'), chordFigure('minor', 'major')],
		emblem: shapeEmblem('minor', [1]),
		chain: false,
		make: (random) => {
			const used = new Set([0]);
			const flips = (count: number) =>
				shuffle(
					[
						...repeat(['major', 'minor'] as [RecipeId, RecipeId], Math.ceil(count / 2)),
						...repeat(['minor', 'major'] as [RecipeId, RecipeId], Math.floor(count / 2))
					],
					random
				);
			return [
				morph('major', 'minor', C, 'keys'),
				...morphs(flips(4), 'card', random, used),
				...morphs(flips(3), 'name', random, used)
			];
		}
	},
	{
		id: 'order',
		line: 'recipes',
		section: 'triads',
		title: 'Major and minor from the symbol',
		summary: 'Chord symbols only: play the whole triad, root included.',
		brief: [
			'No card and no root this time: only a chord symbol. A letter on its own is major (D = D F♯ A); with an m it is minor (Dm = D F A).',
			'Play all three notes, root included, in any order and any octave.'
		],
		figures: [chordFigure('major'), chordFigure('minor')],
		emblem: shapeEmblem('major', [0, 1, 2]),
		chain: false,
		make: (random) => orders(['major', 'minor'], 8, random)
	},
	{
		id: 'stretch',
		line: 'recipes',
		section: 'triads',
		title: 'Diminished and augmented triads',
		summary: 'Lower or raise the fifth: 1 ♭3 ♭5 and 1 3 ♯5.',
		brief: [
			'Two more triads come from moving the fifth a half step.',
			'Diminished (C°) is a minor triad with its fifth lowered: 1 ♭3 ♭5, two minor thirds stacked (3 + 3). Augmented (C+) is a major triad with its fifth raised: 1 3 ♯5, two major thirds stacked (4 + 4).',
			'First move the fifth of a chord that is on the keys, then build both from the symbol alone.'
		],
		figures: [chordFigure('diminished', 'minor'), chordFigure('augmented', 'major')],
		emblem: shapeEmblem('augmented', [2]),
		chain: false,
		make: (random) => {
			const used = new Set([0]);
			const moves = shuffle<[RecipeId, RecipeId]>(
				[
					['minor', 'diminished'],
					['major', 'augmented'],
					['diminished', 'minor'],
					['augmented', 'major']
				],
				random
			);
			const tests = shuffle<[RecipeId, RecipeId]>(
				[
					['minor', 'diminished'],
					['major', 'augmented']
				],
				random
			);
			return [
				morph('minor', 'diminished', C, 'keys'),
				morph('major', 'augmented', C, 'keys'),
				...morphs(moves, 'card', random, used),
				...morphs(tests, 'name', random, used),
				build('diminished', pick(rootsFor('diminished'), random), 'name'),
				build('augmented', pick(rootsFor('augmented'), random), 'name')
			];
		}
	},
	{
		id: 'sus',
		line: 'recipes',
		section: 'triads',
		title: 'Suspended chords',
		summary: 'The third replaced by the 4th or the 2nd: sus4, sus2.',
		brief: [
			'A suspended chord has no third, so it is neither major nor minor.',
			'sus4 uses the perfect fourth instead of the third: 1 4 5 (C F G). sus2 uses the major second instead: 1 2 5 (C D G).',
			'A chord is put on the keys; move its third, or put it back, to make the chord shown beside it.'
		],
		figures: [chordFigure('sus4', 'major'), chordFigure('sus2', 'major')],
		emblem: shapeEmblem('sus4', [1]),
		chain: false,
		make: (random) => {
			const used = new Set([0]);
			const moves = shuffle<[RecipeId, RecipeId]>(
				[
					['major', 'sus4'],
					['major', 'sus2'],
					['sus4', 'major'],
					['sus2', 'major']
				],
				random
			);
			const tests = shuffle<[RecipeId, RecipeId]>(
				[
					['major', 'sus4'],
					['minor', 'sus2'],
					['sus4', 'minor']
				],
				random
			);
			return [
				morph('major', 'sus4', C, 'keys'),
				morph('major', 'sus2', C, 'keys'),
				...morphs(moves, 'card', random, used),
				...morphs(tests, 'name', random, used)
			];
		}
	},
	{
		id: 'sevenths',
		line: 'recipes',
		section: 'sevenths',
		title: 'Major seventh and dominant seventh',
		summary: 'A major triad plus the 7 or the ♭7.',
		brief: [
			'A seventh chord is a triad with a fourth note on top, a seventh above the root. It is quickest to find down from the root an octave up.',
			'Major seventh (C∆, also written Cmaj7): the 7 is a half step below the octave, 11 half steps above the root — 1 3 5 7. Dominant seventh (C7): the ♭7 is a whole step below the octave, 10 half steps up — 1 3 5 ♭7.',
			'Add the seventh to a chord on the keys, swap one seventh for the other, then build both from the symbol.'
		],
		figures: [chordFigure('major7'), chordFigure('dominant7')],
		emblem: shapeEmblem('major7', [3]),
		chain: false,
		make: (random) => {
			const used = new Set([0]);
			const first = server(servings('major7', random), used);
			return [
				build('major7', C, 'keys'),
				morph('major7', 'dominant7', C, 'keys'),
				build('major7', first.take(), 'card'),
				...morphs([['major', 'dominant7']], 'card', random, used),
				build('dominant7', first.take(), 'card'),
				...morphs([['dominant7', 'major7']], 'card', random, used),
				...orders(['major7', 'dominant7'], 3, random)
			];
		}
	},
	{
		id: 'family',
		line: 'recipes',
		section: 'sevenths',
		title: 'Minor seventh, half-diminished, diminished seventh',
		summary: 'From the dominant seventh, lower one note at a time.',
		brief: [
			'Start from the dominant seventh, 1 3 5 ♭7, and lower one note at a time.',
			'Lower the third: minor seventh (Cm7), 1 ♭3 5 ♭7. Lower the fifth as well: half-diminished seventh (Cø7, also written Cm7♭5), 1 ♭3 ♭5 ♭7. Lower the seventh again: diminished seventh (C°7), 1 ♭3 ♭5 ♭♭7 — minor thirds all the way up. On C that seventh is spelled B𝄫, which is the A key.',
			'Make each move on a chord that is on the keys, then build them from the symbol alone.'
		],
		figures: [
			chordFigure('minor7', 'dominant7'),
			chordFigure('halfDiminished', 'minor7'),
			chordFigure('diminished7', 'halfDiminished')
		],
		emblem: shapeEmblem('minor7', [1]),
		chain: false,
		make: (random) => {
			const used = new Set([0]);
			return [
				morph('dominant7', 'minor7', C, 'keys'),
				morph('minor7', 'halfDiminished', C, 'keys'),
				...morphs(
					shuffle<[RecipeId, RecipeId]>(
						[
							['halfDiminished', 'diminished7'],
							['dominant7', 'minor7'],
							['minor7', 'halfDiminished']
						],
						random
					),
					'card',
					random,
					used
				),
				build('minor7', pick(rootsFor('minor7'), random), 'card'),
				...orders(['minor7', 'halfDiminished', 'diminished7', 'dominant7', 'major7'], 4, random)
			];
		}
	},
	{
		id: 'missing',
		line: 'recipes',
		section: 'review',
		title: 'Missing chord tone',
		summary: 'One note of the chord is left out: play it.',
		brief: [
			'A chord is put on the keys with one note missing — a third, a fifth or a seventh, and in the last two questions the root itself.',
			'Read the symbol, work out which note of its recipe is not there, and play it. At first the card shows where the gap is; after that, only the symbol.'
		],
		figures: [],
		emblem: shapeEmblem('dominant7', [1]),
		chain: false,
		make: (random) => {
			const recipes: RecipeId[] = ['major', 'minor', 'major7', 'dominant7', 'minor7'];
			const item = (hint: Hint, which: (size: number) => number) => {
				const recipe = pick(recipes, random);
				const root = pick(rootsFor(recipe), random);
				const size = tonesOf(cook(recipe, root)).length;
				return fill(recipe, root, which(size), hint);
			};
			const inner = (size: number) => 1 + Math.floor(random() * (size - 1));
			return [
				...repeat('card' as const, 4).map((hint) => item(hint, inner)),
				...repeat('name' as const, 3).map((hint) => item(hint, inner)),
				// Last, and hardest: the note everything else is counted from.
				...repeat('name' as const, 2).map((hint) => item(hint, () => 0))
			];
		}
	},
	{
		id: 'menu',
		line: 'recipes',
		section: 'review',
		title: 'All chord types, mixed',
		summary: 'Every chord on the line, from the symbol alone.',
		brief: [
			'Major, minor, diminished, augmented, sus4, and four seventh chords — major seventh, dominant seventh, minor seventh and half-diminished — mixed, with only the symbol shown.',
			'Play every note, root included. A chord you slip on comes back once at the end.'
		],
		figures: [],
		emblem: shapeEmblem('halfDiminished', [0, 1, 2, 3]),
		chain: false,
		make: (random) =>
			orders(
				[
					'major',
					'minor',
					'diminished',
					'augmented',
					'sus4',
					'major7',
					'dominant7',
					'minor7',
					'halfDiminished'
				],
				10,
				random
			)
	},
	{
		id: 'clockwise',
		line: 'circle',
		section: 'circle',
		title: 'Up in fifths (clockwise)',
		summary: 'A perfect fifth up, twelve times, back to C.',
		brief: [
			'Start on C and go up a perfect fifth (7 half steps). From where you land, do it again. Twelve fifths visit every key once and bring you back to C: that ring is the circle of fifths.',
			'Clockwise, each key along the way has one more sharp in its key signature, or one flat fewer. Past F♯ the names switch to flats — D♭ rather than C♯ — the way those keys are usually written.',
			'The keys on the circle are named as you reach them.'
		],
		figures: [stepFigure(0, 7, 'P5')],
		emblem: { kind: 'wheel', direction: 1 },
		chain: true,
		make: () => trip(1, [...repeat('keys' as const, 3), ...repeat('card' as const, 9)])
	},
	{
		id: 'anticlockwise',
		line: 'circle',
		section: 'circle',
		title: 'Up in fourths (counter-clockwise)',
		summary: 'A perfect fourth up goes round the other way.',
		brief: [
			'Going up a perfect fourth (5 half steps) travels the same circle the other way: C F B♭ E♭ A♭ D♭ G♭ B E A D G, and back to C. A fourth up lands on the same key as a fifth down.',
			'Counter-clockwise, each key has one more flat or one sharp fewer. Chord progressions move this way all the time: G7 to C is a fourth up.',
			'Past G♭ the names switch to sharps — B rather than C♭.'
		],
		figures: [stepFigure(0, 5, 'P4')],
		emblem: { kind: 'wheel', direction: -1 },
		chain: true,
		make: () => trip(-1, [...repeat('keys' as const, 3), ...repeat('card' as const, 9)])
	},
	{
		id: 'by-heart',
		line: 'circle',
		section: 'circle',
		title: 'Both ways from memory',
		summary: 'Twelve fifths, then twelve fourths, with no count shown.',
		brief: [
			'Both trips again — twelve fifths clockwise, then twelve fourths back — with no count shown. This is the circle of fifths from memory.'
		],
		figures: [],
		emblem: { kind: 'wheel', direction: 0 },
		chain: true,
		make: () => [...trip(1, repeat('name', 12)), ...trip(-1, repeat('name', 12))]
	}
];

export function stopById(id: string): Stop | undefined {
	return STOPS.find((stop) => stop.id === id);
}

/** Where the circle line leaves the recipe line: the stop that teaches the fifth. */
export const INTERCHANGE: StopId = 'fifth';
