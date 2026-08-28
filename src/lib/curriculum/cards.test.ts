import { describe, expect, it } from 'vitest';
import { pitchClass } from '$lib/music/note';
import { parseKey } from '$lib/music/key';
import {
	CROSSING_SKILL,
	allSkillCodes,
	cardsForKeyCentre,
	cardsForReached,
	skillSeeds
} from './cards';
import { RUNGS, STAGES } from './ladder';

/**
 * The key-centre card, which is the only card in this file whose subject is a
 * key rather than a chord — and the only one whose prompt deliberately withholds
 * something the payload knows.
 */
describe('the key-centre card', () => {
	it('is one card per key, in the direction that asks where you are', () => {
		const cards = cardsForKeyCentre('C');
		expect(cards).toHaveLength(1);
		expect(cards[0]).toMatchObject({ direction: 'key_hear', keyCenter: 'C' });
	});

	it('answers with the tonic and nothing else', () => {
		for (const stage of STAGES) {
			const [card] = cardsForKeyCentre(stage.key);
			const tonic = pitchClass(parseKey(stage.key).tonic);
			expect(card.payload.answerPitchClasses, stage.key).toEqual([tonic]);
		}
	});

	it('carries the cadence to sound, ending on the chord that answers it', () => {
		const [card] = cardsForKeyCentre('Eb');
		expect(card.payload.steps?.map((step) => step.symbol)).toEqual(['Ab', 'Bb', 'Eb']);
		for (const step of card.payload.steps ?? []) expect(step.voicing).toHaveLength(3);
	});

	/*
	 * The label is the answer. It exists so the reveal can name the key, and the
	 * prompt is what has to refuse to show it — see `pose`. Storing it is right;
	 * showing it early would be the bug.
	 */
	it('names the key as a person reads it, for the reveal', () => {
		expect(cardsForKeyCentre('Eb')[0].payload.label).toBe('E♭');
		expect(cardsForKeyCentre('C')[0].payload.label).toBe('C');
	});

	it('has a stable identity, so regenerating keeps the review history', () => {
		expect(cardsForKeyCentre('Gb')[0].identity).toBe('crossing|key-centre|Gb|key_hear');
		expect(cardsForKeyCentre('Gb')[0].identity).toBe(cardsForKeyCentre('Gb')[0].identity);
	});

	it('hangs off a skill the seed actually writes', () => {
		expect(allSkillCodes()).toContain(CROSSING_SKILL);
		expect(skillSeeds().map((seed) => seed.code)).toContain(CROSSING_SKILL);
	});
});

describe('cards for everything the frontier holds', () => {
	const reached = [
		{ key: 'C', rungId: 'scale' as const },
		{ key: 'C', rungId: 'tonic-triad' as const },
		{ key: 'G', rungId: 'scale' as const }
	];

	it('makes one key-centre card per key, however deep the ladder goes there', () => {
		const keyCards = cardsForReached(reached).filter((card) => card.direction === 'key_hear');
		expect(keyCards.map((card) => card.keyCenter).sort()).toEqual(['C', 'G']);
	});

	it('still makes every rung card it always made', () => {
		const rungCards = cardsForReached(reached).filter((card) => card.direction !== 'key_hear');
		expect(rungCards.every((card) => card.skillCode.startsWith('rung:'))).toBe(true);
		expect(rungCards.length).toBeGreaterThan(0);
	});

	it('never repeats an identity, so nothing is created twice', () => {
		const all = cardsForReached(
			STAGES.flatMap((stage) => RUNGS.map((rung) => ({ key: stage.key, rungId: rung.id })))
		);
		expect(new Set(all.map((card) => card.identity)).size).toBe(all.length);
	});
});
