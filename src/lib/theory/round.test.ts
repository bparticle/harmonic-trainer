import { describe, expect, it } from 'vitest';
import { GAME_IDS, makeDeck, type RoundSpec } from './catalog';
import { beginRound, parseSubmission, resultOf, submitAnswer, type Round } from './round';

const spec: RoundSpec = {
	game: 'circle',
	mode: 'recall',
	level: 'starter',
	direction: 'clockwise',
	seed: 42
};
const id = '12345678-1234-4234-8234-123456789012';
function finish(start: Round) {
	let round = start;
	const deck = makeDeck(round.spec);
	while (round.position < round.queue.length)
		round = submitAnswer(round, deck[round.queue[round.position].question].answer);
	return round;
}

describe('theory rounds', () => {
	it.each(GAME_IDS)('finishes and validates a perfect %s round', (game) => {
		const round = finish(beginRound({ ...spec, game }));
		const result = resultOf(round);
		expect(result.firstTry).toBe(makeDeck(round.spec).length);
		expect(result.stars).toBe(3);
		expect(parseSubmission({ id, spec: round.spec, attempts: round.attempts })?.result).toEqual(
			result
		);
	});
	it('keeps wrong answers on the question, then adds just one spaced second look', () => {
		let round = beginRound(spec);
		round = submitAnswer(round, ['7']);
		round = submitAnswer(round, ['2']);
		expect(round.position).toBe(0);
		expect(round.queue).toHaveLength(13);
		round = submitAnswer(round, ['0']);
		expect(round.position).toBe(1);
		expect(round.queue).toHaveLength(14);
		expect(round.queue.at(-1)).toEqual({ question: 0, retry: true });
		const done = finish(round);
		expect(resultOf(done)).toEqual({ total: 13, firstTry: 12, recovered: 1, hints: 0, stars: 2 });
	});
	it('does not count hinted answers as independent recall and revisits them', () => {
		const round = submitAnswer(beginRound(spec), ['0'], true);
		expect(round.queue).toHaveLength(14);
		expect(resultOf(finish(round))).toEqual({
			total: 13,
			firstTry: 12,
			recovered: 1,
			hints: 1,
			stars: 2
		});
	});
	it('does not append endless retry loops, even if a second look is missed', () => {
		let round = submitAnswer(submitAnswer(beginRound(spec), ['7']), ['0']);
		const deck = makeDeck(spec);
		while (round.position < 13)
			round = submitAnswer(round, deck[round.queue[round.position].question].answer);
		round = submitAnswer(round, ['7']);
		round = submitAnswer(round, ['0']);
		expect(round.position).toBe(14);
		expect(round.queue).toHaveLength(14);
	});
	it('records guided learning separately, without awarding recall stars', () => {
		expect(resultOf(finish(beginRound({ ...spec, mode: 'guided' }))).stars).toBe(0);
	});
	it('rejects unfinished, reordered, malformed and forged results', () => {
		const round = finish(beginRound(spec));
		const valid = { id, spec, attempts: round.attempts };
		for (const bad of [
			null,
			{},
			{ ...valid, id: 'bad' },
			{ ...valid, spec: { ...spec, seed: -1 } },
			{ ...valid, spec: { ...spec, game: '__proto__' } },
			{ ...valid, attempts: [] },
			{ ...valid, attempts: [...round.attempts].reverse() },
			{ ...valid, attempts: [{ question: 0, values: ['0'], hinted: 'false' }] }
		])
			expect(parseSubmission(bad)).toBeNull();
		expect(parseSubmission({ ...valid, result: { stars: 200 } })?.result.stars).toBe(3);
	});
	it('requires reviews to be completed before accepting the round', () => {
		let round = submitAnswer(beginRound(spec), ['0'], true);
		const deck = makeDeck(spec);
		while (round.position < 13)
			round = submitAnswer(round, deck[round.queue[round.position].question].answer);
		expect(parseSubmission({ id, spec, attempts: round.attempts })).toBeNull();
	});
});
