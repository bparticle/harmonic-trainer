import { describe, expect, it } from 'vitest';
import {
	GAME_IDS,
	answerForMidi,
	circleRoute,
	isCorrect,
	makeDeck,
	pcOf,
	signatureNotes,
	type RoundSpec
} from './catalog';

const spec: RoundSpec = {
	game: 'circle',
	mode: 'recall',
	level: 'starter',
	direction: 'clockwise',
	seed: 42
};

describe('circle journeys', () => {
	it('starts and ends at C, visiting every pitch exactly once in between', () => {
		for (const direction of ['clockwise', 'counterclockwise'] as const) {
			const route = circleRoute(direction);
			expect(route).toHaveLength(13);
			expect(route[0]).toBe('C');
			expect(route.at(-1)).toBe('C');
			expect(new Set(route.slice(0, 12).map(pcOf)).size).toBe(12);
			for (let i = 1; i < route.length; i++)
				expect((pcOf(route[i]) - pcOf(route[i - 1]) + 12) % 12).toBe(
					direction === 'clockwise' ? 7 : 5
				);
		}
	});
	it('accepts any octave and the same physical key for enharmonic names', () => {
		const question = makeDeck({ ...spec, direction: 'counterclockwise' })[6];
		expect(question.choices.find((choice) => choice.value === '6')?.label).toBe('G♭');
		for (const note of [42, 54, 66, 78])
			expect(isCorrect(question, [answerForMidi(question, note)!])).toBe(true);
	});
});

describe('spelled theory', () => {
	it('teaches A major as three sharps, including G sharp', () => {
		expect(signatureNotes('A')).toEqual(['F♯', 'C♯', 'G♯']);
	});
	it('preserves enharmonic signatures at the edges', () => {
		expect(signatureNotes('F♯')).toEqual(['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯']);
		expect(signatureNotes('C♭')).toEqual(['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭']);
		expect(signatureNotes('C')).toEqual([]);
	});
	it('requires the complete set of ingredients, rejecting extras and duplicate selections', () => {
		const question = makeDeck({ ...spec, game: 'chords' })[0];
		expect(isCorrect(question, [...question.answer].reverse())).toBe(true);
		expect(isCorrect(question, question.answer.slice(1))).toBe(false);
		expect(isCorrect(question, [...question.answer, question.answer[0]])).toBe(false);
		expect(isCorrect(question, [...question.answer, '4'])).toBe(false);
	});
	it('uses explicit piano controller keys for numerals, and ignores piano notes for tile puzzles', () => {
		const question = makeDeck({ ...spec, game: 'numerals' })[0];
		expect(answerForMidi(question, 60)).toBe('I');
		expect(answerForMidi(question, 74)).toBe('ii');
		expect(answerForMidi(question, 61)).toBeNull();
		expect(answerForMidi(question, -1)).toBeNull();
		expect(answerForMidi(makeDeck({ ...spec, game: 'chords' })[0], 60)).toBeNull();
	});
	it('gives C a real empty signature rather than requiring a made-up accidental', () => {
		const question = Array.from({ length: 20 }, (_, seed) =>
			makeDeck({ ...spec, game: 'signatures', seed })
		)
			.flat()
			.find((q) => q.id === 'signature:C:notes')!;
		expect(question).toBeDefined();
		expect(isCorrect(question, [])).toBe(true);
		expect(isCorrect(question, ['F♯'])).toBe(false);
	});
	it('covers all seven diatonic numeral qualities in each round', () => {
		const deck = makeDeck({ ...spec, game: 'numerals' });
		expect(new Set(deck.map((q) => q.answer[0]))).toEqual(
			new Set(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'])
		);
		expect(deck.find((q) => q.answer[0] === 'vii°')?.headline).toContain('diminished');
	});
});

describe.each(GAME_IDS)('%s decks', (game) => {
	it('are deterministic and contain answerable questions across both levels', () => {
		for (const level of ['starter', 'explorer'] as const) {
			for (const seed of [0, 1, 42, 99, 4294967295]) {
				const deck = makeDeck({ ...spec, game, level, seed });
				expect(deck).toEqual(makeDeck({ ...spec, game, level, seed }));
				expect(new Set(deck.map((q) => q.id)).size).toBe(deck.length);
				for (const question of deck) {
					expect(new Set(question.choices.map((c) => c.value)).size).toBe(question.choices.length);
					expect(question.answer.every((a) => question.choices.some((c) => c.value === a))).toBe(
						true
					);
					expect(isCorrect(question, question.answer)).toBe(true);
					if (question.kind === 'pitch')
						expect(answerForMidi(question, 60 + Number(question.answer[0]))).toBe(
							question.answer[0]
						);
				}
			}
		}
	});
});
