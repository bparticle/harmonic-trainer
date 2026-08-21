import { BADGE_TIERS } from '$lib/effects/streak';

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

/** Every tune's shelf, graded. The shape the page is handed. */
export type TempoRecord = { byChart: Record<string, TempoShelf> };

export const noTempo = (): TempoRecord => ({ byChart: {} });

/** This tune's bands, or none — a tune never played grades nothing. */
export const bandsOn = (record: TempoRecord, chart: string): TempoShelf =>
	record.byChart[chart] ?? {};

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

	return { byChart };
}
