import { describe, expect, it } from 'vitest';
import {
	allBadges,
	award,
	badgesOn,
	earnedCount,
	emptyRecord,
	holdBack,
	nothingHeld,
	parseRecord,
	release,
	type StreakRecord,
	type Waiting
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

/*
 * The waiting shelf.
 *
 * Two bars of a thirty-two bar tune, looped and played cleanly at full tempo,
 * used to fill the shelf — a medal for a fragment. A badge waits for the form to
 * have been round now, and these are the two halves of that: holding one back,
 * and paying it out when the tune finally comes round.
 */
describe('a badge held back until the form has been round', () => {
	/** Walk a streak up to `count`, holding rather than awarding. */
	function hold(to: number, record = emptyRecord(), context = won): Waiting {
		let waiting = nothingHeld();
		for (let n = 1; n <= to; n++) {
			waiting = holdBack(record, waiting, at(n - 1), at(n), context).waiting;
		}
		return waiting;
	}

	it('holds exactly what awarding would have given', () => {
		const held = hold(BADGE_TIERS[1].from);
		const awarded = badgesOn(climb(BADGE_TIERS[1].from), 'blues');
		expect(Object.keys(held).sort()).toEqual(Object.keys(awarded).sort());
	});

	it('leaves the record alone while it waits', () => {
		const record = emptyRecord();
		hold(BADGE_TIERS[1].from, record);
		expect(earnedCount(record, 'blues')).toBe(0);
	});

	it('never holds a tier the tune already owns', () => {
		const already = climb(BADGE_TIERS[0].from);
		expect(hold(BADGE_TIERS[0].from, already)).toEqual({});
	});

	it('keeps the first crossing rather than the last', () => {
		let waiting = holdBack(emptyRecord(), nothingHeld(), at(2), at(3), won).waiting;
		const later = { ...won, at: '2026-08-16T11:00:00.000Z', pc: 9 };
		waiting = holdBack(emptyRecord(), waiting, at(2), at(3), later).waiting;
		expect(waiting.nice.won.at).toBe(won.at);
		expect(waiting.nice.won.pc).toBe(5);
	});

	it('pays everything out at once when the form comes round', () => {
		const waiting = hold(BADGE_TIERS[1].from);
		const paid = release(emptyRecord(), waiting);
		expect(paid.earned.length).toBe(Object.keys(waiting).length);
		expect(earnedCount(paid.record, 'blues')).toBe(paid.earned.length);
	});

	it('pays a badge out dated when it was earned, not when it landed', () => {
		const paid = release(emptyRecord(), hold(3));
		expect(badgesOn(paid.record, 'blues').nice.at).toBe(won.at);
		expect(badgesOn(paid.record, 'blues').nice.pc).toBe(5);
	});

	it('lands on exactly the record awarding it outright would have left', () => {
		const outright = climb(BADGE_TIERS[1].from);
		const waited = release(emptyRecord(), hold(BADGE_TIERS[1].from)).record;
		expect(waited).toEqual(outright);
	});

	it('changes nothing when nothing is waiting', () => {
		const record = climb(3);
		const paid = release(record, nothingHeld());
		expect(paid.record).toBe(record);
		expect(paid.earned).toEqual([]);
	});

	it('does not overwrite a badge the tune won in the meantime', () => {
		const waiting = hold(3);
		// The same tier, earned outright on a different chord before the pay-out.
		const already = award(emptyRecord(), at(2), at(3), { ...won, pc: 11 }).record;
		const paid = release(already, waiting);
		expect(badgesOn(paid.record, 'blues').nice.pc).toBe(11);
	});
});
