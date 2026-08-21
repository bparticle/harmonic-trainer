import { BADGE_TIERS } from '$lib/effects/streak';
import { GUIDE_TONE_TARGET } from './goal';

/**
 * How fast something was held, as a share of the tune's own tempo.
 *
 * Fifty in a row at 60 and fifty in a row at 140 are not the same achievement,
 * and until this existed the app could not tell them apart — so the top of the
 * ladder was reachable by slowing down until it was easy, which is the one thing
 * a practice tool must not reward.
 *
 * **A band is a share, never an absolute.** Three Little Birds is played at 99
 * and rhythm changes at 100, and those two numbers mean opposite things: one is
 * the tempo the song goes at, the other is a bebop vehicle taken at walking pace
 * to get it clean. A ballad at 60 is a ballad; a bebop head at 60 is homework.
 * Every chart carries the tempo it is meant to go at, so the same five words
 * stay honest on a ballad and on a burner.
 *
 * **A band has no colour, and must not get one.** Hue means pitch everywhere in
 * this app, and a tempo has no pitch in it — so there is no bronze, silver and
 * gold here, no green for fast and no heat scale. A badge goes on wearing the
 * pitch class of the chord that clinched it, and the band beside it is drawn in
 * weight: ink, dim ink, a mark's position on a track, the number itself.
 *
 * **Nothing here punishes.** A tier held at a crawl is a fact and an invitation,
 * never an inferior badge: thirty-two in a row at 63% of the tempo is real work,
 * obviously unfinished, and the words below have to say the second half without
 * taking away the first.
 *
 * Everything is pure. Where the tempos come from is the caller's problem — see
 * `loadTempoGrades`, which asks the runs.
 */

export type BandId = 'learning' | 'working' | 'nearly' | 'attempo' | 'past';

export type Band = {
	/** Stable across renames: it travels over the wire and is matched on. */
	id: BandId;
	/** The share of the tune's tempo, in percent, at which this band takes over. */
	from: number;
	/** Shown on the shelf. Lower case, like the tiers: enthusiasm, not shouting. */
	name: string;
	/**
	 * What the band means, said once here rather than in every component that
	 * draws it. Each of these has to read as an invitation rather than a verdict
	 * — including, especially, the two at the bottom.
	 */
	says: string;
};

/**
 * The five bands.
 *
 * `past` exists because taking a tune faster than it goes is a real practice
 * device, and a scale that stops at "correct" would have nothing to say to
 * somebody who has finished.
 */
export const BANDS: readonly Band[] = [
	{
		id: 'learning',
		from: 0,
		name: 'learning',
		says: 'Slow and clean is how this gets learned, and the tune’s own tempo is somewhere to go.'
	},
	{
		id: 'working',
		from: 60,
		name: 'working',
		says: 'Real work at this tempo, with road above it.'
	},
	{
		id: 'nearly',
		from: 80,
		name: 'nearly',
		says: 'Within sight of the tempo the tune goes at.'
	},
	{
		id: 'attempo',
		from: 100,
		name: 'at tempo',
		says: 'At the tempo the tune goes at.'
	},
	{
		id: 'past',
		from: 120,
		name: 'past tempo',
		says: 'Above the tempo the tune goes at, which is showing off and is allowed.'
	}
];

export const bandById = (id: string): Band | undefined => BANDS.find((band) => band.id === id);

/** Where a band sits on the ladder, or −1 for one this build has never had. */
export const bandRank = (id: BandId | null): number =>
	id === null ? -1 : BANDS.findIndex((band) => band.id === id);

/** The band above this one, or null at the top. There is nothing above `past`. */
export const bandAbove = (id: BandId): Band | null => BANDS[bandRank(id) + 1] ?? null;

/**
 * What a band starts at on one tune, in bpm.
 *
 * Rounded up rather than down, so the number shown is inside the band it names:
 * 80% of 160 is 128 exactly, and 80% of 99 is 79.2, which has to be asked for as
 * 80 rather than as 79 for the answer to grade as `nearly`.
 */
export const bpmForBand = (band: Band, target: number): number | null =>
	Number.isFinite(target) && target > 0 ? Math.ceil((target * band.from) / 100) : null;

/**
 * A tempo, graded against the tempo its tune goes at.
 *
 * Both numbers are kept beside the verdict so that anything drawing this can say
 * where the grade came from. A percentage on its own is the kind of number this
 * project does not ship.
 */
export type TempoGrade = {
	/** The fastest this was held at. */
	bpm: number;
	/** The tune's own tempo, from `charts.ts` or from the `charts` row. */
	target: number;
	/** `bpm` as a share of `target`, in whole percent. */
	percent: number;
	band: BandId;
};

/**
 * The share of the tune's tempo, rounded to whole percent.
 *
 * Rounded before it is graded rather than after, so the band and the number
 * printed beside it can never disagree — 95 against a target of 160 is 59% and
 * `learning`, and 96 is 60% and `working`, with nothing in between able to
 * print 60% while being graded as the band below.
 */
export function shareOfTarget(bpm: number, target: number): number | null {
	if (!Number.isFinite(bpm) || !Number.isFinite(target)) return null;
	if (bpm <= 0 || target <= 0) return null;
	return Math.round((bpm / target) * 100);
}

export function bandFor(percent: number): Band {
	let found = BANDS[0];
	for (const band of BANDS) if (percent >= band.from) found = band;
	return found;
}

/**
 * Grade one tempo, or refuse to.
 *
 * Null when the tune's tempo is not known — a chart of your own that has since
 * been deleted leaves runs behind with nothing to measure them against, and an
 * invented target would be the first estimate in a record that has never held
 * one. Nothing shown is better than a number nobody can trace.
 */
export function grade(bpm: number, target: number): TempoGrade | null {
	const percent = shareOfTarget(bpm, target);
	if (percent === null) return null;
	return { bpm: Math.round(bpm), target: Math.round(target), percent, band: bandFor(percent).id };
}

/** The fact and then the invitation, in that order, and never the other way round. */
export function describeGrade(value: TempoGrade): string {
	const band = bandById(value.band);
	return `Held at ${value.bpm} — ${value.percent}% of the ${value.target} this tune goes at. ${band?.says ?? ''}`.trim();
}

/**
 * One run's contribution: how long the streak got, and how fast it was held.
 *
 * The shape the log hands over, deliberately narrow — this module never sees a
 * user, a date or a chart, so the whole ladder can be tested without a database.
 */
export type StreakTempo = { bestStreak: number; bpm: number };

/**
 * The fastest a streak of at least `from` has ever been held at.
 *
 * This is the roadmap's query — `max(bpm) where best_streak >= tier.from` —
 * applied in code rather than six times in SQL, so that the ladder stays in one
 * place and stays testable. Null when nothing has reached that far, which is
 * different from having reached it slowly.
 */
export function fastestAtLeast(runs: readonly StreakTempo[], from: number): number | null {
	let fastest: number | null = null;
	for (const run of runs) {
		if (run.bestStreak < from || run.bpm <= 0) continue;
		if (fastest === null || run.bpm > fastest) fastest = run.bpm;
	}
	return fastest;
}

/** One tune's badges, graded. Keyed by tier id, and missing a tier means nothing has reached it. */
export type TempoShelf = Record<string, TempoGrade>;

/**
 * Grade every rung of the ladder against one tune's runs.
 *
 * Derived, never stored: M9 deleted a stored best because it could drift from
 * the runs that justified it, and a stored tempo grade would be that same bug
 * wearing a new name. The badge goes on answering *when did you first get
 * there*; this answers *how fast have you held it*, and neither can contradict
 * the other because there is only one place each comes from.
 *
 * A tier is graded by the fastest run that got that far, so a later, faster run
 * upgrades every band at or below the streak it reached — which is exactly what
 * "re-earning a tier faster upgrades the band" has to mean in the rows.
 */
export function gradeShelf(runs: readonly StreakTempo[], target: number): TempoShelf {
	const shelf: TempoShelf = {};
	for (const tier of BADGE_TIERS) {
		const bpm = fastestAtLeast(runs, tier.from);
		if (bpm === null) continue;
		const graded = grade(bpm, target);
		if (graded) shelf[tier.id] = graded;
	}
	return shelf;
}

/** The highest band anything on this shelf has been held at. */
export function bestBand(shelf: TempoShelf): TempoGrade | null {
	let best: TempoGrade | null = null;
	for (const graded of Object.values(shelf)) {
		if (!best || graded.percent > best.percent) best = graded;
	}
	return best;
}

// ---------------------------------------------------------------------------
// The ladder, which suggests
// ---------------------------------------------------------------------------

/**
 * "Start slow, stay consistent, move up", on the other axis.
 *
 * The key ladder's shape applied to tempo, and it behaves identically: **it
 * suggests, it never gates.** There is no function below that returns "not
 * allowed", no band that has to be unlocked and no tempo that stops being
 * playable because of anything here. Any tune goes at any tempo at any moment,
 * exactly as any tune goes in any key; what the ladder does is notice that a
 * band has been held cleanly and say what the next one up would cost.
 *
 * Per tune, because tempo does not transfer the way a numeral does — holding
 * rhythm changes at 100 says nothing whatever about a bossa.
 *
 * **What "held it" means, and where the definition comes from.** M15 already
 * decided that: a mission's goal is met when a run lands `GUIDE_TONE_TARGET`%
 * of its guide tones. That number is imported rather than restated, so there is
 * one bar in the app and not two, and moving it moves both.
 *
 * The mission goal has a second half the record cannot answer — *over how many
 * choruses* — because a `play_runs` row keeps the percentage and not how far
 * round the form the run got, and reconstructing choruses from bar numbers would
 * be a weaker second copy of `barsCovered` living in SQL. Rather than invent a
 * substitute, the ladder borrows a floor the app already has: the run must also
 * have reached the **first rung of the streak ladder**, because three in a row
 * is where `streak.ts` says a streak starts being real. So one chord played
 * perfectly does not set a tune's band, and no new number was made up to say so.
 */

/**
 * One run, as the ladder reads it.
 *
 * Four numbers, all of them columns on `play_runs`. This module never sees a
 * user, a date or a chart, so the whole ladder stays testable without a database
 * — the same narrowness `StreakTempo` has, for the same reason.
 */
export type HeldRun = {
	/** The tempo the run is graded at: where its best streak was clinched. */
	bpm: number;
	/** Chord occurrences something was played over. Silence is not counted. */
	voiced: number;
	/** Of those, the ones that landed every guide tone. */
	landed: number;
	/** How long the best streak in the run got. */
	bestStreak: number;
};

/** The least a streak has to be to count as one at all — the shelf's own first rung. */
const FIRST_RUNG = BADGE_TIERS[0].from;

/**
 * Did this run hold the tune?
 *
 * The mission's bar, asked of a run the record already holds. `landed` over
 * `voiced` is the very number `evaluateGoal` judges — `accuracy` counts chords,
 * not tones — so this is the same question reaching the same answer, and not a
 * second opinion about what counts as holding something together.
 */
export function heldCleanly(run: HeldRun): boolean {
	if (run.voiced <= 0 || run.bestStreak < FIRST_RUNG) return false;
	return Math.round((run.landed / run.voiced) * 100) >= GUIDE_TONE_TARGET;
}

/**
 * What one tune's ladder has to say.
 *
 * Every field is nullable because every field can honestly be unknown: a tune
 * nothing has been held clean on has no band, and a tune held past its own tempo
 * has nothing above it. Nothing here is a permission.
 */
export type TempoLadder = {
	/** The highest band a clean run has been held at. Null when none has. */
	held: BandId | null;
	/** The tempo that run was held at. */
	bpm: number | null;
	/** That tempo as a share of the tune's own, in whole percent. */
	percent: number | null;
	/** The tune's own tempo, so anything drawing this can say where the grade came from. */
	target: number;
	/** The band above `held` — suggested, never required. Null at the top and before the start. */
	next: BandId | null;
	/** What `next` starts at on this tune, in bpm. */
	nextBpm: number | null;
};

export const noLadder = (target: number): TempoLadder => ({
	held: null,
	bpm: null,
	percent: null,
	target: Math.round(target),
	next: null,
	nextBpm: null
});

/**
 * One tune's ladder, from its runs.
 *
 * The fastest band held cleanly, and the one above it. A run that did not clear
 * the bar is not counted against anybody — it simply has no say in where the
 * ladder is, which is the difference between a ladder that suggests and a gate
 * that judges.
 */
export function suggestLadder(runs: readonly HeldRun[], target: number): TempoLadder {
	let best: TempoGrade | null = null;
	for (const run of runs) {
		if (!heldCleanly(run)) continue;
		const graded = grade(run.bpm, target);
		if (!graded) continue;
		if (!best || graded.percent > best.percent) best = graded;
	}

	if (!best) return noLadder(target);

	const held = bandFor(best.percent);
	const next = bandAbove(held.id);

	return {
		held: held.id,
		bpm: best.bpm,
		percent: best.percent,
		target: best.target,
		next: next?.id ?? null,
		nextBpm: next ? bpmForBand(next, best.target) : null
	};
}

/**
 * The ladder in a line: what has been held, then what is above it, then the
 * reminder that neither is a rule.
 *
 * The fact before the invitation, as everywhere else in this module, and the
 * last clause is load-bearing rather than decorative — it is the "suggests,
 * never gates" rule said out loud on the screen where somebody might otherwise
 * assume a tempo had been taken away from them.
 */
export function describeLadder(ladder: TempoLadder): string {
	const held = ladder.held ? bandById(ladder.held) : null;
	if (!held || ladder.bpm === null || ladder.percent === null) {
		return `Nothing held clean on this tune yet — a run that lands ${GUIDE_TONE_TARGET}% of its guide tones with a streak going sets the band. Every tempo is playable meanwhile.`;
	}

	const stood = `Held clean at ${held.name} — ${ladder.bpm}, ${ladder.percent}% of the ${ladder.target} this tune goes at.`;
	const next = ladder.next ? bandById(ladder.next) : null;
	if (!next || ladder.nextBpm === null) {
		return `${stood} There is no band above this one, and nothing to collect for being here.`;
	}

	return `${stood} Next band up is ${next.name}, from ${ladder.nextBpm}. It is a suggestion: any tempo stays playable.`;
}

/**
 * Has this run taken the tune somewhere it has never been held?
 *
 * The one thing the fun layer is allowed to make a noise about, and only when it
 * is genuinely a first: the band has to be above the one the record already
 * holds and above anything already said this sitting. `learning` is where every
 * tune starts, so arriving in it is not a crossing and is never announced.
 *
 * Nothing about the record depends on this. It decides whether a word appears on
 * a screen and nothing else, so a player with the fireworks switched off loses a
 * callout and keeps every number.
 */
export function bandCrossed(input: {
	bpm: number;
	target: number;
	/** The highest band the record already holds for this tune. */
	heldBefore: BandId | null;
	/** Bands already said out loud in this sitting. */
	said?: readonly BandId[];
}): Band | null {
	const graded = grade(input.bpm, input.target);
	if (!graded) return null;

	const band = bandFor(graded.percent);
	// The ground floor is not a crossing: every tune begins here.
	if (bandRank(band.id) <= 0) return null;
	if (bandRank(band.id) <= bandRank(input.heldBefore)) return null;
	if (input.said?.includes(band.id)) return null;
	return band;
}

// ---------------------------------------------------------------------------
// Whether the last month moved anything
// ---------------------------------------------------------------------------

/**
 * How far back "lately" reaches when asking whether tempo is moving.
 *
 * Thirty days rather than a calendar month, because a calendar month makes the
 * answer depend on which day you look at it.
 */
export const MOVEMENT_DAYS = 30;

/**
 * One tune, graded twice: as the record stood before the window, and as it
 * stands now.
 *
 * `before` is null when every run on the tune is inside the window, which is not
 * a tune standing still — it is a tune with nothing to compare against, and the
 * two must never be reported as the same thing.
 */
export type TempoMovement = {
	chartSlug: string;
	before: TempoGrade | null;
	now: TempoGrade | null;
};

export type MonthReading = {
	/** Tunes the window took to a faster band than they had before it. */
	raised: TempoMovement[];
	/** Tunes with history on both sides that kept the band they already had. */
	steady: number;
	/** Tunes whose whole history is inside the window: nothing to compare. */
	tooNew: number;
};

/**
 * Read the month, refusing to say more than the rows do.
 *
 * A tune counts as raised only when the whole record's band is above the band
 * the record held before the window opened. The other direction is deliberately
 * not reported: the band on a tune is the fastest it has *ever* been held, so it
 * cannot go down, and a quiet month is a quiet month rather than a decline.
 */
export function readMovement(rows: readonly TempoMovement[]): MonthReading {
	const reading: MonthReading = { raised: [], steady: 0, tooNew: 0 };

	for (const row of rows) {
		if (!row.now) continue;
		if (!row.before) {
			reading.tooNew++;
			continue;
		}
		if (row.now.percent > row.before.percent) reading.raised.push(row);
		else reading.steady++;
	}

	return reading;
}

/**
 * The month in one neutral line, or nothing at all.
 *
 * The hard case is a month in which nothing moved, and the rule is that it is
 * never a reproach: the sentence says what the tunes did — held the band they
 * already had — rather than what the player failed to do. And a record too young
 * to compare says exactly that, because "not enough history to say" is the
 * normal early state of a figure about improvement and reads as a fact.
 */
export function describeMonth(reading: MonthReading): string {
	const tunes = (count: number) => `${count} ${count === 1 ? 'tune' : 'tunes'}`;

	if (reading.raised.length > 0) {
		return `${tunes(reading.raised.length)} moved to a faster band in the last ${MOVEMENT_DAYS} days.`;
	}
	if (reading.steady > 0) {
		const already = reading.steady === 1 ? 'it' : 'they';
		return `${tunes(reading.steady)} held the band ${already} already had over the last ${MOVEMENT_DAYS} days.`;
	}
	if (reading.tooNew > 0) {
		return `Not enough history to say yet: every run on record is inside the last ${MOVEMENT_DAYS} days, so there is nothing before them to compare against.`;
	}
	return '';
}

// ---------------------------------------------------------------------------
// The record, over the wire
// ---------------------------------------------------------------------------

/** Every tune's shelf and every tune's ladder. The shape the page is handed. */
export type TempoRecord = {
	byChart: Record<string, TempoShelf>;
	/**
	 * What the ladder suggests, per tune.
	 *
	 * A tune the record has never seen is absent. A tune with runs but nothing
	 * held clean is present with nulls and its own tempo, which is not the same
	 * thing — the second has somewhere to go and the first has not been played.
	 */
	ladders: Record<string, TempoLadder>;
};

export const noTempo = (): TempoRecord => ({ byChart: {}, ladders: {} });

/** This tune's bands, or none — a tune never played grades nothing. */
export const bandsOn = (record: TempoRecord, chart: string): TempoShelf =>
	record.byChart[chart] ?? {};

/** This tune's ladder, or none. Absent means the ladder has nothing to say yet. */
export const ladderOn = (record: TempoRecord, chart: string): TempoLadder | null =>
	record.ladders[chart] ?? null;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const whole = (value: unknown): number | null => {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

/**
 * Trust nothing off the wire, including our own answer to our own post.
 *
 * The same rule `parseBests` follows, for the same reason: the page is also a
 * cache the player can edit, and a grade that arrives unreadable costs one badge
 * its band rather than costing the shelf its bands.
 */
export function parseTempoRecord(raw: unknown): TempoRecord {
	if (!isObject(raw) || !isObject(raw.byChart)) return noTempo();

	const byChart: Record<string, TempoShelf> = {};
	for (const [chart, shelf] of Object.entries(raw.byChart)) {
		if (!chart || !isObject(shelf)) continue;

		const graded: TempoShelf = {};
		for (const [tier, value] of Object.entries(shelf)) {
			if (!isObject(value)) continue;
			const bpm = whole(value.bpm);
			const target = whole(value.target);
			const band = typeof value.band === 'string' ? bandById(value.band) : undefined;
			if (bpm === null || target === null || !band) continue;

			// Re-derived rather than read: the percentage and the band are functions
			// of the two tempos, and a wire format is not allowed a third opinion.
			const rebuilt = grade(bpm, target);
			if (rebuilt) graded[tier] = rebuilt;
		}

		if (Object.keys(graded).length > 0) byChart[chart] = graded;
	}

	return { byChart, ladders: parseLadders(raw.ladders) };
}

/**
 * The ladders off the wire, rebuilt rather than believed.
 *
 * Only two of the six fields are read — the band held and the tempo it was held
 * at — and everything else is derived from them again here. A wire that claims
 * `working` is followed by `past` at 40bpm gets the ladder this build actually
 * has, which is the same rule the shelf's grades are read under.
 */
function parseLadders(raw: unknown): Record<string, TempoLadder> {
	if (!isObject(raw)) return {};

	const ladders: Record<string, TempoLadder> = {};
	for (const [chart, value] of Object.entries(raw)) {
		if (!chart || !isObject(value)) continue;

		const target = whole(value.target);
		if (target === null) continue;

		const bpm = whole(value.bpm);
		const held = typeof value.held === 'string' ? bandById(value.held) : undefined;
		if (bpm === null || !held) {
			// A tune whose ladder says nothing still knows the tune's own tempo,
			// which is the one thing worth keeping: it is what the next band would
			// be measured against the moment something is held clean.
			ladders[chart] = noLadder(target);
			continue;
		}

		ladders[chart] = suggestLadder(
			// The one run it takes to reach the band claimed, at the tempo claimed.
			// Rebuilding through `suggestLadder` rather than assembling the fields by
			// hand means the wire cannot produce a ladder this module would not.
			[{ bpm, voiced: 1, landed: 1, bestStreak: FIRST_RUNG }],
			target
		);
	}

	return ladders;
}
