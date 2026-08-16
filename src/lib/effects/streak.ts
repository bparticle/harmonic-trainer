import type { Landing } from '$lib/practice/match';

/**
 * Chords landed in a row.
 *
 * A game mechanic bolted onto an honest score, and kept strictly separate from
 * it: `Tally` is what happened, this is how loud to be about it. Nothing here
 * feeds the percentage on screen, so turning the fireworks off changes what the
 * app celebrates and never what it reports.
 *
 * It is also deliberately forgiving in one direction only. A half-landed chord
 * *holds* the streak rather than growing or breaking it, because the standing
 * rule on this page is that nothing is punished — silence is dropped, outside
 * notes are reported and never scored, and nothing anywhere goes red. A combo
 * that shattered on a missed seventh would be the first thing in the app to
 * tell you off.
 */

export type Streak = {
	/** Chords landed since the last miss. */
	count: number;
	/** The best run of this sitting, which survives a break. */
	best: number;
};

export type Tier = {
	/** The count at which this tier takes over. */
	from: number;
	/** Shown on the callout. Lower case: this is enthusiasm, not shouting. */
	name: string;
	/** 0–1, driving how bright the aura burns and how much of a burst you get. */
	intensity: number;
};

/**
 * Five steps, the first of which says nothing at all.
 *
 * Three is where a streak starts being real — two landed chords in a row
 * happens by accident inside any ii–V — and sixteen is roughly two passes of a
 * blues without dropping one, which has earned whatever the screen does next.
 */
export const TIERS: readonly Tier[] = [
	{ from: 0, name: '', intensity: 0 },
	{ from: 3, name: 'nice', intensity: 0.35 },
	{ from: 6, name: 'cooking', intensity: 0.6 },
	{ from: 10, name: 'on fire', intensity: 0.82 },
	{ from: 16, name: 'unreal', intensity: 1 }
];

export const noStreak = (): Streak => ({ count: 0, best: 0 });

export function tierFor(count: number): Tier {
	let found = TIERS[0];
	for (const tier of TIERS) if (count >= tier.from) found = tier;
	return found;
}

/**
 * Fold one judged chord into the streak.
 *
 * `best` is only ever raised, so the number to beat outlives the run that set
 * it — which is the whole reason to keep it.
 */
export function advance(streak: Streak, landing: Landing): Streak {
	if (landing === 'partial') return streak;
	if (landing === 'missed') return { count: 0, best: streak.best };

	const count = streak.count + 1;
	return { count, best: Math.max(count, streak.best) };
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

	const tier = tierFor(after.count);
	if (tier.from !== tierFor(before.count).from) return `${after.count}× ${tier.name}`;
	return after.count % 5 === 0 ? `${after.count}×` : null;
}
