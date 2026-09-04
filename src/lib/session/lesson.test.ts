import { describe, expect, it } from 'vitest';
import { guidanceFor, guidanceKey, isChordShape } from './lesson';

describe('practice guidance', () => {
	it('turns three repetitions into copy, support and recall', () => {
		const cards = ['scale', 'scale', 'scale'];
		expect(guidanceFor(cards, 0)).toMatchObject({ mode: 'guided', round: 1, rounds: 3 });
		expect(guidanceFor(cards, 1)).toMatchObject({ mode: 'supported', round: 2, rounds: 3 });
		expect(guidanceFor(cards, 2)).toMatchObject({ mode: 'recall', round: 3, rounds: 3 });
	});

	it('keeps a one-off card guided instead of testing it cold', () => {
		expect(guidanceFor(['scale'], 0)).toEqual({
			mode: 'guided',
			round: 1,
			rounds: 1,
			showTarget: true,
			showTargetLabels: true
		});
	});

	it('counts only repetitions of the current card', () => {
		const cards = ['a', 'b', 'a', 'b', 'a'];
		expect(guidanceFor(cards, 2)).toMatchObject({ mode: 'supported', round: 2, rounds: 3 });
		expect(guidanceFor(cards, 3)).toMatchObject({ mode: 'recall', round: 2, rounds: 2 });
	});

	it('treats a chord heard and a chord requested by degree as one learned shape', () => {
		const heard = {
			id: 'hear-c',
			keyCenter: 'C',
			direction: 'hear_play',
			payload: { kind: 'triad', label: 'C' }
		};
		const degree = { ...heard, id: 'degree-c', direction: 'degree_play' };

		expect(guidanceKey(heard)).toBe(guidanceKey(degree));
		expect(isChordShape(heard)).toBe(true);
	});

	it('shares the fade with a degree card without letting it be demonstrated', () => {
		// Two judgements, and they were one. How much repetition a shape has had is
		// a fair thing for `degree_play` to inherit; being *shown* is not, because
		// that question ends by asking what you just played. It was posed with `Am`
		// in display type over `i — Am`, above a keyboard with A, C and E lit and
		// lettered, after the app had played the chord.
		const heard = {
			id: 'hear-am',
			keyCenter: 'C',
			direction: 'hear_play',
			payload: { kind: 'triad', label: 'Am' }
		};
		const degree = { ...heard, id: 'degree-am', direction: 'degree_play' };

		expect(guidanceKey(degree)).toBe(guidanceKey(heard));
		expect(isChordShape(degree)).toBe(false);
	});

	it('does not spoil a pure naming question by grouping it with a shown chord', () => {
		const played = {
			id: 'play-g7',
			keyCenter: 'C',
			direction: 'hear_play',
			payload: { kind: 'seventh', label: 'G7' }
		};
		const named = { ...played, id: 'name-g7', direction: 'hear_name' };

		expect(guidanceKey(played)).not.toBe(guidanceKey(named));
		expect(isChordShape(named)).toBe(false);
	});

	it('keeps the same symbol in another key as a separate lesson object', () => {
		const c = {
			id: 'c',
			keyCenter: 'C',
			direction: 'degree_play',
			payload: { kind: 'triad', label: 'C' }
		};
		const f = { ...c, id: 'f', keyCenter: 'F' };

		expect(guidanceKey(c)).not.toBe(guidanceKey(f));
	});
});
