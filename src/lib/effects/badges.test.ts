import { describe, expect, it } from 'vitest';
import {
	allBadges,
	award,
	badgesOn,
	earnedCount,
	emptyRecord,
	parseRecord,
	type StreakRecord
} from './badges';
import { BADGE_TIERS, type Streak } from './streak';

const at = (count: number): Streak => ({ count, best: count });
const won = { pc: 5, chart: 'blues', at: '2026-08-16T10:00:00.000Z', key: 'F' };

/** Walk a record up to `count` one chord at a time, the way the page does. */
function climb(to: number, context = won, from = emptyRecord()): StreakRecord {
	let record = from;
	for (let n = 1; n <= to; n++) record = award(record, at(n - 1), at(n), context).record;
	return record;
}

describe('earning a badge', () => {
	it('gives nothing away before the first tier', () => {
		expect(earnedCount(climb(2), 'blues')).toBe(0);
	});

	it('awards a tier the moment its streak is reached', () => {
		const { earned } = award(emptyRecord(), at(2), at(3), won);
		expect(earned.map((tier) => tier.id)).toEqual(['nice']);
	});

	it('records the streak, the chord it was won on, the key, and when', () => {
		expect(badgesOn(climb(3), 'blues').nice).toEqual({
			tier: 'nice',
			count: 3,
			at: won.at,
			pc: 5,
			chart: 'blues',
			key: 'F'
		});
	});

	it('collects them all on a long enough run', () => {
		expect(earnedCount(climb(50), 'blues')).toBe(BADGE_TIERS.length);
	});

	/*
	 * A badge answers "when did you first get there", and overwriting it on every
	 * pass would turn six dated milestones into six copies of the same afternoon.
	 */
	it('keeps a badge from the first time it was earned', () => {
		const first = climb(6);
		const later = climb(6, { ...won, pc: 9, at: '2027-01-01T00:00:00.000Z' }, first);

		expect(badgesOn(later, 'blues').nice.at).toBe(won.at);
		expect(badgesOn(later, 'blues').nice.pc).toBe(5);
	});

	it('does not award the same tier twice on the same tune', () => {
		const { earned } = award(climb(6), at(2), at(3), won);
		expect(earned).toEqual([]);
	});

	it('costs nothing and changes nothing when a streak breaks', () => {
		const before = climb(12);
		const after = award(before, at(12), { count: 0, best: 12 }, won);
		expect(after.record).toBe(before);
		expect(after.earned).toEqual([]);
	});
});

/*
 * The whole point of the change: a new tune starts with an empty shelf. Under
 * the old global rule, earning `nice` once meant never earning it again on
 * anything, so every tune after the first one was unrewarded.
 */
describe('a badge belongs to the tune it was won on', () => {
	it('starts a second tune with an empty shelf', () => {
		const blues = climb(12);
		expect(earnedCount(blues, 'rhythm-changes')).toBe(0);

		const { earned } = award(blues, at(2), at(3), { ...won, chart: 'rhythm-changes' });
		expect(earned.map((tier) => tier.id)).toEqual(['nice']);
	});

	it('keeps the two shelves apart', () => {
		const both = climb(6, { ...won, chart: 'rhythm-changes', pc: 9 }, climb(12));

		expect(Object.keys(badgesOn(both, 'blues'))).toEqual(['nice', 'cooking', 'fire']);
		expect(Object.keys(badgesOn(both, 'rhythm-changes'))).toEqual(['nice', 'cooking']);
		expect(badgesOn(both, 'rhythm-changes').nice.pc).toBe(9);
	});

	it('reports an empty shelf for a tune never played', () => {
		expect(badgesOn(climb(5), 'stella')).toEqual({});
	});

	it('lists everything won across every tune, oldest first', () => {
		const later = { ...won, chart: 'ja-da', at: '2026-09-01T10:00:00.000Z' };
		const record = climb(3, later, climb(3));

		expect(allBadges(record).map((badge) => [badge.chart, badge.at])).toEqual([
			['blues', won.at],
			['ja-da', later.at]
		]);
	});
});

describe('reading a record back', () => {
	it('survives anything that is not a record at all', () => {
		for (const junk of [null, undefined, 3, 'nope', [], true, {}]) {
			expect(parseRecord(junk)).toEqual(emptyRecord());
		}
	});

	it('round-trips a real one through JSON', () => {
		const record = climb(6, { ...won, chart: 'ja-da' }, climb(20));
		expect(parseRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
	});

	it('drops a badge under a tier id that no longer exists', () => {
		// This is what makes the ladder safe to rename or reorder.
		const parsed = parseRecord({
			badges: { blues: { ancient: { count: 9, at: '', pc: 3 } } }
		});
		expect(parsed.badges).toEqual({});
	});

	it('keeps the good entries when one of them is rubbish', () => {
		const parsed = parseRecord({
			badges: { blues: { nice: { count: 3, at: 'then', pc: 2 }, cooking: 'not a badge' } }
		});
		expect(Object.keys(badgesOn(parsed, 'blues'))).toEqual(['nice']);
	});

	it('normalises a pitch class that arrived out of range', () => {
		const parsed = parseRecord({ badges: { blues: { nice: { count: 3, at: '', pc: -7 } } } });
		expect(badgesOn(parsed, 'blues').nice.pc).toBe(5);
	});

	it('rejects counts that are not counts', () => {
		const parsed = parseRecord({ badges: { blues: { nice: { count: 0, at: '', pc: 0 } } } });
		expect(parsed.badges).toEqual({});
	});
});

/*
 * The record that shipped before M9 keyed badges by tier and kept a `best`
 * alongside them. Both facts have moved: the shelf is per tune, and the best is
 * `MAX(best_streak)` over the runs. Nothing is lost in the move, because a
 * badge has recorded the chart that won it since the day badges shipped.
 */
describe('the record that shipped before this', () => {
	const old = {
		best: 31,
		bestByChart: { blues: 31, 'ja-da': 7 },
		badges: {
			nice: { tier: 'nice', count: 3, at: '2026-07-01T09:00:00.000Z', pc: 5, chart: 'blues' },
			cooking: { tier: 'cooking', count: 7, at: '2026-07-04T09:00:00.000Z', pc: 9, chart: 'ja-da' }
		}
	};

	it('moves every badge to the shelf of the tune that won it', () => {
		const parsed = parseRecord(old);

		expect(badgesOn(parsed, 'blues').nice).toEqual({
			tier: 'nice',
			count: 3,
			at: '2026-07-01T09:00:00.000Z',
			pc: 5,
			chart: 'blues',
			key: ''
		});
		expect(badgesOn(parsed, 'ja-da').cooking.count).toBe(7);
	});

	it('keeps the dates and the colours intact', () => {
		expect(allBadges(parseRecord(old)).map((badge) => [badge.at, badge.pc])).toEqual([
			['2026-07-01T09:00:00.000Z', 5],
			['2026-07-04T09:00:00.000Z', 9]
		]);
	});

	it('invents no key for a badge won before keys were recorded', () => {
		expect(badgesOn(parseRecord(old), 'blues').nice.key).toBe('');
	});

	it('drops a badge that names no tune, having nowhere to put it', () => {
		const parsed = parseRecord({
			badges: { nice: { tier: 'nice', count: 3, at: '', pc: 0, chart: '' } }
		});
		expect(parsed.badges).toEqual({});
	});
});
