import { describe, expect, it } from 'vitest';
import { advance, callout, noStreak, tierFor, TIERS } from './streak';

const run = (...landings: Array<'landed' | 'partial' | 'missed'>) =>
	landings.reduce(advance, noStreak());

describe('a streak of landed chords', () => {
	it('counts chords landed in a row', () => {
		expect(run('landed', 'landed', 'landed').count).toBe(3);
	});

	it('breaks on a missed chord', () => {
		expect(run('landed', 'landed', 'missed').count).toBe(0);
	});

	it('is held, not broken, by a half-landed chord', () => {
		// Nothing on this page punishes; a combo that shattered on a missed
		// seventh would be the first thing that did.
		expect(run('landed', 'landed', 'partial').count).toBe(2);
		expect(run('landed', 'landed', 'partial', 'landed').count).toBe(3);
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

describe('tiers', () => {
	it('says nothing at all below three', () => {
		expect(tierFor(0).name).toBe('');
		expect(tierFor(2).name).toBe('');
		expect(tierFor(2).intensity).toBe(0);
	});

	it('takes the highest tier the count has reached', () => {
		expect(tierFor(3).name).toBe('nice');
		expect(tierFor(5).name).toBe('nice');
		expect(tierFor(6).name).toBe('cooking');
		expect(tierFor(999).name).toBe('unreal');
	});

	it('never gets quieter as the count climbs', () => {
		let last = -1;
		for (let count = 0; count < 40; count++) {
			const { intensity } = tierFor(count);
			expect(intensity).toBeGreaterThanOrEqual(last);
			last = intensity;
		}
	});

	it('tops out at one, which is what the aura is scaled against', () => {
		expect(TIERS.at(-1)?.intensity).toBe(1);
	});
});

describe('what is worth saying out loud', () => {
	const at = (count: number) => ({ count, best: count });

	it('stays quiet for the first couple of chords', () => {
		expect(callout(at(0), at(1))).toBeNull();
		expect(callout(at(1), at(2))).toBeNull();
	});

	it('announces a new tier by name', () => {
		expect(callout(at(2), at(3))).toBe('3× nice');
		expect(callout(at(5), at(6))).toBe('6× cooking');
		expect(callout(at(9), at(10))).toBe('10× on fire');
	});

	it('marks every fifth chord inside a tier, and nothing between', () => {
		expect(callout(at(4), at(5))).toBe('5×');
		expect(callout(at(6), at(7))).toBeNull();
		expect(callout(at(7), at(8))).toBeNull();
	});

	it('says nothing when the streak did not grow', () => {
		// A held streak is not an event, and a broken one is not an occasion for
		// a caption.
		expect(callout(at(6), at(6))).toBeNull();
		expect(callout(at(9), { count: 0, best: 9 })).toBeNull();
	});
});
