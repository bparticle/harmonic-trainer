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
	before: { chord: AbstractChord; tones: Tone[] } | null;
	/** For a trip round the circle: which hop this is, and which way round. */
	circle: { step: number; direction: 1 | -1 } | null;
};

export type LineId = 'recipes' | 'circle';

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
	title: string;
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
 * is G♯, not A♭ — and labelled with the degree it is. Without one, it is just
 * a count of keys and the landing is spelled the way it is counted.
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
			{ note: from, offset: 0, degree: interval ? '1' : '' },
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
		before: { chord: before, tones: tonesOf(before) },
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

/** Twelve hops, C to C. A fifth is seven keys up; a fourth, five. */
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
		title: 'Next door',
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
		title: 'Skip one',
		emblem: hopEmblem(2),
		chain: false,
		make: (random) => {
			const counts = shuffle([2, 2, 2, 1, 1], random);
			const pcs = shuffle([1, 2, 3, 5, 6, 7, 8, 9, 10, 11], random);
			return [
				hop(start(0), 2, 'keys'),
				hop(start(4), 2, 'keys'),
				...counts.map((count, i) => hop(start(pcs[i]), count, 'card'))
			];
		}
	},
	{
		id: 'thirds',
		line: 'recipes',
		title: 'Small and big',
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
		title: 'The fifth',
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
		title: 'Major',
		emblem: shapeEmblem('major'),
		chain: false,
		make: recipeStop('major', 3, 3)
	},
	{
		id: 'minor',
		line: 'recipes',
		title: 'Minor',
		emblem: shapeEmblem('minor'),
		chain: false,
		make: recipeStop('minor', 3, 3)
	},
	{
		id: 'flip',
		line: 'recipes',
		title: 'Flip the third',
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
		title: 'Order up',
		emblem: shapeEmblem('major', [0, 1, 2]),
		chain: false,
		make: (random) => orders(['major', 'minor'], 8, random)
	},
	{
		id: 'stretch',
		line: 'recipes',
		title: 'Squeeze, stretch',
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
		title: 'Hang the third',
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
		title: 'Add a seventh',
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
		title: 'The seventh family',
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
		title: 'Missing note',
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
		title: 'Full menu',
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
		title: 'Up in fifths',
		emblem: { kind: 'wheel', direction: 1 },
		chain: true,
		make: () => trip(1, [...repeat('keys' as const, 3), ...repeat('card' as const, 9)])
	},
	{
		id: 'anticlockwise',
		line: 'circle',
		title: 'Up in fourths',
		emblem: { kind: 'wheel', direction: -1 },
		chain: true,
		make: () => trip(-1, [...repeat('keys' as const, 3), ...repeat('card' as const, 9)])
	},
	{
		id: 'by-heart',
		line: 'circle',
		title: 'By heart',
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
