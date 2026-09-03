import { describe, expect, it } from 'vitest';
import type { CardDirection, ReviewRating } from '$lib/server/db/schema';
import {
	DIRECTION_WEIGHT,
	gradeFromPerformance,
	initialState,
	isDue,
	isRetiredIntroduction,
	preview,
	retrievability,
	schedule,
	selectDue,
	type Schedulable,
	type SrsState
} from './scheduler';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-01-01T09:00:00Z');
const at = (days: number) => new Date(START.getTime() + days * DAY);
const intervalDays = (state: SrsState, from: Date) =>
	(state.dueAt.getTime() - from.getTime()) / DAY;

/** Drive a card through a run of grades, reviewing each time it comes due. */
function run(grades: ReviewRating[]): { state: SrsState; intervals: number[] } {
	let state = initialState(START);
	let now = START;
	const intervals: number[] = [];

	for (const grade of grades) {
		state = schedule(state, grade, now);
		intervals.push(intervalDays(state, now));
		now = state.dueAt;
	}
	return { state, intervals };
}

describe('a new card', () => {
	it('starts due immediately and unseen', () => {
		const state = initialState(START);
		expect(state.state).toBe('new');
		expect(state.reps).toBe(0);
		expect(state.lapses).toBe(0);
		expect(isDue(state, START)).toBe(true);
		expect(state.lastReviewedAt).toBeNull();
	});

	it('has no retrievability before it has been seen', () => {
		expect(retrievability(initialState(START), START)).toBe(0);
	});
});

describe('grading moves a card through the states', () => {
	it('leaves the new state on first review', () => {
		const state = schedule(initialState(START), 'good', START);
		expect(state.state).not.toBe('new');
		expect(state.reps).toBe(1);
		expect(state.lastReviewedAt).toEqual(START);
	});

	it('reaches review after a few good grades', () => {
		expect(run(['good', 'good', 'good']).state.state).toBe('review');
	});

	it('records a lapse and collapses the interval when a mature card is forgotten', () => {
		const mature = run(['good', 'good', 'good', 'good']).state;
		expect(mature.state).toBe('review');

		const lapsed = schedule(mature, 'again', mature.dueAt);
		expect(lapsed.lapses).toBe(1);
		expect(lapsed.stability).toBeLessThan(mature.stability);
		// With short-term scheduling off there are no relearning steps to drop
		// into, so the card stays in review with a much shorter interval. The
		// `relearning` state therefore never occurs in this app.
		expect(lapsed.state).toBe('review');
	});

	it('counts every review', () => {
		expect(run(['good', 'hard', 'good', 'again', 'good']).state.reps).toBe(5);
	});
});

describe('intervals behave the way spacing should', () => {
	it('stretches as a card keeps being remembered', () => {
		const { intervals } = run(['good', 'good', 'good', 'good', 'good']);
		for (let i = 1; i < intervals.length; i++) {
			expect(intervals[i], `review ${i + 1}`).toBeGreaterThan(intervals[i - 1]);
		}
	});

	it('reaches genuinely long intervals rather than plateauing', () => {
		const { intervals } = run(Array<ReviewRating>(8).fill('good'));
		expect(intervals[intervals.length - 1]).toBeGreaterThan(30);
	});

	it('orders the four grades: again < hard < good < easy', () => {
		const mature = run(['good', 'good', 'good']).state;
		const options = preview(mature, mature.dueAt);
		const days = (r: ReviewRating) => intervalDays(options[r], mature.dueAt);

		expect(days('again')).toBeLessThan(days('hard'));
		expect(days('hard')).toBeLessThan(days('good'));
		expect(days('good')).toBeLessThan(days('easy'));
	});

	it('collapses the interval on a lapse', () => {
		const mature = run(['good', 'good', 'good', 'good']).state;
		const before = intervalDays(mature, START);
		const lapsed = schedule(mature, 'again', mature.dueAt);
		expect(intervalDays(lapsed, mature.dueAt)).toBeLessThan(before);
	});

	it('makes a struggling card come round more often than an easy one', () => {
		const struggling = run(['again', 'hard', 'good', 'hard', 'good']).state;
		const comfortable = run(['easy', 'easy', 'good', 'easy', 'good']).state;
		expect(struggling.difficulty).toBeGreaterThan(comfortable.difficulty);
		expect(struggling.stability).toBeLessThan(comfortable.stability);
	});

	it('is deterministic, because fuzz is off', () => {
		expect(run(['good', 'good', 'good']).intervals).toEqual(
			run(['good', 'good', 'good']).intervals
		);
	});
});

describe('retrievability', () => {
	it('decays as time passes since the review', () => {
		const state = run(['good', 'good', 'good']).state;
		const soon = retrievability(state, new Date(state.lastReviewedAt!.getTime() + DAY));
		const later = retrievability(state, new Date(state.lastReviewedAt!.getTime() + 60 * DAY));
		expect(soon).toBeGreaterThan(later);
		expect(soon).toBeLessThanOrEqual(1);
		expect(later).toBeGreaterThanOrEqual(0);
	});
});

// ---------------------------------------------------------------------------

const card = (
	id: string,
	direction: CardDirection,
	keyCenter: string,
	overrides: Partial<SrsState> = {}
): Schedulable => ({
	cardId: id,
	direction,
	keyCenter,
	state: { ...initialState(START), state: 'review', reps: 3, ...overrides }
});

describe('choosing what to ask next', () => {
	it('only offers cards that are due', () => {
		const cards = [
			card('due', 'play_name', 'C', { dueAt: at(-1) }),
			card('later', 'play_name', 'C', { dueAt: at(5) })
		];
		expect(selectDue(cards, { now: at(0) }).map((c) => c.cardId)).toEqual(['due']);
	});

	it('puts the most overdue first, all else equal', () => {
		const cards = [
			card('a', 'see_play', 'C', { dueAt: at(-1) }),
			card('b', 'see_play', 'C', { dueAt: at(-10) }),
			card('c', 'see_play', 'C', { dueAt: at(-4) })
		];
		expect(selectDue(cards, { now: at(0) }).map((c) => c.cardId)).toEqual(['b', 'c', 'a']);
	});

	it('weights play-to-name above the others, being the weakest link', () => {
		// `degree_play` is the direction that asks it: play the chord the numeral
		// asks for, then name what you played. The weight used to sit on
		// `play_name`, which posed the same question with the key left off and was
		// asked by nothing at all.
		expect(DIRECTION_WEIGHT.degree_play).toBeGreaterThan(DIRECTION_WEIGHT.hear_name);
		expect(DIRECTION_WEIGHT.degree_play).toBeGreaterThan(DIRECTION_WEIGHT.see_play);
		expect(DIRECTION_WEIGHT.degree_play).toBeGreaterThan(DIRECTION_WEIGHT.hear_play);

		const cards = [
			card('see', 'see_play', 'C', { dueAt: at(-2) }),
			card('name', 'degree_play', 'C', { dueAt: at(-2) })
		];
		expect(selectDue(cards, { now: at(0) })[0].cardId).toBe('name');
	});

	it('makes pivot_play the heaviest, matching what its own comment claims', () => {
		expect(DIRECTION_WEIGHT.pivot_play).toBeGreaterThan(DIRECTION_WEIGHT.degree_play);
		expect(DIRECTION_WEIGHT.pivot_play).toBeGreaterThan(DIRECTION_WEIGHT.hear_name);
		expect(DIRECTION_WEIGHT.pivot_play).toBeGreaterThan(DIRECTION_WEIGHT.see_play);
		expect(DIRECTION_WEIGHT.pivot_play).toBeGreaterThan(DIRECTION_WEIGHT.hear_play);
	});

	it('pulls neglected keys forward', () => {
		const cards = [
			card('warm', 'see_play', 'C', { dueAt: at(-2) }),
			card('cold', 'see_play', 'Gb', { dueAt: at(-2) })
		];
		expect(selectDue(cards, { now: at(0), coldKeys: ['Gb'] })[0].cardId).toBe('cold');
	});

	it('lets a badly overdue comfortable card still beat a barely due cold one', () => {
		const cards = [
			card('veryOverdue', 'see_play', 'C', { dueAt: at(-30) }),
			card('cold', 'see_play', 'Gb', { dueAt: at(0) })
		];
		expect(selectDue(cards, { now: at(0), coldKeys: ['Gb'] })[0].cardId).toBe('veryOverdue');
	});

	it('treats new cards as mildly urgent, not infinitely so', () => {
		const cards = [
			card('new', 'see_play', 'C', { state: 'new', reps: 0, dueAt: at(-1) }),
			card('overdue', 'see_play', 'C', { dueAt: at(-6) })
		];
		expect(selectDue(cards, { now: at(0) })[0].cardId).toBe('overdue');
	});
});

describe('retiring the introduction', () => {
	const shown = (id: string, state: SrsState['state']) =>
		card(id, 'see_play', 'C', { state, reps: state === 'new' ? 0 : 3, dueAt: at(-1) });

	it('keeps showing the symbol while the card is still being met', () => {
		const cards = [shown('brand-new', 'new'), shown('learning', 'learning')];
		const chosen = selectDue(cards, { now: at(0), retireIntroductions: true });
		expect(new Set(chosen.map((c) => c.cardId))).toEqual(new Set(['brand-new', 'learning']));
	});

	it('stops asking once the card has graduated, because the chart asks it all day', () => {
		const cards = [shown('known', 'review'), card('heard', 'hear_name', 'C', { dueAt: at(-1) })];
		const chosen = selectDue(cards, { now: at(0), retireIntroductions: true });
		expect(chosen.map((c) => c.cardId)).toEqual(['heard']);
	});

	it('hands the introduction back to a card that graduated and then failed', () => {
		// `relearning` means you were shown a symbol you could not play. Retiring
		// that one would be the app noticing the gap and declining to mention it.
		const cards = [shown('lapsed', 'relearning')];
		expect(selectDue(cards, { now: at(0), retireIntroductions: true })).toHaveLength(1);
		expect(isRetiredIntroduction(cards[0])).toBe(false);
	});

	it('retires nothing at all unless it is asked to', () => {
		// Retiring a question is a claim about where else it gets asked, and this
		// module is not the one in a position to make it.
		const cards = [shown('known', 'review')];
		expect(selectDue(cards, { now: at(0) })).toHaveLength(1);
	});

	it('retires only the direction the chart can ask instead', () => {
		const graduated = ['hear_name', 'hear_play', 'degree_play'] as const;
		for (const direction of graduated) {
			const one = card(direction, direction, 'C', { dueAt: at(-1) });
			expect(isRetiredIntroduction(one), direction).toBe(false);
		}
	});
});

describe('grading from what was played', () => {
	it('fails an incorrect answer whatever the speed', () => {
		expect(gradeFromPerformance(false, 200)).toBe('again');
		expect(gradeFromPerformance(false, 9000)).toBe('again');
	});

	it('rewards speed, because latency is the fluency signal', () => {
		expect(gradeFromPerformance(true, 800)).toBe('easy');
		expect(gradeFromPerformance(true, 2500)).toBe('good');
		expect(gradeFromPerformance(true, 8000)).toBe('hard');
	});

	it('falls back to good when nothing was timed', () => {
		expect(gradeFromPerformance(true, null)).toBe('good');
	});
});

describe('simulated review histories', () => {
	/** A learner who always remembers converges on long intervals and few reviews. */
	it('asks a well-known card only a handful of times in a year', () => {
		let state = initialState(START);
		let now = START;
		let reviews = 0;
		const end = START.getTime() + 365 * DAY;

		while (now.getTime() < end && reviews < 200) {
			state = schedule(state, 'good', now);
			now = state.dueAt;
			reviews++;
		}

		expect(reviews).toBeLessThan(15);
		expect(state.stability).toBeGreaterThan(60);
	});

	/** A card that keeps being forgotten should keep coming back. */
	it('asks a card that is never learned far more often', () => {
		let state = initialState(START);
		let now = START;
		let reviews = 0;
		const end = START.getTime() + 90 * DAY;

		while (now.getTime() < end && reviews < 2000) {
			state = schedule(state, reviews % 3 === 0 ? 'again' : 'hard', now);
			now = state.dueAt;
			reviews++;
		}

		expect(reviews).toBeGreaterThan(20);
		expect(state.lapses).toBeGreaterThan(5);
	});

	it('never schedules a card into the past', () => {
		let state = initialState(START);
		let now = START;
		const grades: ReviewRating[] = ['good', 'again', 'hard', 'easy', 'good', 'again'];
		for (let i = 0; i < 60; i++) {
			const grade = grades[i % grades.length];
			state = schedule(state, grade, now);
			expect(state.dueAt.getTime(), `review ${i}`).toBeGreaterThan(now.getTime());
			now = state.dueAt;
		}
	});

	it('keeps stability and difficulty in sane ranges throughout', () => {
		let state = initialState(START);
		let now = START;
		const grades: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
		for (let i = 0; i < 200; i++) {
			state = schedule(state, grades[i % grades.length], now);
			now = state.dueAt;
			expect(state.stability).toBeGreaterThan(0);
			expect(Number.isFinite(state.stability)).toBe(true);
			expect(state.difficulty).toBeGreaterThanOrEqual(1);
			expect(state.difficulty).toBeLessThanOrEqual(10);
		}
	});

	it('schedules the four directions of one item independently', () => {
		// The whole reason directions are separate cards: you can hear a chord you
		// cannot name, and the scheduler has to be able to say so.
		const directions: CardDirection[] = ['hear_name', 'hear_play', 'see_play', 'degree_play'];
		const outcomes: Record<string, ReviewRating> = {
			hear_name: 'easy',
			hear_play: 'good',
			see_play: 'good',
			degree_play: 'again'
		};

		const states = directions.map((direction) => {
			let state = initialState(START);
			let now = START;
			for (let i = 0; i < 4; i++) {
				state = schedule(state, outcomes[direction], now);
				now = state.dueAt;
			}
			return { direction, state };
		});

		const byDirection = Object.fromEntries(states.map((s) => [s.direction, s.state]));
		expect(byDirection.degree_play.dueAt.getTime()).toBeLessThan(
			byDirection.hear_name.dueAt.getTime()
		);
		expect(byDirection.degree_play.lapses).toBeGreaterThan(byDirection.hear_name.lapses);
	});
});
