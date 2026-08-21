import { describe, expect, it } from 'vitest';
import { GUIDE_TONE_TARGET } from './goal';
import {
	BANDS,
	bandCrossed,
	bandFor,
	bandsOn,
	bestBand,
	describeGrade,
	describeLadder,
	describeMonth,
	fastestAtLeast,
	grade,
	gradeShelf,
	heldCleanly,
	ladderOn,
	noTempo,
	parseTempoRecord,
	readMovement,
	shareOfTarget,
	suggestLadder,
	type HeldRun,
	type StreakTempo,
	type TempoMovement
} from './tempo';

/** A run, in the shape the log hands over: how far the streak got, and how fast. */
const run = (bestStreak: number, bpm: number): StreakTempo => ({ bestStreak, bpm });

/** A run that cleared the mission's bar: every chord landed, with a real streak going. */
const clean = (bpm: number, bestStreak = 12): HeldRun => ({
	bpm,
	voiced: 20,
	landed: 20,
	bestStreak
});

/** A run at the same tempo that did not: half the chords landed. */
const scrappy = (bpm: number, bestStreak = 12): HeldRun => ({
	bpm,
	voiced: 20,
	landed: 10,
	bestStreak
});

describe('a band is a share of the tune’s own tempo', () => {
	it('reads 76 on a ballad and 76 on a bebop head as two different things', () => {
		// The whole argument for shares over absolutes, in two lines: the same
		// tempo is the tune itself on one chart and homework on the other.
		expect(grade(76, 76)?.band).toBe('attempo');
		expect(grade(76, 160)?.band).toBe('learning');
	});

	it('puts the five boundaries where the ladder says they are', () => {
		expect(bandFor(59).id).toBe('learning');
		expect(bandFor(60).id).toBe('working');
		expect(bandFor(79).id).toBe('working');
		expect(bandFor(80).id).toBe('nearly');
		expect(bandFor(99).id).toBe('nearly');
		expect(bandFor(100).id).toBe('attempo');
		expect(bandFor(119).id).toBe('attempo');
		expect(bandFor(120).id).toBe('past');
	});

	it('takes a tune faster than it goes as past its tempo rather than as the top', () => {
		expect(grade(400, 100)?.band).toBe('past');
	});

	it('grades the share it prints, so the number and the band cannot disagree', () => {
		// 96 of 160 is 60% exactly; 95 is 59.375%, which prints as 59 and must be
		// graded as the band that number belongs to rather than the one above it.
		expect(grade(95, 160)).toMatchObject({ percent: 59, band: 'learning' });
		expect(grade(96, 160)).toMatchObject({ percent: 60, band: 'working' });
	});

	it('keeps both tempos beside the verdict, so a page can say where it came from', () => {
		expect(grade(100, 160)).toEqual({ bpm: 100, target: 160, percent: 63, band: 'working' });
	});

	it('refuses to grade a tune whose tempo nothing records', () => {
		expect(shareOfTarget(100, 0)).toBeNull();
		expect(grade(100, 0)).toBeNull();
		expect(grade(0, 160)).toBeNull();
		expect(grade(100, Number.NaN)).toBeNull();
	});
});

describe('the fastest a tier has been held at', () => {
	const runs = [run(32, 100), run(12, 140), run(50, 80)];

	it('answers with the fastest run that got that far, not the fastest run', () => {
		// 140 reached twelve and nothing more, so it has nothing to say about
		// thirty-two — which is the flattery this whole grade exists to prevent.
		expect(fastestAtLeast(runs, 32)).toBe(100);
		expect(fastestAtLeast(runs, 12)).toBe(140);
	});

	it('grades a lower rung by the faster run that passed through it', () => {
		expect(fastestAtLeast(runs, 3)).toBe(140);
	});

	it('leaves a tier nothing has reached ungraded rather than grading it slowly', () => {
		expect(fastestAtLeast(runs, 64)).toBeNull();
		expect(gradeShelf([run(32, 100)], 160).legend).toBeUndefined();
	});

	it('upgrades the band when a tier is re-earned faster, and only then', () => {
		const slow = gradeShelf([run(20, 80)], 160);
		expect(slow.pocket?.band).toBe('learning');

		const faster = gradeShelf([run(20, 80), run(20, 130)], 160);
		expect(faster.pocket?.band).toBe('nearly');
		expect(faster.pocket?.bpm).toBe(130);
	});

	it('grades nothing at all for a tune nobody has played', () => {
		expect(gradeShelf([], 160)).toEqual({});
		expect(bandsOn(noTempo(), 'rhythm-changes')).toEqual({});
	});

	it('reports the highest band anything on the shelf has been held at', () => {
		expect(bestBand(gradeShelf(runs, 160))?.percent).toBe(88);
		expect(bestBand({})).toBeNull();
	});
});

/*
 * The record this milestone was designed against.
 *
 * Nineteen runs across three tunes, and today the shelf shows them as nearly the
 * same thing: rows of badges, no context. Graded, they are three different
 * pieces of news, and these three cases are the reason the grade is a share
 * rather than a tempo. If this file ever stops agreeing with them, the logic has
 * moved and not the record.
 */
describe('the three tunes the shelf cannot tell apart today', () => {
	it('has rhythm changes working at 63% of the tempo it goes at', () => {
		const shelf = gradeShelf([run(32, 100), run(20, 100), run(12, 92)], 160);
		expect(shelf.untouchable).toEqual({
			bpm: 100,
			target: 160,
			percent: 63,
			band: 'working'
		});
	});

	it('has the jazz blues dead on tempo and stopping at twelve', () => {
		const shelf = gradeShelf([run(12, 140), run(6, 140)], 140);
		expect(shelf.fire).toEqual({ bpm: 140, target: 140, percent: 100, band: 'attempo' });
		expect(shelf.pocket).toBeUndefined();
	});

	it('has three little birds finished and then some', () => {
		const shelf = gradeShelf([run(146, 99), run(50, 99)], 76);
		expect(shelf.legend).toEqual({ bpm: 99, target: 76, percent: 130, band: 'past' });
	});

	it('separates the two tunes that wear the same badges today', () => {
		// Fast and fragile against slow and solid: the blues holds three rungs at
		// the tune's tempo, rhythm changes holds five at 63% of it.
		const blues = gradeShelf([run(12, 140)], 140);
		const rhythm = gradeShelf([run(32, 100)], 160);

		expect(blues.fire?.band).toBe('attempo');
		expect(rhythm.fire?.band).toBe('working');
		expect(Object.keys(blues)).toHaveLength(3);
		expect(Object.keys(rhythm)).toHaveLength(5);
	});
});

describe('what a band says out loud', () => {
	it('states what was held before it says what is left', () => {
		expect(describeGrade(grade(100, 160)!)).toBe(
			'Held at 100 — 63% of the 160 this tune goes at. Real work at this tempo, with road above it.'
		);
	});

	it('offers somewhere to go from every band below the tune’s own tempo', () => {
		for (const band of BANDS.filter((candidate) => candidate.from < 100)) {
			expect(band.says).toMatch(/somewhere to go|road above it|within sight/i);
		}
	});

	it('has something to say about a tune already finished', () => {
		expect(describeGrade(grade(99, 76)!)).toContain('showing off');
	});

	it('never tells anybody off for holding a tier slowly', () => {
		// The bottom band is where a punishing word would land if one ever crept
		// in, and thirty-two in a row at 63% is real work whatever else it is.
		for (const band of BANDS) {
			expect(band.says).not.toMatch(/too slow|only|fail|not fast|should/i);
		}
	});
});

describe('reading grades back off the wire', () => {
	const record = {
		byChart: { 'rhythm-changes': gradeShelf([run(32, 100)], 160) },
		ladders: { 'rhythm-changes': suggestLadder([clean(100)], 160) }
	};

	it('survives anything that is not a record at all', () => {
		expect(parseTempoRecord(null)).toEqual(noTempo());
		expect(parseTempoRecord('rhythm changes')).toEqual(noTempo());
		expect(parseTempoRecord({ byChart: 7 })).toEqual(noTempo());
	});

	it('round-trips a real one through JSON', () => {
		expect(parseTempoRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
	});

	it('re-derives the band rather than believing the one it was sent', () => {
		const lying = {
			byChart: { tune: { fire: { bpm: 100, target: 160, percent: 999, band: 'past' } } }
		};
		expect(parseTempoRecord(lying).byChart.tune.fire).toMatchObject({
			percent: 63,
			band: 'working'
		});
	});

	it('drops a grade whose tempos are not tempos, and keeps the rest', () => {
		const mixed = {
			byChart: {
				tune: {
					fire: { bpm: 'fast', target: 160, band: 'working' },
					pocket: { bpm: 140, target: 140, band: 'attempo' }
				}
			}
		};
		expect(Object.keys(parseTempoRecord(mixed).byChart.tune)).toEqual(['pocket']);
	});

	it('drops a band this ladder has never had', () => {
		const unknown = { byChart: { tune: { fire: { bpm: 100, target: 160, band: 'blazing' } } } };
		expect(parseTempoRecord(unknown)).toEqual(noTempo());
	});

	it('rebuilds a ladder off the wire rather than believing the one it was sent', () => {
		const lying = {
			byChart: {},
			ladders: { tune: { held: 'past', bpm: 40, target: 160, next: 'past', nextBpm: 12 } }
		};
		expect(parseTempoRecord(lying).ladders.tune).toMatchObject({
			held: 'learning',
			next: 'working',
			nextBpm: 96
		});
	});

	it('keeps the tune’s own tempo even when the ladder it was sent says nothing', () => {
		const empty = { byChart: {}, ladders: { tune: { held: null, bpm: null, target: 140 } } };
		expect(parseTempoRecord(empty).ladders.tune).toEqual({
			held: null,
			bpm: null,
			percent: null,
			target: 140,
			next: null,
			nextBpm: null
		});
	});
});

describe('the ladder suggests the next band and gates nothing', () => {
	it('says where the tune has been held and what the band above it costs', () => {
		// Rhythm changes, from the record: held clean at 100 on a tune that goes at
		// 160, which is 63% and `working`. The roadmap puts the next band at 128,
		// and so does this.
		expect(suggestLadder([clean(100)], 160)).toEqual({
			held: 'working',
			bpm: 100,
			percent: 63,
			target: 160,
			next: 'nearly',
			nextBpm: 128
		});
	});

	it('offers a tempo to reach for and never one that has to be reached', () => {
		// "It suggests, it never gates", asserted on the shape: there is no field
		// here that could withhold a tempo, and the sentence says so out loud on
		// the screen where somebody might otherwise assume one had been.
		const ladder = suggestLadder([clean(100)], 160);
		expect(Object.keys(ladder).sort()).toEqual([
			'bpm',
			'held',
			'next',
			'nextBpm',
			'percent',
			'target'
		]);
		expect(describeLadder(ladder)).toContain('any tempo stays playable');
	});

	it('asks for the next band in a tempo that grades as that band', () => {
		// 80% of 99 is 79.2, and asking for 79 would grade as the band below the
		// one the sentence names. Rounded up, so the number keeps its own word.
		const ladder = suggestLadder([clean(60)], 99);
		expect(ladder.next).toBe('nearly');
		expect(grade(ladder.nextBpm!, 99)?.band).toBe('nearly');
	});

	it('reads a run that did not clear the bar as having nothing to say', () => {
		// Not as a failure and not as a slower band: a scrappy run at 140 simply
		// does not move the ladder, and the clean one at 100 still decides it.
		const ladder = suggestLadder([clean(100), scrappy(140)], 160);
		expect(ladder.held).toBe('working');
		expect(ladder.bpm).toBe(100);
	});

	it('borrows the mission’s bar rather than inventing a second one', () => {
		const atTheBar = { bpm: 100, voiced: 100, landed: GUIDE_TONE_TARGET, bestStreak: 12 };
		expect(heldCleanly(atTheBar)).toBe(true);
		expect(heldCleanly({ ...atTheBar, landed: GUIDE_TONE_TARGET - 1 })).toBe(false);
	});

	it('will not let one perfect chord set a tune’s band', () => {
		// A run row keeps the percentage and not how far round the form it got, so
		// the ladder borrows the shelf's own first rung instead of inventing a
		// length: three in a row is where a streak starts being real.
		expect(heldCleanly({ bpm: 200, voiced: 1, landed: 1, bestStreak: 1 })).toBe(false);
		expect(heldCleanly({ bpm: 200, voiced: 1, landed: 1, bestStreak: 3 })).toBe(true);
	});

	it('has nothing above past tempo, and offers nothing for being there', () => {
		const ladder = suggestLadder([clean(99)], 76);
		expect(ladder.held).toBe('past');
		expect(ladder.next).toBeNull();
		expect(ladder.nextBpm).toBeNull();
		expect(describeLadder(ladder)).toContain('nothing to collect');
	});

	it('suggests nothing at all on a tune nothing has been held clean on', () => {
		const ladder = suggestLadder([scrappy(140)], 140);
		expect(ladder.held).toBeNull();
		expect(ladder.next).toBeNull();
		expect(ladder.target).toBe(140);
		expect(describeLadder(ladder)).toContain('Every tempo is playable');
	});

	it('never tells anybody off for where the ladder has got to', () => {
		const lines = [
			describeLadder(suggestLadder([clean(60)], 160)),
			describeLadder(suggestLadder([clean(100)], 160)),
			describeLadder(suggestLadder([clean(99)], 76)),
			describeLadder(suggestLadder([], 160))
		];
		for (const line of lines) {
			expect(line).not.toMatch(/too slow|only|fail|locked|unlock|not fast|should/i);
		}
	});

	it('keeps one tune’s ladder out of another’s, because tempo does not transfer', () => {
		const record = parseTempoRecord({
			byChart: {},
			ladders: {
				'rhythm-changes': suggestLadder([clean(100)], 160),
				bossa: suggestLadder([], 140)
			}
		});
		expect(ladderOn(record, 'rhythm-changes')?.next).toBe('nearly');
		expect(ladderOn(record, 'bossa')?.held).toBeNull();
		expect(ladderOn(record, 'never-played')).toBeNull();
	});
});

describe('crossing a band, which is the only noise tempo gets to make', () => {
	it('says so the first time a tune is held above where the record has it', () => {
		expect(bandCrossed({ bpm: 140, target: 140, heldBefore: 'working' })?.id).toBe('attempo');
	});

	it('stays quiet about a band the record already holds', () => {
		expect(bandCrossed({ bpm: 140, target: 140, heldBefore: 'attempo' })).toBeNull();
		expect(bandCrossed({ bpm: 100, target: 140, heldBefore: 'attempo' })).toBeNull();
	});

	it('stays quiet about arriving where every tune starts', () => {
		// `learning` is the ground floor rather than a crossing: nobody has gone
		// anywhere by playing a tune slowly for the first time.
		expect(bandCrossed({ bpm: 60, target: 160, heldBefore: null })).toBeNull();
	});

	it('says a band once and then lets it be a fact', () => {
		expect(bandCrossed({ bpm: 140, target: 140, heldBefore: null, said: ['attempo'] })).toBeNull();
	});

	it('says nothing about a tune whose own tempo nothing records', () => {
		expect(bandCrossed({ bpm: 140, target: 0, heldBefore: null })).toBeNull();
	});
});

describe('whether the last month moved anything, and what it refuses to claim', () => {
	const moved: TempoMovement = {
		chartSlug: 'rhythm-changes',
		before: grade(100, 160),
		now: grade(130, 160)
	};
	const stood: TempoMovement = {
		chartSlug: 'blues-12',
		before: grade(140, 140),
		now: grade(140, 140)
	};
	const fresh: TempoMovement = { chartSlug: 'birds', before: null, now: grade(99, 76) };

	it('counts a tune with no history before the window as uncomparable, not as still', () => {
		// The distinction the whole figure rests on. A tune whose entire record is
		// inside the window has not stood still — there is nothing to compare it
		// against, and reporting the two as one thing would be an invented fact.
		const reading = readMovement([fresh]);
		expect(reading.tooNew).toBe(1);
		expect(reading.steady).toBe(0);
		expect(reading.raised).toHaveLength(0);
	});

	it('reads a record with nothing comparable as not enough history to say', () => {
		expect(describeMonth(readMovement([fresh]))).toBe('Not enough history yet.');
	});

	it('says nothing whatever when there is nothing graded', () => {
		expect(describeMonth(readMovement([]))).toBe('');
		expect(describeMonth(readMovement([{ chartSlug: 'x', before: null, now: null }]))).toBe('');
	});

	it('reports a month that moved nothing as tunes holding the band they had', () => {
		const says = describeMonth(readMovement([stood]));
		expect(says).toBe('1 tune held their band in 30 days.');
		expect(describeMonth(readMovement([stood, { ...stood, chartSlug: 'other' }]))).toBe(
			'2 tunes held their band in 30 days.'
		);
		expect(says).not.toMatch(/nothing|failed|should|no movement/i);
	});

	it('reports movement upward and never the other way', () => {
		// The band on a tune is the fastest it has ever been held, so it cannot
		// fall. A quieter month than the one before it is not a decline and is
		// never reported as one.
		expect(readMovement([moved]).raised).toHaveLength(1);
		expect(readMovement([stood]).raised).toHaveLength(0);
		expect(describeMonth(readMovement([stood]))).not.toMatch(/down|slower|dropped|fell/i);
	});

	it('leads with what moved when anything did', () => {
		expect(describeMonth(readMovement([moved, stood, fresh]))).toBe('1 tune moved up in 30 days.');
	});
});
