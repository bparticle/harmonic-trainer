import { describe, expect, it } from 'vitest';
import { award, bestOn, earnedCount, emptyRecord, parseRecord, type StreakRecord } from './badges';
import { BADGE_TIERS, type Streak } from './streak';

const at = (count: number): Streak => ({ count, best: count });
const won = { pc: 5, chart: 'blues', at: '2026-08-16T10:00:00.000Z' };

/** Walk a record up to `count` one chord at a time, the way the page does. */
function climb(to: number, context = won, from = emptyRecord()): StreakRecord {
	let record = from;
	for (let n = 1; n <= to; n++) record = award(record, at(n - 1), at(n), context).record;
	return record;
}

describe('earning a badge', () => {
	it('gives nothing away before the first tier', () => {
		expect(earnedCount(climb(2))).toBe(0);
	});

	it('awards a tier the moment its streak is reached', () => {
		const { earned } = award(emptyRecord(), at(2), at(3), won);
		expect(earned.map((tier) => tier.id)).toEqual(['nice']);
	});

	it('records the streak, the chord it was won on, and when', () => {
		const badge = climb(3).badges.nice;
		expect(badge).toEqual({ tier: 'nice', count: 3, at: won.at, pc: 5, chart: 'blues' });
	});

	it('collects them all on a long enough run', () => {
		expect(earnedCount(climb(50))).toBe(BADGE_TIERS.length);
	});

	/*
	 * `best` already answers "how far have you got". A badge answers "when did
	 * you first get there", and overwriting it on every pass would turn six
	 * dated milestones into six copies of the same afternoon.
	 */
	it('keeps a badge from the first time it was earned', () => {
		const first = climb(6);
		const later = climb(
			6,
			{ pc: 9, chart: 'rhythm-changes', at: '2027-01-01T00:00:00.000Z' },
			first
		);

		expect(later.badges.nice.at).toBe(won.at);
		expect(later.badges.nice.pc).toBe(5);
		expect(later.badges.nice.chart).toBe('blues');
	});

	it('does not award the same tier twice', () => {
		const { earned } = award(climb(6), at(2), at(3), won);
		expect(earned).toEqual([]);
	});
});

describe('the numbers a record keeps', () => {
	it('raises the best ever', () => {
		expect(climb(14).best).toBe(14);
	});

	it('keeps a best per chart, since one tune is not another', () => {
		const blues = climb(14);
		const both = climb(6, { ...won, chart: 'rhythm-changes' }, blues);

		expect(bestOn(both, 'blues')).toBe(14);
		expect(bestOn(both, 'rhythm-changes')).toBe(6);
		expect(both.best).toBe(14);
	});

	it('reports nothing for a chart never played', () => {
		expect(bestOn(climb(5), 'stella')).toBe(0);
	});

	it('never lowers a best on a shorter run', () => {
		const long = climb(20);
		const short = climb(4, won, long);
		expect(short.best).toBe(20);
		expect(bestOn(short, 'blues')).toBe(20);
	});

	it('costs nothing and changes nothing when a streak breaks', () => {
		const before = climb(12);
		const after = award(before, at(12), { count: 0, best: 12 }, won);
		expect(after.record).toBe(before);
		expect(after.earned).toEqual([]);
	});
});

describe('reading a record back', () => {
	it('survives anything that is not a record at all', () => {
		for (const junk of [null, undefined, 3, 'nope', [], true]) {
			expect(parseRecord(junk)).toEqual(emptyRecord());
		}
	});

	it('round-trips a real one through JSON', () => {
		const record = climb(20);
		expect(parseRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
	});

	it('drops a badge under a tier id that no longer exists', () => {
		// This is what makes the ladder safe to rename or reorder.
		const parsed = parseRecord({
			best: 9,
			badges: { ancient: { tier: 'ancient', count: 9, at: '', pc: 3, chart: 'x' } }
		});
		expect(parsed.badges).toEqual({});
		expect(parsed.best).toBe(9);
	});

	it('keeps the good entries when one of them is rubbish', () => {
		const parsed = parseRecord({
			best: 6,
			badges: {
				nice: { tier: 'nice', count: 3, at: 'then', pc: 2, chart: 'blues' },
				cooking: 'not a badge'
			}
		});
		expect(Object.keys(parsed.badges)).toEqual(['nice']);
	});

	it('normalises a pitch class that arrived out of range', () => {
		const parsed = parseRecord({
			badges: { nice: { tier: 'nice', count: 3, at: '', pc: -7, chart: '' } }
		});
		expect(parsed.badges.nice.pc).toBe(5);
	});

	it('rejects counts that are not counts', () => {
		const parsed = parseRecord({
			best: -12,
			bestByChart: { blues: 'lots', rhythm: 8.7 },
			badges: { nice: { tier: 'nice', count: 0, at: '', pc: 0, chart: '' } }
		});
		expect(parsed.badges).toEqual({});
		expect(parsed.bestByChart).toEqual({ rhythm: 8 });
	});

	/*
	 * A `best` lower than a badge that was actually earned is not a fact worth
	 * preserving. The badges are the harder evidence, so they win.
	 */
	it('trusts the badges over a best that disagrees with them', () => {
		const parsed = parseRecord({
			best: 1,
			bestByChart: { blues: 30 },
			badges: { fire: { tier: 'fire', count: 14, at: '', pc: 0, chart: 'blues' } }
		});
		expect(parsed.best).toBe(30);
	});
});
