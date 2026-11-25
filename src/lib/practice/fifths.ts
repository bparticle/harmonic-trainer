import { circleOfFifthsIndex, formatKey, key, keySignature } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

/*
 * Fifths — the circle of fifths as a game that keeps up with you.
 *
 * The first version taught in five fixed waves and unlocked the next one for
 * finishing the last, however it went. Sixteen misses out of sixteen still
 * said "Wave clear". The waves were three keys, then four, then six at once,
 * then two, then everything, and the last wave was the same 26 questions for
 * ever. Nothing remembered which keys were weak.
 *
 * Now every key carries a **strength**, 0 to 5, saved between visits:
 *
 * - Keys arrive one at a time, outward from C, alternating sharp and flat
 *   sides. The next arrives when every key already in play is **solid** (3),
 *   and never more than one a round. A player who misses keeps the keys they
 *   have; one who does not gets a new key every round.
 * - Below solid, any right answer first time adds one. From solid upward only
 *   a **quick** one does (under three seconds), so the top of the scale means
 *   instant recall rather than working it out. A miss takes one away.
 * - What a key can be asked depends on its strength (see `LENS_FLOOR`): found
 *   by name first, then its signature, then named from its place or found by
 *   its signature, and last reached by a step round the circle.
 * - Weak keys are asked more often, in proportion to how far they are from 5.
 *
 * A round is three **sets** of four questions, and a set asks one kind of
 * question. The first version changed the kind of question on every turn, so
 * every turn started with working out what to press. Holding the kind for
 * four turns keeps the thinking varied and the hands in one place.
 */

export type MajorKey = { name: string; signature: number; position: number; pc: number };

function major(name: string): MajorKey {
	const scale = key(name);
	const pc = pitchClass(scale.tonic);
	return {
		name: formatKey(scale, true),
		signature: keySignature(scale),
		position: circleOfFifthsIndex(pc),
		pc
	};
}

/** Every major key with seven or fewer accidentals, in the order they are introduced. */
export const KEYS: readonly MajorKey[] = [
	'C',
	'G',
	'F',
	'D',
	'Bb',
	'A',
	'Eb',
	'E',
	'Ab',
	'B',
	'Db',
	'F#',
	'Gb',
	'C#',
	'Cb'
].map(major);

/** C, G and F: nothing to learn about the circle with fewer than three. */
export const STARTING_KEYS = 3;
export const MAX_STRENGTH = 5;
export const SOLID = 3;
export const QUICK_MS = 3000;
export const SET_SIZE = 4;
export const SETS_PER_ROUND = 3;

export type Lens = 'find' | 'signature' | 'name' | 'find-signature' | 'step';

/** The strength a key needs before it can be asked this way. */
export const LENS_FLOOR: Record<Lens, number> = {
	find: 0,
	signature: 1,
	name: 2,
	'find-signature': 2,
	step: 3
};

export type Question =
	| { lens: 'intro'; target: MajorKey }
	| { lens: 'find' | 'find-signature'; target: MajorKey }
	| { lens: 'name' | 'signature'; target: MajorKey; choices: MajorKey[] }
	| { lens: 'step'; target: MajorKey; from: MajorKey; direction: 1 | -1 };

export type Turn = { question: Question; attempt: 0 | 1 };

/** Answered by tapping a station, rather than choosing from four. */
export function answeredOnRim(question: Question): boolean {
	return !('choices' in question);
}

/**
 * A played note answers any question that does not already name the key it
 * wants. Playing E♭ to "find E♭" would test nothing; playing it for "3♭", for
 * "B♭ one step clockwise" or for the marked station tests exactly the fact.
 */
export function answeredByNote(question: Question): boolean {
	return question.lens === 'name' || question.lens === 'find-signature' || question.lens === 'step';
}

export function signatureGlyph(signature: number): string {
	if (signature === 0) return '0';
	return `${Math.abs(signature)}${signature > 0 ? '♯' : '♭'}`;
}

export function signatureLabel(signature: number): string {
	if (signature === 0) return 'No sharps or flats';
	const count = Math.abs(signature);
	return `${count} ${signature > 0 ? 'sharp' : 'flat'}${count === 1 ? '' : 's'}`;
}

export function keysAt(position: number): MajorKey[] {
	return KEYS.filter((key) => key.position === position);
}

/** B and C♭, F♯ and G♭, D♭ and C♯ share a station; naming one there needs a side. */
export function sharesPosition(target: MajorKey): boolean {
	return keysAt(target.position).length > 1;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
	const copy = [...values];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export type Progress = {
	/** One entry per key in play. A key with no entry has not arrived yet. */
	strength: Record<string, number>;
	/** In play but not yet shown: the next round or set opens by showing them. */
	waiting: string[];
	bestStreak: number;
};

export function freshProgress(): Progress {
	const start = KEYS.slice(0, STARTING_KEYS).map((key) => key.name);
	return {
		strength: Object.fromEntries(start.map((name) => [name, 0])),
		waiting: start,
		bestStreak: 0
	};
}

export function inPlay(progress: Progress): MajorKey[] {
	return KEYS.filter((key) => key.name in progress.strength);
}

export function strengthOf(progress: Progress, key: MajorKey): number {
	return progress.strength[key.name] ?? 0;
}

export function nextKey(progress: Progress): MajorKey | undefined {
	return KEYS.find((key) => !(key.name in progress.strength));
}

/** Every key in play is solid and shown, and there is another to bring in. */
export function readyForNext(progress: Progress): boolean {
	const keys = inPlay(progress);
	return (
		progress.waiting.length === 0 &&
		nextKey(progress) !== undefined &&
		keys.every((key) => strengthOf(progress, key) >= SOLID)
	);
}

export function addKey(progress: Progress, key: MajorKey): Progress {
	if (key.name in progress.strength) return progress;
	return {
		...progress,
		strength: { ...progress.strength, [key.name]: 0 },
		waiting: [...progress.waiting, key.name]
	};
}

/**
 * Every key in at once, for a player who already knows the circle. They come
 * in at 1 rather than solid: claimed, not shown, so the game still has to see
 * each one answered before it treats it as known.
 */
export function openAll(progress: Progress): Progress {
	return {
		...progress,
		strength: Object.fromEntries(
			KEYS.map((key) => [key.name, Math.max(1, progress.strength[key.name] ?? 0)])
		),
		waiting: []
	};
}

/** The introduction was tapped: the key is in the game from here. */
export function meet(progress: Progress, key: MajorKey): Progress {
	return {
		...progress,
		strength: { ...progress.strength, [key.name]: Math.max(1, strengthOf(progress, key)) },
		waiting: progress.waiting.filter((name) => name !== key.name)
	};
}

export function strengthAfter(strength: number, outcome: { hit: boolean; quick: boolean }) {
	if (!outcome.hit) return Math.max(0, strength - 1);
	if (strength < SOLID || outcome.quick) return Math.min(MAX_STRENGTH, strength + 1);
	return strength;
}

/** Only a first attempt moves a key. A review is a second look, not evidence. */
export function scored(
	progress: Progress,
	key: MajorKey,
	outcome: { hit: boolean; quick: boolean }
): Progress {
	return {
		...progress,
		strength: {
			...progress.strength,
			[key.name]: strengthAfter(strengthOf(progress, key), outcome)
		}
	};
}

/**
 * How full a station's ring is drawn: the strength of every key that lives
 * there, out of everything those keys could reach. A shared station is half
 * full when one of its two keys is perfect, which is the truth about it.
 */
export function stationFill(progress: Progress, position: number): number {
	const here = keysAt(position);
	const total = here.reduce((sum, key) => sum + strengthOf(progress, key), 0);
	return total / (MAX_STRENGTH * here.length);
}

export function serializeProgress(progress: Progress) {
	return { version: 2, ...progress };
}

const isStrength = (value: unknown): value is number =>
	Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_STRENGTH;

/**
 * Read what was saved, whatever shape it is in.
 *
 * Version 1 saved only the furthest wave reached. Every wave before it was
 * finished, so its keys come in solid; the wave it stopped on starts fresh.
 */
export function parseProgress(raw: unknown): Progress {
	if (!raw || typeof raw !== 'object') return freshProgress();
	const saved = raw as Record<string, unknown>;

	if (saved.version === 2 && saved.strength && typeof saved.strength === 'object') {
		const stored = saved.strength as Record<string, unknown>;
		const strength: Record<string, number> = {};
		for (const key of KEYS) {
			if (isStrength(stored[key.name])) strength[key.name] = stored[key.name] as number;
		}
		if (Object.keys(strength).length === 0) return freshProgress();
		const waiting = Array.isArray(saved.waiting)
			? [...new Set(saved.waiting)].filter(
					(name): name is string => typeof name === 'string' && name in strength
				)
			: [];
		const bestStreak = Number.isSafeInteger(saved.bestStreak)
			? Math.max(0, saved.bestStreak as number)
			: 0;
		return { strength, waiting, bestStreak };
	}

	const unlocked = saved.unlocked;
	if (Number.isInteger(unlocked) && (unlocked as number) > 0 && (unlocked as number) <= 4) {
		const finished = [0, 3, 7, 13, 15][unlocked as number];
		return {
			strength: Object.fromEntries(KEYS.slice(0, finished).map((key) => [key.name, SOLID])),
			waiting: [],
			bestStreak: 0
		};
	}
	return freshProgress();
}

// ---------------------------------------------------------------------------
// Building a set
// ---------------------------------------------------------------------------

/** The keys in play one step either side of this one, by signature. */
function stepsInto(progress: Progress, target: MajorKey) {
	const keys = inPlay(progress);
	return ([1, -1] as const).flatMap((direction) => {
		const from = keys.find((key) => key.signature === target.signature - direction);
		return from ? [{ from, direction }] : [];
	});
}

/** The keys that may be asked this way now: shown, strong enough, and reachable. */
export function eligible(progress: Progress, lens: Lens): MajorKey[] {
	return inPlay(progress).filter(
		(key) =>
			!progress.waiting.includes(key.name) &&
			strengthOf(progress, key) >= LENS_FLOOR[lens] &&
			(lens !== 'step' || stepsInto(progress, key).length > 0)
	);
}

const LENSES: Lens[] = ['find', 'signature', 'name', 'find-signature', 'step'];

/**
 * How many keys a kind of question needs before it is worth a set. With two,
 * a set alternates between them and the answer is a coin toss: "1♯, 1♭, 1♯,
 * 1♭". Stepping needs four, because with only C, G and F in play every step
 * starts from C, and "C ↻" four times is one question asked four times.
 */
const LENS_POOL: Record<Lens, number> = {
	find: 3,
	signature: 3,
	name: 3,
	'find-signature': 3,
	step: 4
};

export function availableLenses(progress: Progress): Lens[] {
	return LENSES.filter((lens) => eligible(progress, lens).length >= LENS_POOL[lens]);
}

/** Something not yet asked this round if possible, and never the same twice running. */
export function chooseLens(progress: Progress, used: Lens[], random = Math.random): Lens {
	const available = availableLenses(progress);
	const unused = available.filter((lens) => !used.includes(lens));
	const notLast = available.filter((lens) => lens !== used.at(-1));
	const options = unused.length ? unused : notLast.length ? notLast : available;
	return options.length ? options[Math.floor(random() * options.length)] : 'find';
}

const weightOf = (strength: number) => (MAX_STRENGTH + 1 - strength) ** 2;

/**
 * Weak keys first, but a key already in this set counts for much less. Without
 * that, the two weakest keys alternated for a whole set — "A, E♭, A, E♭" —
 * which is drilling, not a game.
 */
function pickWeighted(
	keys: MajorKey[],
	progress: Progress,
	random: () => number,
	asked: MajorKey[] = []
): MajorKey {
	const weights = keys.map(
		(key) => weightOf(strengthOf(progress, key)) * (asked.includes(key) ? 0.3 : 1)
	);
	let roll = random() * weights.reduce((sum, weight) => sum + weight, 0);
	for (const [i, weight] of weights.entries()) {
		roll -= weight;
		if (roll < 0) return keys[i];
	}
	return keys[keys.length - 1];
}

/**
 * Three other keys to name the station with. Keys already in play first, so
 * the choice is between things the player has met; a station with two
 * spellings is asked for one side, and only that side's keys are offered.
 */
function nameChoices(target: MajorKey, progress: Progress, random: () => number): MajorKey[] {
	const side = sharesPosition(target) ? Math.sign(target.signature) : 0;
	const others = KEYS.filter(
		(key) => key.position !== target.position && (!side || Math.sign(key.signature) === side)
	);
	const known = shuffle(
		others.filter((key) => key.name in progress.strength),
		random
	);
	const rest = shuffle(
		others.filter((key) => !(key.name in progress.strength)),
		random
	);
	// One name per station. B and C♭ offered together would be two names for
	// one place, and could both be ruled out without knowing either.
	const distractors: MajorKey[] = [];
	for (const key of [...known, ...rest]) {
		if (distractors.length === 3) break;
		if (!distractors.some((other) => other.position === key.position)) distractors.push(key);
	}
	return shuffle([target, ...distractors], random);
}

/** The same count on the other side, and the counts either side of it. */
function signatureChoices(target: MajorKey, random: () => number): MajorKey[] {
	const distance = (key: MajorKey) =>
		Math.abs(Math.abs(key.signature) - Math.abs(target.signature));
	const others = shuffle(
		KEYS.filter((key) => key !== target),
		random
	).sort((a, b) => distance(a) - distance(b));
	return shuffle([target, ...others.slice(0, 3)], random);
}

function ask(lens: Lens, target: MajorKey, progress: Progress, random: () => number): Question {
	switch (lens) {
		case 'name':
			return { lens, target, choices: nameChoices(target, progress, random) };
		case 'signature':
			return { lens, target, choices: signatureChoices(target, random) };
		case 'step': {
			const steps = stepsInto(progress, target);
			const { from, direction } = steps[Math.floor(random() * steps.length)];
			return { lens, target, from, direction };
		}
		default:
			return { lens, target };
	}
}

/**
 * Four questions of one kind, weighted to weak keys, with no key twice in a
 * row. Keys in `must` are asked at least once: a key that has just been shown
 * is found straight away, while where it lives is still fresh. Weighting alone
 * left a newly shown D out of the very next set in the first playtest.
 */
export function buildSet(
	progress: Progress,
	lens: Lens,
	random = Math.random,
	previous?: MajorKey,
	must: MajorKey[] = []
): Question[] {
	const pool = eligible(progress, lens);
	if (pool.length === 0) return [];
	const targets: MajorKey[] = [];
	let last = previous;
	for (let i = 0; i < SET_SIZE; i++) {
		const options = pool.length > 1 ? pool.filter((key) => key !== last) : pool;
		const target = pickWeighted(options, progress, random, targets);
		targets.push(target);
		last = target;
	}
	for (const key of must.filter((key) => pool.includes(key)).slice(0, SET_SIZE)) {
		if (targets.includes(key)) continue;
		// Replace a key that is not owed a question, or one asked twice.
		const slot = targets.findIndex(
			(target, i) =>
				(!must.includes(target) || targets.indexOf(target) !== targets.lastIndexOf(target)) &&
				(i === 0 ? previous : targets[i - 1]) !== key &&
				targets[i + 1] !== key
		);
		if (slot !== -1) targets[slot] = key;
	}
	return targets.map((target) => ask(lens, target, progress, random));
}

/**
 * Move past the turn just answered.
 *
 * A miss comes round again two questions later, once, with its choices
 * reshuffled so the position of the right answer is not what is remembered.
 * An introduction stays until it is tapped.
 */
export function requeue(queue: Turn[], hit: boolean, random = Math.random): Turn[] {
	const [turn, ...rest] = queue;
	if (!turn) return [];
	if (turn.question.lens === 'intro') return hit ? rest : queue;
	if (hit || turn.attempt === 1) return rest;
	const { question } = turn;
	const again: Question =
		'choices' in question ? { ...question, choices: shuffle(question.choices, random) } : question;
	rest.splice(2, 0, { question: again, attempt: 1 });
	return rest;
}
