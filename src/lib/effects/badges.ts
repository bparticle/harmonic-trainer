import { BADGE_TIERS, crossed, type Streak, type Tier } from './streak';

/**
 * What the streaks leave behind.
 *
 * A combo that vanishes when the transport stops is worth exactly as much as
 * the run it happened in. This is the part that outlives the sitting: one badge
 * per tier per tune, kept from the first time you earned it there.
 *
 * Each badge remembers the **chord it was won on**, as a pitch class, and that
 * is what colours it on the shelf. It is the one honest source of colour
 * available here: hue means pitch everywhere in this app and cannot be handed
 * a second meaning, so rather than inventing bronze and silver, a badge simply
 * wears the colour of the chord that clinched it. Fifty in a row landed on an
 * F7 leaves a green medal.
 *
 * **No best is stored here any more.** A streak cannot outlive the transport —
 * it is counted from the moment the transport starts — so the best ever is
 * `MAX(best_streak)` over `play_runs` and the best on a tune is the same
 * grouped by slug. Keeping a second copy alongside the badges meant the two
 * could disagree, and `parseRecord` carried a reconciliation that existed for
 * no other reason. One place the answer comes from, and nothing to reconcile.
 *
 * Everything here is pure. Where the record is *kept* is the caller's problem:
 * the database owns it, and the play-along page keeps a copy in local storage
 * so the shelf paints before the network answers and a run played on a train
 * still counts.
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
	/** Slug of the chart it was won on. */
	chart: string;
	/** The key it was won in. */
	key: string;
};

/**
 * Earned badges, by chart and then by tier.
 *
 * Keyed per chart since M9, which is what makes a badge worth having more than
 * once: under the old global rule, earning `nice` on the first tune meant never
 * earning it again on anything, so the shelf recorded one afternoon rather than
 * a repertoire.
 */
export type StreakRecord = { badges: Record<string, Record<string, Badge>> };

export const emptyRecord = (): StreakRecord => ({ badges: {} });

export type Won = {
	pc: number;
	chart: string;
	at: string;
	key: string;
};

/**
 * Fold one advanced streak into the record.
 *
 * Called after every judged chord, including the ones that break a streak —
 * `crossed` returns nothing and the record is handed straight back, so a break
 * costs a comparison and changes nothing.
 *
 * A badge is kept from the **first** time it was earned on that tune rather
 * than the best. The best answers "how far have you got"; a badge answers "when
 * did you first get there", and overwriting it every time you passed through
 * would turn six dated milestones into six copies of the same afternoon.
 */
export function award(
	record: StreakRecord,
	before: Streak,
	after: Streak,
	won: Won
): { record: StreakRecord; earned: Tier[] } {
	const onChart = record.badges[won.chart] ?? {};
	const earned = crossed(before, after).filter((tier) => !onChart[tier.id]);
	if (earned.length === 0) return { record, earned: [] };

	const updated = { ...onChart };
	for (const tier of earned) {
		updated[tier.id] = {
			tier: tier.id,
			count: after.count,
			at: won.at,
			pc: won.pc,
			chart: won.chart,
			key: won.key
		};
	}

	return { record: { badges: { ...record.badges, [won.chart]: updated } }, earned };
}

/*
 * The waiting shelf.
 *
 * A badge is a claim about a tune — *I held fifty in a row on this* — and until
 * this milestone you could make that claim without having played the tune. Two
 * bars looped at full tempo, cleanly, and the whole shelf lit up. The streak was
 * honest; what it was a streak *of* was two chords.
 *
 * So a badge now waits for the form to have been round. Not for the run to end,
 * and not for a goal to be met: the moment the transport has been through every
 * bar of the chart, everything earned so far lands at once. Playing the tune
 * from the top therefore feels exactly as it did — the first chorus of a blues
 * takes about twenty seconds and the badges arrive on the downbeat of the second
 * — and looping a turnaround for an hour earns nothing.
 *
 * The feedback while playing is untouched, and deliberately. The streak counts,
 * the callouts fire, the tempo shows: you should be able to woodshed two bars
 * and see how it is going. What you cannot do is take the medal home.
 *
 * `held` is kept apart from `StreakRecord` rather than being a flag inside it,
 * because it has a different lifetime — it belongs to one run of the transport
 * and dies with it, where the record outlives everything. Nothing here is ever
 * written to storage.
 */

/** A badge that has been earned and not yet paid out. */
export type Held = { tier: Tier; won: Won; count: number };

/** Earned this run and still waiting, by tier id. First earned wins, as ever. */
export type Waiting = Record<string, Held>;

export const nothingHeld = (): Waiting => ({});

/**
 * Fold an advanced streak into the waiting shelf instead of into the record.
 *
 * The same question `award` asks — which tiers did this streak just cross that
 * the tune does not already hold — with the answer put somewhere it can be taken
 * back. A tier already waiting is not replaced, so a run that crosses `nice`
 * twice pays out one badge dated the first time, exactly as the record's own
 * rule says it should.
 */
export function holdBack(
	record: StreakRecord,
	waiting: Waiting,
	before: Streak,
	after: Streak,
	won: Won
): { waiting: Waiting; held: Tier[] } {
	const onChart = record.badges[won.chart] ?? {};
	const fresh = crossed(before, after).filter((tier) => !onChart[tier.id] && !waiting[tier.id]);
	if (fresh.length === 0) return { waiting, held: [] };

	const updated = { ...waiting };
	for (const tier of fresh) updated[tier.id] = { tier, won, count: after.count };
	return { waiting: updated, held: fresh };
}

/**
 * Pay out everything that was waiting, now that the form has been round.
 *
 * Each badge keeps the moment it was *earned* rather than the moment it landed:
 * `won.at` was recorded when the streak crossed the tier, half a chorus ago. A
 * badge answers "when did you first get there", and rewriting the timestamp to
 * the downbeat that released it would be the record telling a small lie about a
 * fact it already had right.
 */
export function release(
	record: StreakRecord,
	waiting: Waiting
): { record: StreakRecord; earned: Held[] } {
	const held = Object.values(waiting);
	if (held.length === 0) return { record, earned: [] };

	const badges = { ...record.badges };
	for (const { tier, won, count } of held) {
		const onChart = badges[won.chart] ?? {};
		if (onChart[tier.id]) continue;
		badges[won.chart] = {
			...onChart,
			[tier.id]: { tier: tier.id, count, at: won.at, pc: won.pc, chart: won.chart, key: won.key }
		};
	}

	return { record: { badges }, earned: held };
}

/** This tune's shelf. */
export const badgesOn = (record: StreakRecord, chart: string): Record<string, Badge> =>
	record.badges[chart] ?? {};

/** Every badge won, across every tune, newest last. */
export const allBadges = (record: StreakRecord): Badge[] =>
	Object.values(record.badges)
		.flatMap((byTier) => Object.values(byTier))
		.sort((a, b) => a.at.localeCompare(b.at));

/** How many of this tune's six are on the shelf. */
export const earnedCount = (record: StreakRecord, chart: string): number =>
	BADGE_TIERS.filter((tier) => badgesOn(record, chart)[tier.id]).length;

/**
 * Badges in the first record that the second has never heard of.
 *
 * This is how a shelf that lived only in a browser reaches the record: on the
 * first load after M9 the cache holds badges the database does not, and they
 * are posted rather than quietly dropped. It stays useful afterwards for
 * anything earned while the network was away.
 */
export const missingFrom = (mine: StreakRecord, theirs: StreakRecord): Badge[] =>
	allBadges(mine).filter((badge) => !badgesOn(theirs, badge.chart)[badge.tier]);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asCount = (value: unknown): number =>
	typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

/** A badge, or nothing. Unknown tiers are dropped, which is what makes the ladder safe to change. */
function parseBadge(tier: string, chart: string, value: unknown): Badge | null {
	if (!KNOWN_TIERS.has(tier) || !isObject(value)) return null;

	const count = asCount(value.count);
	if (count === 0) return null;

	const raw = typeof value.pc === 'number' ? ((value.pc % 12) + 12) % 12 : 0;
	return {
		tier,
		count,
		at: typeof value.at === 'string' ? value.at : '',
		pc: Number.isFinite(raw) ? raw : 0,
		chart,
		key: typeof value.key === 'string' ? value.key : ''
	};
}

const KNOWN_TIERS = new Set(BADGE_TIERS.map((tier) => tier.id));

/**
 * Read a record back from wherever it was stored.
 *
 * Deliberately unforgiving about shape and forgiving about failure: anything
 * that does not parse is dropped and the rest is kept, so a hand-edited or
 * half-written entry costs you one badge rather than the whole shelf. Local
 * storage is the user's own file — it can and eventually will contain something
 * this code did not write.
 *
 * It also reads the flat, tier-keyed record that shipped before M9, and the
 * migration is lossless because `Badge.chart` has been recorded since the day
 * badges shipped: every stored badge already knows which tune won it and moves
 * to that tune's shelf with its date and its colour intact. One that names no
 * chart is dropped, which is the rule this function already applied to anything
 * that did not parse. Nothing is invented — a badge whose key was never
 * recorded gets an empty one rather than a guess.
 */
export function parseRecord(raw: unknown): StreakRecord {
	if (!isObject(raw) || !isObject(raw.badges)) return emptyRecord();

	const badges: Record<string, Record<string, Badge>> = {};
	const keep = (badge: Badge | null) => {
		if (!badge || !badge.chart) return;
		badges[badge.chart] ??= {};
		badges[badge.chart][badge.tier] = badge;
	};

	for (const [key, value] of Object.entries(raw.badges)) {
		// The pre-M9 shape keyed badges by tier, so `key` is a tier id and the
		// chart is inside. The current one keys by chart, and the value is a map.
		if (isObject(value) && typeof value.count === 'number') {
			keep(parseBadge(key, typeof value.chart === 'string' ? value.chart : '', value));
			continue;
		}
		if (!isObject(value)) continue;
		for (const [tier, entry] of Object.entries(value)) keep(parseBadge(tier, key, entry));
	}

	return { badges };
}
