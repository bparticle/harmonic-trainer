import type { Landing } from '$lib/practice/match';

/**
 * Chords landed in a row.
 *
 * A game mechanic bolted onto an honest score, and kept strictly separate from
 * it: `Tally` is what happened, this is how loud to be about it. Nothing here
 * feeds the percentage on screen, so turning the fireworks off changes what the
 * app celebrates and never what it reports.
 *
 * **A streak breaks on anything short of landing the chord.** The first version
 * let a half-landed chord hold it, reasoning that this page never punishes —
 * silence is dropped, outside notes are reported and never scored, nothing goes
 * red. That reasoning was right about the score and wrong about the combo.
 * Landing one guide tone out of two is the commonest way to get a chord wrong,
 * so in practice a run of mistakes would sail past fifty untouched, and a
 * counter that survives your mistakes is not counting anything.
 *
 * The non-punishment rule still holds where it belongs. A chord you played
 * nothing over is still dropped rather than failed — resting through four bars
 * is something musicians do on purpose — and a broken streak still costs you
 * nothing but the number.
 */

export type Streak = {
	/** Chords landed since the last one that was not. */
	count: number;
	/** The best run since the transport last started. */
	best: number;
};

export type Tier = {
	/**
	 * Stable across renames, because badges are stored under it. Change a
	 * `name` freely; changing an `id` orphans whatever anyone had earned.
	 */
	id: string;
	/** The count at which this tier takes over. */
	from: number;
	/** Shown on the callout and the badge. Lower case: enthusiasm, not shouting. */
	name: string;
	/** 0–1, driving how hard the aura burns. */
	intensity: number;
};

/**
 * The ladder.
 *
 * Three is where a streak starts being real — two landed chords in a row
 * happens by accident inside any ii–V. From there the gaps widen roughly by
 * half each time, so every badge costs meaningfully more than the last one and
 * the top of the ladder is a genuine sitting's work: fifty chords in a row is
 * three passes of a blues without dropping one.
 */
export const TIERS: readonly Tier[] = [
	{ id: 'none', from: 0, name: '', intensity: 0 },
	{ id: 'nice', from: 3, name: 'nice', intensity: 0.3 },
	{ id: 'cooking', from: 6, name: 'cooking', intensity: 0.48 },
	{ id: 'fire', from: 12, name: 'on fire', intensity: 0.64 },
	{ id: 'pocket', from: 20, name: 'in the pocket', intensity: 0.78 },
	{ id: 'untouchable', from: 32, name: 'untouchable', intensity: 0.9 },
	{ id: 'legend', from: 50, name: 'legendary', intensity: 1 }
];

/** Every tier that is worth a badge — which is all of them except standing still. */
export const BADGE_TIERS: readonly Tier[] = TIERS.filter((tier) => tier.from > 0);

export const noStreak = (): Streak => ({ count: 0, best: 0 });

export function tierFor(count: number): Tier {
	let found = TIERS[0];
	for (const tier of TIERS) if (count >= tier.from) found = tier;
	return found;
}

/** The one being climbed towards, or null at the top of the ladder. */
export function nextTier(count: number): Tier | null {
	return TIERS.find((tier) => tier.from > count) ?? null;
}

/**
 * Fold one judged chord into the streak.
 *
 * `best` is only ever raised, so the number to beat outlives the break that
 * set it — which is the whole reason to keep it.
 */
export function advance(streak: Streak, landing: Landing): Streak {
	if (landing !== 'landed') return { count: 0, best: streak.best };

	const count = streak.count + 1;
	return { count, best: Math.max(count, streak.best) };
}

/**
 * Tiers crossed by one chord, lowest first.
 *
 * Normally none or one, since a streak climbs a chord at a time. It returns a
 * list anyway so that awarding badges never has to assume that.
 */
export function crossed(before: Streak, after: Streak): Tier[] {
	if (after.count <= before.count) return [];
	return BADGE_TIERS.filter((tier) => tier.from > before.count && tier.from <= after.count);
}

/**
 * What, if anything, is worth saying out loud about the streak just extended.
 *
 * Something on every chord would be wallpaper — the burst already covers that —
 * so a callout is reserved for the two moments that are actually news: reaching
 * a new tier, and every fifth chord after it.
 */
export function callout(before: Streak, after: Streak): string | null {
	if (after.count < TIERS[1].from || after.count <= before.count) return null;

	const [reached] = crossed(before, after).slice(-1);
	if (reached) return `${after.count}× ${reached.name}`;
	return after.count % 5 === 0 ? `${after.count}×` : null;
}

/**
 * What to say when a streak ends, or null when it was not one worth marking.
 *
 * Stating the number reached rather than the mistake that ended it. The
 * distinction matters on this page: "31×" is the record of a good run, and
 * anything phrased as a loss would be the first thing here to tell you off.
 */
export function farewell(before: Streak, after: Streak): string | null {
	if (after.count !== 0 || before.count < TIERS[1].from) return null;
	return `${before.count}×`;
}
