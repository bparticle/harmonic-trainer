import type { Verdict } from './goal';
import type { Landing, Tally } from './match';

/**
 * A run of the transport, on its way to the record.
 *
 * The shape here is the shape of the tables, deliberately: `play_runs` and
 * `chord_attempts` flattened, so the endpoint that receives this copies fields
 * rather than translating them. A wire format that disagrees with its schema is
 * a second vocabulary nobody asked for.
 *
 * **The id is generated on this side.** That is what makes a flush idempotent
 * on replay — the same run posted twice is `on conflict do nothing` — and it is
 * the schema's own convention, written down when the practice session was
 * expected to run offline out of IndexedDB and drain later. A run played on a
 * train should not cost a badge.
 */

export type AttemptPayload = {
	id: string;
	/** Bar of the form, not of the loop. */
	bar: number;
	/** As it sounded, in the key it was played in. */
	chord: string;
	/** As the chart stores it. */
	numeral: string;
	/** The key it was heard in, which is not necessarily the tune's home key. */
	localKey: string;
	landing: Landing;
	found: number;
	needed: number;
	notesChord: number;
	notesColour: number;
	notesOutside: number;
	atMs: number;
};

export type RunPayload = {
	id: string;
	chartSlug: string;
	/** Set only for a chart of your own; the built-ins live in code. */
	chartId: string | null;
	/**
	 * The mission block this run answered, or null for a free run.
	 *
	 * Null stays the common case: playing along belongs to no session, exactly as
	 * it always has. When it is set, a goal's verdict traces through it to the run
	 * and to every chord attempt that earned it — the house rule that every number
	 * traces to a row, applied to goals.
	 */
	sessionBlockId: string | null;
	keyCenter: string;
	bpm: number;
	/** The groove it was played over: `swing`, `rock`, `bossa`… */
	groove: string;
	startedAt: string;
	endedAt: string | null;
	playingMs: number;
	voiced: number;
	landed: number;
	partial: number;
	missed: number;
	notesChord: number;
	notesColour: number;
	notesOutside: number;
	bestStreak: number;
	/**
	 * The tempo showing when that best streak was last raised, or null.
	 *
	 * Null is honest and common: a run where nothing was ever landed twice in a
	 * row never raised a best, and there is no tempo to name. Sent as its own
	 * field rather than derived from `bpm`, because the whole reason it exists is
	 * that the two can differ — the transport's tempo moves while it runs, and
	 * `bpm` is where the slider ended up.
	 */
	bestStreakBpm: number | null;
	attempts: AttemptPayload[];
};

export type BadgePayload = {
	chartSlug: string;
	tier: string;
	wonAt: string;
	count: number;
	pc: number;
	keyCenter: string;
	/** The run it was won in, or null for one being carried in from local storage. */
	runId: string | null;
};

/**
 * How a mission's block ended up, on its way to `session_blocks.result_json`.
 *
 * It rides in the same post as the run it names rather than in a queue of its
 * own. A mission played with the network away is then one thing waiting and not
 * two that could arrive apart: the run turns up on the next load with its
 * verdict beside it, and until then the block simply is not finished yet.
 */
export type BlockResultPayload = {
	blockId: string;
	/** The run that answered it, which is in the same post. */
	runId: string;
	verdict: Verdict;
};

/**
 * One post. Runs first, then the badges and the block results, because both may
 * name a run.
 */
export type Flush = {
	runs: RunPayload[];
	badges: BadgePayload[];
	blocks: BlockResultPayload[];
};

/**
 * The best ever and the best on each tune, derived from the runs and never
 * stored. Lives here rather than beside the queries because the page reads it
 * too — over the wire from the loader and again from the answer to a flush.
 */
export type Bests = { best: number; byChart: Record<string, number> };

export const noBests = (): Bests => ({ best: 0, byChart: {} });

/** Trust nothing off the wire, including our own answer to our own post. */
export function parseBests(raw: unknown): Bests {
	if (typeof raw !== 'object' || raw === null) return noBests();
	const value = raw as Record<string, unknown>;

	const byChart: Record<string, number> = {};
	if (typeof value.byChart === 'object' && value.byChart !== null) {
		for (const [chart, count] of Object.entries(value.byChart)) {
			const number = Number(count);
			if (Number.isFinite(number) && number > 0) byChart[chart] = Math.floor(number);
		}
	}

	const best = Number(value.best);
	return {
		best: Number.isFinite(best) && best > 0 ? Math.floor(best) : 0,
		byChart
	};
}

export const emptyFlush = (): Flush => ({ runs: [], badges: [], blocks: [] });

export const isEmpty = (flush: Flush): boolean =>
	flush.runs.length === 0 && flush.badges.length === 0 && flush.blocks.length === 0;

/** Flatten a run's totals into the columns that hold them. */
export function tallyColumns(tally: Tally) {
	return {
		voiced: tally.voiced,
		landed: tally.landed,
		partial: tally.partial,
		missed: tally.missed,
		notesChord: tally.notes.chord,
		notesColour: tally.notes.colour,
		notesOutside: tally.notes.outside
	};
}

/*
 * The outbox.
 *
 * Local storage stops being the record in M9 and becomes a write-through cache
 * in front of it. This is the half of that which matters when the network is
 * not there: what has been played and not yet accepted.
 *
 * A `Storage` is passed in rather than reached for, so all of this is testable
 * without a browser — the same reason `judge` takes pitch classes instead of
 * reading the MIDI session.
 */

export const OUTBOX_KEY = 'backing:outbox-v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readOutbox(store: StorageLike): Flush {
	try {
		const raw = store.getItem(OUTBOX_KEY);
		return raw ? parseFlush(JSON.parse(raw)) : emptyFlush();
	} catch {
		// An outbox that will not parse costs you the runs in it, never the page.
		return emptyFlush();
	}
}

/**
 * Add to whatever is already waiting.
 *
 * Merged rather than queued as separate posts: a sitting spent offline should
 * arrive as one request, and the server treats replays as no-ops anyway, so
 * there is nothing to gain by keeping the attempts apart.
 */
export function queue(store: StorageLike, flush: Flush): Flush {
	const merged = mergeFlush(readOutbox(store), flush);
	write(store, merged);
	return merged;
}

/**
 * Drop exactly what was accepted, and keep anything that arrived meanwhile.
 *
 * Clearing the whole key instead would lose a run that finished while the
 * previous post was still in flight — which is precisely the sitting where
 * somebody is playing hard enough for it to matter.
 */
export function settle(store: StorageLike, sent: Flush): Flush {
	const sentRuns = new Set(sent.runs.map((run) => run.id));
	const sentBadges = new Set(sent.badges.map(badgeKey));
	const sentBlocks = new Set(sent.blocks.map(blockKey));
	const current = readOutbox(store);

	const left: Flush = {
		runs: current.runs.filter((run) => !sentRuns.has(run.id)),
		badges: current.badges.filter((badge) => !sentBadges.has(badgeKey(badge))),
		blocks: current.blocks.filter((block) => !sentBlocks.has(blockKey(block)))
	};

	write(store, left);
	return left;
}

/**
 * A badge is one per tune per tier, so that pair is its identity while it sits
 * in the outbox. The bar is safe to join them with because a slug is
 * `[a-z0-9-]+` and a tier id is one of a closed set — neither can contain one.
 * Nothing outside this module sees the key: what gets written is the badge
 * itself, and the server settles duplicates on a unique constraint instead.
 */
const badgeKey = (badge: BadgePayload) => `${badge.chartSlug}|${badge.tier}`;

/**
 * A block result is identified by the run that reached it, not by the block.
 *
 * A mission can be played twice before either post gets through, and both are
 * things that happened. Keying on the block alone would drop the second before
 * the server had a chance to decide which of them finished it.
 */
const blockKey = (block: BlockResultPayload) => `${block.blockId} ${block.runId}`;

function write(store: StorageLike, flush: Flush): void {
	if (isEmpty(flush)) store.removeItem(OUTBOX_KEY);
	else store.setItem(OUTBOX_KEY, JSON.stringify(flush));
}

function mergeFlush(a: Flush, b: Flush): Flush {
	const runs = [...a.runs];
	const known = new Set(runs.map((run) => run.id));
	for (const run of b.runs) if (!known.has(run.id)) runs.push(run);

	const badges = [...a.badges];
	const seen = new Set(badges.map(badgeKey));
	// First earned wins here too, so a replay cannot rewrite a badge's date.
	for (const badge of b.badges) if (!seen.has(badgeKey(badge))) badges.push(badge);

	const blocks = [...a.blocks];
	const reached = new Set(blocks.map(blockKey));
	for (const block of b.blocks) if (!reached.has(blockKey(block))) blocks.push(block);

	return { runs, badges, blocks };
}

/**
 * Anything that is not a flush this code wrote is dropped rather than trusted.
 *
 * A missing list is an empty one, which is what makes an outbox written before
 * missions existed readable now: a browser holding a run from last week has no
 * `blocks` in it, and that run belonged to no session anyway.
 */
function parseFlush(raw: unknown): Flush {
	if (typeof raw !== 'object' || raw === null) return emptyFlush();
	const value = raw as Record<string, unknown>;
	return {
		runs: Array.isArray(value.runs) ? (value.runs as RunPayload[]) : [],
		badges: Array.isArray(value.badges) ? (value.badges as BadgePayload[]) : [],
		blocks: Array.isArray(value.blocks) ? (value.blocks as BlockResultPayload[]) : []
	};
}
