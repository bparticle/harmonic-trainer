import { describe, expect, it } from 'vitest';
import {
	advance,
	BADGE_TIERS,
	callout,
	crossed,
	farewell,
	nextTier,
	noStreak,
	tierFor,
	TIERS,
	type Streak
} from './streak';

const run = (...landings: Array<'landed' | 'partial' | 'missed'>) =>
	landings.reduce(advance, noStreak());

const landed = (n: number): Streak => run(...Array.from({ length: n }, () => 'landed' as const));

describe('a streak of landed chords', () => {
	it('counts chords landed in a row', () => {
		expect(run('landed', 'landed', 'landed').count).toBe(3);
	});

	it('breaks on a missed chord', () => {
		expect(run('landed', 'landed', 'missed').count).toBe(0);
	});

	/*
	 * The bug this replaced. A half-landed chord used to hold the streak, on the
	 * grounds that this page never punishes — and landing one guide tone out of
	 * two is the commonest way to get a chord wrong, so a run of mistakes sailed
	 * past fifty untouched.
	 */
	it('breaks on a half-landed chord, which is still a chord you got wrong', () => {
		expect(run('landed', 'landed', 'partial').count).toBe(0);
		expect(run('landed', 'landed', 'partial', 'landed').count).toBe(1);
	});

	it('keeps the best run of the sitting through a break', () => {
		const streak = run('landed', 'landed', 'landed', 'missed', 'landed');
		expect(streak.count).toBe(1);
		expect(streak.best).toBe(3);
	});

	it('never lowers the best', () => {
		expect(run('landed', 'landed', 'missed', 'missed', 'missed').best).toBe(2);
	});
});

describe('the ladder', () => {
	it('says nothing at all below three', () => {
		expect(tierFor(0).name).toBe('');
		expect(tierFor(2).name).toBe('');
		expect(tierFor(2).intensity).toBe(0);
	});

	it('takes the highest tier the count has reached', () => {
		expect(tierFor(3).id).toBe('nice');
		expect(tierFor(5).id).toBe('nice');
		expect(tierFor(6).id).toBe('cooking');
		expect(tierFor(50).id).toBe('legend');
		expect(tierFor(999).id).toBe('legend');
	});

	it('reaches past fifty, which is a run people actually get to', () => {
		expect(TIERS.at(-1)?.from).toBeGreaterThanOrEqual(50);
	});

	it('climbs in both thresholds and intensity, and never sideways', () => {
		for (let i = 1; i < TIERS.length; i++) {
			expect(TIERS[i].from, TIERS[i].id).toBeGreaterThan(TIERS[i - 1].from);
			expect(TIERS[i].intensity, TIERS[i].id).toBeGreaterThan(TIERS[i - 1].intensity);
		}
	});

	it('tops out at one, which is what the aura is scaled against', () => {
		expect(TIERS.at(-1)?.intensity).toBe(1);
	});

	it('gives every tier a distinct id, since badges are stored under them', () => {
		expect(new Set(TIERS.map((tier) => tier.id)).size).toBe(TIERS.length);
	});

	it('counts every tier but standing still as a badge', () => {
		expect(BADGE_TIERS).toHaveLength(TIERS.length - 1);
		expect(BADGE_TIERS.every((tier) => tier.from > 0 && tier.name !== '')).toBe(true);
	});

	it('points at the next rung, and at nothing from the top', () => {
		expect(nextTier(0)?.id).toBe('nice');
		expect(nextTier(3)?.id).toBe('cooking');
		expect(nextTier(999)).toBeNull();
	});
});

describe('tiers crossed by one chord', () => {
	it('is empty while a streak climbs inside a tier', () => {
		expect(crossed(landed(3), landed(4))).toEqual([]);
	});

	it('names the tier the moment it is reached', () => {
		expect(crossed(landed(2), landed(3)).map((tier) => tier.id)).toEqual(['nice']);
		expect(crossed(landed(11), landed(12)).map((tier) => tier.id)).toEqual(['fire']);
	});

	it('is empty when the streak broke rather than grew', () => {
		expect(crossed(landed(30), { count: 0, best: 30 })).toEqual([]);
	});

	it('reports every rung when a jump skips some, which it should never have to', () => {
		expect(crossed({ count: 0, best: 0 }, { count: 12, best: 12 }).map((t) => t.id)).toEqual([
			'nice',
			'cooking',
			'fire'
		]);
	});
});

describe('what is worth saying out loud', () => {
	const at = (count: number): Streak => ({ count, best: count });

	it('stays quiet for the first couple of chords', () => {
		expect(callout(at(0), at(1))).toBeNull();
		expect(callout(at(1), at(2))).toBeNull();
	});

	it('announces a new tier by name', () => {
		expect(callout(at(2), at(3))).toBe('3× nice');
		expect(callout(at(5), at(6))).toBe('6× cooking');
		expect(callout(at(19), at(20))).toBe('20× in the pocket');
		expect(callout(at(49), at(50))).toBe('50× legendary');
	});

	it('marks every fifth chord inside a tier, and nothing between', () => {
		expect(callout(at(14), at(15))).toBe('15×');
		expect(callout(at(15), at(16))).toBeNull();
		expect(callout(at(16), at(17))).toBeNull();
	});

	it('says nothing when the streak did not grow', () => {
		expect(callout(at(6), at(6))).toBeNull();
		expect(callout(at(9), { count: 0, best: 9 })).toBeNull();
	});
});

describe('what is said when a streak ends', () => {
	const at = (count: number): Streak => ({ count, best: count });

	it('states the number reached, not the mistake that ended it', () => {
		expect(farewell(at(31), { count: 0, best: 31 })).toBe('31×');
	});

	it('lets a streak too short to have been one go quietly', () => {
		expect(farewell(at(2), { count: 0, best: 2 })).toBeNull();
	});

	it('says nothing while a streak is still running', () => {
		expect(farewell(at(9), at(10))).toBeNull();
	});
});
