import { describe, expect, it } from 'vitest';
import { midi } from '$lib/music/note';
import {
	begin,
	current,
	emptyPlate,
	hear,
	isComplete,
	isOver,
	itemsFor,
	replay,
	resultOf,
	serve,
	type Round,
	type RoundSpec
} from './round';

const spec = (stop: RoundSpec['stop'], practised = false): RoundSpec => ({
	line: 'recipes',
	stop,
	seed: 11,
	practised,
	version: 1
});

/** Play every item of a round perfectly, except the ones listed, which slip once. */
function ride(round: Round, slips: number[] = []): Round {
	while (!isOver(round)) {
		const entry = current(round)!;
		const slipped = slips.includes(entry.item) && !entry.again;
		round = serve(round, { strays: slipped ? 1 : 0, shown: false });
	}
	return round;
}

describe('hearing a note', () => {
	const item = itemsFor(spec('major'))[0]; // C major, C given

	it('finds a wanted note in any octave', () => {
		const { plate, heard } = hear(item, emptyPlate(), 64 + 12);
		expect(heard).toEqual({ kind: 'found', tone: 1 });
		expect(plate.found).toEqual([1]);
	});

	it('shrugs at a note that is already sounding', () => {
		const once = hear(item, emptyPlate(), 64).plate;
		expect(hear(item, once, 52).heard).toEqual({ kind: 'again' });
		expect(hear(item, once, 48).heard).toEqual({ kind: 'again' });
	});

	it('counts how far a stray landed above the root', () => {
		const { plate, heard } = hear(item, emptyPlate(), 65);
		expect(heard).toEqual({ kind: 'stray', pc: 5, keys: 5 });
		expect(plate.strays).toEqual([5]);
	});

	it('has nothing to count from before the root is found', () => {
		const named = itemsFor(spec('order'))[0];
		const wrong = (midi(named.tones[0].note) + 1) % 12;
		expect(hear(named, emptyPlate(), 60 + wrong).heard).toMatchObject({ keys: null });
	});

	it('is complete when every wanted note is found', () => {
		let plate = emptyPlate();
		plate = hear(item, plate, 67).plate;
		expect(isComplete(item, plate)).toBe(false);
		plate = hear(item, plate, 64).plate;
		expect(isComplete(item, plate)).toBe(true);
	});
});

describe('a round', () => {
	it('scores everything but the items there to be copied', () => {
		const round = ride(begin(spec('major')));
		expect(resultOf(round)).toEqual({ total: 6, clean: 6 });
	});

	it('scores the copying items too once the stop has been played clean', () => {
		const round = begin(spec('major', true));
		expect(round.items.every((item) => item.hint !== 'keys')).toBe(true);
		expect(resultOf(ride(round))).toEqual({ total: 7, clean: 7 });
	});

	it('serves a slip again at the end, once, without counting it twice', () => {
		const round = ride(begin(spec('major')), [2]);
		expect(round.queue).toHaveLength(8);
		expect(round.queue.at(-1)).toEqual({ item: 2, again: true });
		expect(resultOf(round)).toEqual({ total: 6, clean: 5 });
	});

	it('does not send the copying items round again', () => {
		const round = ride(begin(spec('major')), [0]);
		expect(round.queue).toHaveLength(7);
	});

	it('does not break a trip round the circle to send a hop back', () => {
		const round = ride(begin(spec('clockwise')), [5]);
		expect(round.queue).toHaveLength(12);
		expect(resultOf(round)).toEqual({ total: 9, clean: 8 });
	});

	it('counts a demonstration as help', () => {
		let round = begin(spec('minor'));
		round = serve(round, { strays: 0, shown: false });
		round = serve(round, { strays: 0, shown: true });
		round = ride(round);
		expect(resultOf(round).clean).toBe(5);
	});
});

describe('checking a submitted round', () => {
	const id = '6f1d4c2a-8b3e-4f5a-9c7d-1e2f3a4b5c6d';
	const outcomesOf = (round: Round) => round.outcomes;

	it('accepts a round that walks the queue it would have had', () => {
		const round = ride(begin(spec('flip')), [3]);
		const checked = replay({ id, spec: round.spec, outcomes: outcomesOf(round) });
		expect(checked?.result).toEqual(resultOf(round));
		expect(checked?.submission.outcomes).toHaveLength(round.queue.length);
	});

	it('refuses a round that skipped the item sent back', () => {
		const round = ride(begin(spec('flip')), [3]);
		const outcomes = outcomesOf(round).slice(0, -1);
		expect(replay({ id, spec: round.spec, outcomes })).toBeNull();
	});

	it('refuses an unfinished round', () => {
		const round = begin(spec('major'));
		expect(replay({ id, spec: round.spec, outcomes: [] })).toBeNull();
	});

	it('refuses a round claiming items in the wrong order', () => {
		const round = ride(begin(spec('major')));
		const outcomes = [...outcomesOf(round)].reverse();
		expect(replay({ id, spec: round.spec, outcomes })).toBeNull();
	});

	it('refuses a stop that does not exist, or a bad id', () => {
		const round = ride(begin(spec('major')));
		const outcomes = outcomesOf(round);
		expect(replay({ id, spec: { ...round.spec, stop: 'nowhere' }, outcomes })).toBeNull();
		expect(replay({ id: 'nope', spec: round.spec, outcomes })).toBeNull();
		expect(replay({ id, spec: { ...round.spec, version: 2 }, outcomes })).toBeNull();
	});

	it('works the result out itself rather than reading it from the body', () => {
		const round = ride(begin(spec('major')), [2]);
		const checked = replay({
			id,
			spec: round.spec,
			outcomes: outcomesOf(round),
			result: { total: 6, clean: 6 }
		});
		expect(checked?.result).toEqual({ total: 6, clean: 5 });
	});
});
