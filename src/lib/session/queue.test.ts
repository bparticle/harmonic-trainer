import { describe, expect, it } from 'vitest';
import { openQueue, putBack, stillToPutRight } from './queue';

describe('the run a drill walks', () => {
	it('opens as the cards, in order, none of them a second look', () => {
		expect(openQueue(3)).toEqual([
			{ at: 0, retry: false },
			{ at: 1, retry: false },
			{ at: 2, retry: false }
		]);
	});

	it('has nothing in it for a task with no cards', () => {
		expect(openQueue(0)).toEqual([]);
		expect(openQueue(-1)).toEqual([]);
	});
});

describe('putting a missed card back', () => {
	it('puts it on the end, marked as the second look', () => {
		const queue = putBack(openQueue(3), 0);
		expect(queue).toHaveLength(4);
		expect(queue[3]).toEqual({ at: 0, retry: true });
	});

	it('leaves the walk ahead of it alone, so nothing jumps the queue', () => {
		const queue = putBack(openQueue(3), 1);
		expect(queue.slice(0, 3)).toEqual(openQueue(3));
	});

	/*
	 * The caller asks on every wrong name and again on being shown the answer,
	 * which for one card is both — so this has to be the thing that refuses,
	 * rather than three flags in a component.
	 */
	it('only ever puts the same card back once', () => {
		let queue = putBack(openQueue(3), 0);
		queue = putBack(queue, 0);
		queue = putBack(queue, 0);
		expect(queue).toHaveLength(4);
	});

	/*
	 * A second look that goes wrong is a card for tomorrow's queue. Putting it
	 * back again is a run with no end, and the scheduler has already heard about
	 * it twice.
	 */
	it('refuses to put a second look back for a third', () => {
		const queue = putBack(openQueue(2), 0);
		expect(putBack(queue, 2)).toBe(queue);
	});

	it('refuses to put back a place that is not in the run', () => {
		const queue = openQueue(2);
		expect(putBack(queue, 5)).toBe(queue);
	});
});

describe('how many are still to be put right', () => {
	it('counts only the second looks still ahead', () => {
		const queue = putBack(putBack(openQueue(3), 0), 1);
		expect(stillToPutRight(queue, 0)).toBe(2);
		expect(stillToPutRight(queue, 3)).toBe(2);
		expect(stillToPutRight(queue, 4)).toBe(1);
		expect(stillToPutRight(queue, 5)).toBe(0);
	});
});
