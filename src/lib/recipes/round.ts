import { pitchClass } from '$lib/music/note';
import { seeded, stopById, STOP_IDS, type Item, type StopId } from './line';

/**
 * A round: one ride through a stop.
 *
 * Pure, and reproducible from its spec. The page plays it; the server replays
 * it. Nothing in a submitted round is taken on trust except what the player
 * did with each item, and even that has to line up with the items the seed
 * produces.
 */

export const ROUND_VERSION = 1;

export type RoundSpec = {
	line: 'recipes';
	stop: StopId;
	seed: number;
	/**
	 * Played clean before, so the copy-it-on-the-keys items are not needed: they
	 * are served with the card instead, and count.
	 */
	practised: boolean;
	version: typeof ROUND_VERSION;
};

export function itemsFor(spec: RoundSpec): Item[] {
	const stop = stopById(spec.stop);
	if (!stop) throw new Error(`No such stop: ${spec.stop}`);
	const items = stop.make(seeded(spec.seed));
	return spec.practised
		? items.map((item) => (item.hint === 'keys' ? { ...item, hint: 'card' as const } : item))
		: items;
}

/** An item is scored unless it was there to be copied. */
export const isScored = (item: Item) => item.hint !== 'keys';

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

/** What has happened on one item so far. */
export type Plate = {
	/** Indices into `item.tones`, in the order they were found. */
	found: number[];
	/** Pitch classes played that are not in the shape, in order. */
	strays: number[];
	/** The answer was demonstrated. */
	shown: boolean;
};

export const emptyPlate = (): Plate => ({ found: [], strays: [], shown: false });

export type Heard =
	/** A wanted note, found. */
	| { kind: 'found'; tone: number }
	/** A note already sounding, or already found. Not wrong; just not news. */
	| { kind: 'again' }
	/** Not in the shape. `keys` is how far above the root it was, when there is a root to count from. */
	| { kind: 'stray'; pc: number; keys: number | null };

/**
 * A note was played.
 *
 * Marked by pitch class, in any octave: the question is always which key, and
 * an E is the third of C wherever it is played.
 */
export function hear(item: Item, plate: Plate, note: number): { plate: Plate; heard: Heard } {
	const pc = ((note % 12) + 12) % 12;
	const tone = item.wanted.find(
		(i) => pitchClass(item.tones[i].note) === pc && !plate.found.includes(i)
	);
	if (tone !== undefined) {
		return { plate: { ...plate, found: [...plate.found, tone] }, heard: { kind: 'found', tone } };
	}
	const sounding = [...item.given, ...plate.found];
	if (sounding.some((i) => pitchClass(item.tones[i].note) === pc)) {
		return { plate, heard: { kind: 'again' } };
	}
	return {
		plate: { ...plate, strays: [...plate.strays, pc] },
		heard: { kind: 'stray', pc, keys: keysAboveRoot(item, plate, pc) }
	};
}

/** How far above the root a note sits, if the root is on the keys yet. */
export function keysAboveRoot(item: Item, plate: Plate, pc: number): number | null {
	const rootSounding = item.given.includes(0) || plate.found.includes(0);
	if (!rootSounding) return null;
	return (pc - pitchClass(item.tones[0].note) + 12) % 12;
}

export const isComplete = (item: Item, plate: Plate) =>
	item.wanted.every((i) => plate.found.includes(i));

// ---------------------------------------------------------------------------
// The round
// ---------------------------------------------------------------------------

/** How one served item went. */
export type Outcome = {
	item: number;
	/** Served again at the end, after a slip the first time. */
	again: boolean;
	strays: number;
	shown: boolean;
};

export type Round = {
	spec: RoundSpec;
	items: Item[];
	queue: Array<{ item: number; again: boolean }>;
	position: number;
	outcomes: Outcome[];
};

export function begin(spec: RoundSpec): Round {
	const items = itemsFor(spec);
	return {
		spec,
		items,
		queue: items.map((_, item) => ({ item, again: false })),
		position: 0,
		outcomes: []
	};
}

export const current = (round: Round) => round.queue[round.position] ?? null;
export const isOver = (round: Round) => round.position >= round.queue.length;
export const isClean = (o: Pick<Outcome, 'strays' | 'shown'>) => o.strays === 0 && !o.shown;

/**
 * The item on the plate is finished.
 *
 * A scored item that took a slip or a demonstration is served once more at the
 * end of the round, so the last time it is met it is met cleanly — but only
 * once, and only on a stop whose items stand alone. A second time round counts
 * for nothing in the score; it is there so the round ends on the right note.
 */
export function serve(round: Round, plate: { strays: number; shown: boolean }): Round {
	const entry = current(round);
	if (!entry) return round;
	const outcome: Outcome = {
		item: entry.item,
		again: entry.again,
		strays: plate.strays,
		shown: plate.shown
	};
	const chain = stopById(round.spec.stop)?.chain ?? false;
	const sendBack = !chain && !entry.again && isScored(round.items[entry.item]) && !isClean(outcome);
	return {
		...round,
		position: round.position + 1,
		outcomes: [...round.outcomes, outcome],
		queue: sendBack ? [...round.queue, { item: entry.item, again: true }] : round.queue
	};
}

export type RoundResult = {
	/** Items that count. */
	total: number;
	/** Of those, played right first time with no help. */
	clean: number;
};

export function resultOf(round: Round): RoundResult {
	const scored = round.outcomes.filter((o) => !o.again && isScored(round.items[o.item]));
	return { total: scored.length, clean: scored.filter(isClean).length };
}

// ---------------------------------------------------------------------------
// Checking a submitted round
// ---------------------------------------------------------------------------

const MAX_STRAYS = 500;

export type Submission = { id: string; spec: RoundSpec; outcomes: Outcome[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Rebuild a round from what the page sent, or refuse it.
 *
 * The page sends its spec and how each item went. The items themselves are
 * regenerated here from the seed, and the outcomes have to walk the same queue
 * the page walked — including every item sent round again — or the round is
 * refused whole. The result is then worked out here rather than read from the
 * body, so the number on the record is always one this code computed.
 */
export function replay(value: unknown): { submission: Submission; result: RoundResult } | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (typeof raw.id !== 'string' || !UUID.test(raw.id)) return null;
	const spec = parseSpec(raw.spec);
	if (!spec || !Array.isArray(raw.outcomes)) return null;

	let round = begin(spec);
	if (raw.outcomes.length > round.queue.length * 2) return null;
	for (const item of raw.outcomes) {
		if (!item || typeof item !== 'object') return null;
		const o = item as Record<string, unknown>;
		const entry = current(round);
		if (
			!entry ||
			o.item !== entry.item ||
			o.again !== entry.again ||
			typeof o.shown !== 'boolean' ||
			!Number.isInteger(o.strays) ||
			(o.strays as number) < 0 ||
			(o.strays as number) > MAX_STRAYS
		) {
			return null;
		}
		round = serve(round, { strays: o.strays as number, shown: o.shown });
	}
	if (!isOver(round)) return null;
	return {
		submission: { id: raw.id, spec, outcomes: round.outcomes },
		result: resultOf(round)
	};
}

function parseSpec(value: unknown): RoundSpec | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (
		raw.line !== 'recipes' ||
		raw.version !== ROUND_VERSION ||
		!STOP_IDS.includes(raw.stop as StopId) ||
		typeof raw.practised !== 'boolean' ||
		!Number.isSafeInteger(raw.seed) ||
		(raw.seed as number) < 0 ||
		(raw.seed as number) > 0xffffffff
	) {
		return null;
	}
	return {
		line: 'recipes',
		stop: raw.stop as StopId,
		seed: raw.seed as number,
		practised: raw.practised,
		version: ROUND_VERSION
	};
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** What the record holds for one stop. */
export type StopRecord = {
	rounds: number;
	/** The best share of a round played clean, 0–1, or null before the first. */
	best: number | null;
};

export type LineRecord = Record<StopId, StopRecord>;

export function emptyRecord(): LineRecord {
	return Object.fromEntries(STOP_IDS.map((id) => [id, { rounds: 0, best: null }])) as LineRecord;
}

/** A clean round once means the copying is no longer needed there. */
export const isPractised = (record: StopRecord | undefined) => record?.best === 1;
