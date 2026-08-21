import { describe, expect, it } from 'vitest';
import {
	BANDS,
	bandFor,
	bandsOn,
	bestBand,
	describeGrade,
	fastestAtLeast,
	grade,
	gradeShelf,
	noTempo,
	parseTempoRecord,
	shareOfTarget,
	type StreakTempo
} from './tempo';

/** A run, in the shape the log hands over: how far the streak got, and how fast. */
const run = (bestStreak: number, bpm: number): StreakTempo => ({ bestStreak, bpm });

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
	const record = { byChart: { 'rhythm-changes': gradeShelf([run(32, 100)], 160) } };

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
});
