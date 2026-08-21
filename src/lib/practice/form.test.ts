import { describe, expect, it } from 'vitest';
import { barsCovered, barsLeft, noPass, passOver, visitBar, wentRound } from './form';

const BLUES = 12;

/** Bars 1..n of the form, in order. */
const round = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

/** A loop of `bars`, gone round `times`. */
const looping = (bars: number[], times: number) =>
	Array.from({ length: bars.length * times }, (_, i) => bars[i % bars.length]);

describe('going round the form', () => {
	it('starts having been nowhere', () => {
		expect(wentRound(noPass())).toBe(false);
		expect(barsLeft(noPass(), BLUES)).toBe(BLUES);
	});

	it('is round the moment the last unseen bar is seen', () => {
		const nearly = passOver(round(11), BLUES);
		expect(wentRound(nearly)).toBe(false);
		expect(barsLeft(nearly, BLUES)).toBe(1);

		const done = visitBar(nearly, 12, BLUES);
		expect(wentRound(done)).toBe(true);
		// And the count starts again, because there is a fresh lap to cover: this
		// is bars left in the lap under way, not bars left ever.
		expect(barsLeft(done, BLUES)).toBe(BLUES);
	});

	it('does not care which bar the run started on', () => {
		// Play from bar five round to bar four: a whole chorus, just not from the top.
		const wrapped = passOver([...round(8, 5), ...round(4)], BLUES);
		expect(wentRound(wrapped)).toBe(true);
	});

	it('counts a bar once however many times it comes round', () => {
		expect(barsLeft(passOver([1, 1, 1, 1], BLUES), BLUES)).toBe(BLUES - 1);
	});

	/*
	 * The complaint this module exists for: two bars of a thirty-two bar tune,
	 * looped and played cleanly, used to be worth every badge on the shelf.
	 */
	it('never lets a loop shorter than the form get round it', () => {
		for (const times of [1, 6, 100]) {
			expect(wentRound(passOver(looping([1, 2], times), BLUES)), `${times} passes`).toBe(false);
			expect(barsCovered(looping([1, 2], times), BLUES)).toBe(2);
		}
	});

	it('starts the set again once the form is complete, so a second pass counts too', () => {
		expect(barsCovered([...round(12), ...round(12)], BLUES)).toBe(24);
		expect(passOver([...round(12), ...round(12)], BLUES).round).toBe(2);
	});

	it('ignores the count-in and anything else outside the form', () => {
		const pass = passOver([0, 0, -1, 13, 99, 1], BLUES);
		expect(barsLeft(pass, BLUES)).toBe(BLUES - 1);
	});

	it('refuses to divide by a form with no bars in it', () => {
		expect(barsCovered([1, 2, 3], 0)).toBe(0);
		expect(visitBar(noPass(), 1, 0)).toEqual(noPass());
	});
});

describe('how much of the form was covered', () => {
	it('is the bars themselves for a run inside one pass', () => {
		expect(barsCovered(round(7), BLUES)).toBe(7);
	});

	it('carries an unfinished pass across the wrap instead of resetting it', () => {
		// Bar seven rested on the first pass and played on the second. A rule that
		// reset at the wrap would leave this stuck at eleven forever.
		const skipping = [...round(6), ...round(5, 8)];
		expect(barsCovered(skipping, BLUES)).toBe(11);
		expect(barsCovered([...skipping, ...skipping, 7], BLUES)).toBe(12);
	});

	it('never credits more than was honestly got through', () => {
		// Four bars of a twelve-bar form, hammered. Four bars, whatever the effort.
		expect(barsCovered(looping(round(4), 25), BLUES)).toBe(4);
	});
});
