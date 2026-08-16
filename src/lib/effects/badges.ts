import { BADGE_TIERS, crossed, type Streak, type Tier } from './streak';

/**
 * What the streaks leave behind.
 *
 * A combo that vanishes when the transport stops is worth exactly as much as
 * the run it happened in. This is the part that outlives the sitting: the best
 * you have ever done, the best on each tune, and one badge per tier, kept from
 * the first time you earned it.
 *
 * Each badge remembers the **chord it was won on**, as a pitch class, and that
 * is what colours it on the shelf. It is the one honest source of colour
 * available here: hue means pitch everywhere in this app and cannot be handed
 * a second meaning, so rather than inventing bronze and silver, a badge simply
 * wears the colour of the chord that clinched it. Fifty in a row landed on an
 * F7 leaves a green medal.
 *
 * Everything here is pure. Where the record is *kept* is the caller's problem —
 * see the play-along page, which puts it in local storage alongside the rest of
 * the player's preferences. Nothing touches the database: the tables the long
 * view would need are still parked, and a combo counter is not the thing that
 * should quietly start filling them.
 */

export type Badge = {
	/** The tier's stable id, not its name. */
	tier: string;
	/** The streak that earned it, which may be higher than the tier's threshold. */
	count: number;
	/** ISO timestamp, passed in rather than read, so this stays testable. */
	at: string;
	/** Pitch class of the chord it was won on. The badge's colour. */
	pc: number;
	/** Slug of the chart being played. */
	chart: string;
};

export type StreakRecord = {
	/** The best run of chords ever landed back to back. */
	best: number;
	/** The same, per chart, because a blues and a bebop head are not the same ask. */
	bestByChart: Record<string, number>;
	/** Earned badges, keyed by tier id. First one wins; later ones do not overwrite. */
	badges: Record<string, Badge>;
};

export const emptyRecord = (): StreakRecord => ({ best: 0, bestByChart: {}, badges: {} });

export type Won = {
	pc: number;
	chart: string;
	at: string;
};

/**
 * Fold one advanced streak into the record.
 *
 * Called after every judged chord, including the ones that break a streak —
 * `crossed` returns nothing and the maxima do not move, so a break costs a
 * comparison and changes nothing.
 *
 * A badge is kept from the **first** time it was earned rather than the best.
 * `best` already answers "how far have you got"; a badge answers "when did you
 * first get there", and overwriting it every time you pass through would turn
 * six dated milestones into six copies of the same afternoon.
 */
export function award(
	record: StreakRecord,
	before: Streak,
	after: Streak,
	won: Won
): { record: StreakRecord; earned: Tier[] } {
	const earned = crossed(before, after).filter((tier) => !record.badges[tier.id]);
	const previousOnChart = record.bestByChart[won.chart] ?? 0;

	if (earned.length === 0 && after.count <= record.best && after.count <= previousOnChart) {
		return { record, earned: [] };
	}

	const badges = { ...record.badges };
	for (const tier of earned) {
		badges[tier.id] = {
			tier: tier.id,
			count: after.count,
			at: won.at,
			pc: won.pc,
			chart: won.chart
		};
	}

	return {
		record: {
			best: Math.max(record.best, after.count),
			bestByChart: { ...record.bestByChart, [won.chart]: Math.max(previousOnChart, after.count) },
			badges
		},
		earned
	};
}

export const bestOn = (record: StreakRecord, chart: string): number =>
	record.bestByChart[chart] ?? 0;

export const earnedCount = (record: StreakRecord): number =>
	BADGE_TIERS.filter((tier) => record.badges[tier.id]).length;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asCount = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/**
 * Read a record back from wherever it was stored.
 *
 * Deliberately unforgiving about shape and forgiving about failure: anything
 * that does not parse is dropped and the rest is kept, so a hand-edited or
 * half-written entry costs you one badge rather than the whole shelf. Local
 * storage is the user's own file — it can and eventually will contain
 * something this code did not write.
 *
 * Badges under an unknown tier id are dropped too, which is what makes the
 * ladder safe to change: an id that no longer exists is not a badge anyone can
 * be shown.
 */
export function parseRecord(raw: unknown): StreakRecord {
	if (!isObject(raw)) return emptyRecord();

	const bestByChart: Record<string, number> = {};
	if (isObject(raw.bestByChart)) {
		for (const [chart, value] of Object.entries(raw.bestByChart)) {
			const count = asCount(value);
			if (count > 0) bestByChart[chart] = count;
		}
	}

	const known = new Set(BADGE_TIERS.map((tier) => tier.id));
	const badges: Record<string, Badge> = {};
	if (isObject(raw.badges)) {
		for (const [id, value] of Object.entries(raw.badges)) {
			if (!known.has(id) || !isObject(value)) continue;
			const count = asCount(value.count);
			const pc = typeof value.pc === 'number' ? ((value.pc % 12) + 12) % 12 : 0;
			if (count === 0) continue;
			badges[id] = {
				tier: id,
				count,
				at: typeof value.at === 'string' ? value.at : '',
				pc: Number.isFinite(pc) ? pc : 0,
				chart: typeof value.chart === 'string' ? value.chart : ''
			};
		}
	}

	// A stored `best` lower than a badge that was actually earned is not a fact
	// worth preserving; the badges are the harder evidence.
	const claimed = asCount(raw.best);
	const earnedHigh = Math.max(0, ...Object.values(badges).map((badge) => badge.count));
	const chartHigh = Math.max(0, ...Object.values(bestByChart));

	return { best: Math.max(claimed, earnedHigh, chartHigh), bestByChart, badges };
}
