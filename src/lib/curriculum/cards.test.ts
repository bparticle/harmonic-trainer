import { describe, expect, it } from 'vitest';
import { pitchClass } from '$lib/music/note';
import { parseKey } from '$lib/music/key';
import {
	CROSSING_SKILL,
	allSkillCodes,
	cardsForKeyCentre,
	cardsForKeyMoved,
	cardsForPivots,
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

	/*
	 * The pivot question asks for a diatonic seventh, so unlike its two siblings
	 * it cannot be answered until the rung that teaches sevenths is open in that
	 * key. The other two are answered with a single note and are open at once.
	 */
	it('holds the pivot question back until the sevenths are open in that key', () => {
		const shallow = cardsForReached(reached);
		expect(shallow.some((card) => card.direction === 'pivot_play')).toBe(false);
		expect(shallow.some((card) => card.direction === 'key_moved')).toBe(true);

		const deep = cardsForReached([...reached, { key: 'C', rungId: 'all-sevenths' as const }]);
		const pivots = deep.filter((card) => card.direction === 'pivot_play');
		expect(pivots.length).toBeGreaterThan(0);
		expect(pivots.every((card) => card.keyCenter === 'C')).toBe(true);
	});

	it('makes one key-centre card per key, however deep the ladder goes there', () => {
		const keyCards = cardsForReached(reached).filter((card) => card.direction === 'key_hear');
		expect(keyCards.map((card) => card.keyCenter).sort()).toEqual(['C', 'G']);
	});

	it('still makes every rung card it always made', () => {
		// By skill rather than by direction: the crossing family has three
		// directions now and a filter naming one of them goes stale silently.
		const rungCards = cardsForReached(reached).filter((card) => card.skillCode.startsWith('rung:'));
		expect(rungCards.length).toBeGreaterThan(0);
		expect(rungCards.every((card) => card.direction !== 'key_hear')).toBe(true);
	});

	it('never repeats an identity, so nothing is created twice', () => {
		const all = cardsForReached(
			STAGES.flatMap((stage) => RUNGS.map((rung) => ({ key: stage.key, rungId: rung.id })))
		);
		expect(new Set(all.map((card) => card.identity)).size).toBe(all.length);
	});
});

describe('the key-moved card', () => {
	it('asks about the four relations a musician has a word for', () => {
		const cards = cardsForKeyMoved('C');
		expect(cards).toHaveLength(4);
		expect(cards.map((card) => card.payload.label)).toEqual([
			'Am — the relative',
			'G — the dominant',
			'F — the subdominant',
			'Cm — the parallel'
		]);
	});

	it('answers with the tonic of the key it moved to, not the one it left', () => {
		const [, dominant] = cardsForKeyMoved('C');
		// G, not C.
		expect(dominant.payload.answerPitchClasses).toEqual([7]);
	});

	it('sounds two cadences, the second one in the new key', () => {
		const [, dominant] = cardsForKeyMoved('C');
		const symbols = dominant.payload.steps?.map((step) => step.symbol);
		expect(symbols).toEqual(['F', 'G', 'C', 'C', 'D', 'G']);
	});

	it('is filed under the key it starts in, so the queue spreads by home', () => {
		for (const card of cardsForKeyMoved('Eb')) expect(card.keyCenter).toBe('Eb');
	});

	it('names the move in the reveal, which is the half that transposes', () => {
		const [relative] = cardsForKeyMoved('C');
		expect(relative.payload.detail).toContain('relative');
	});
});

describe('the pivot card', () => {
	it('shows two numerals and no chord name', () => {
		const dominant = cardsForPivots('C').find((card) => card.identity.includes('|G|'))!;
		expect(dominant.payload.detail).toBe('Imaj7 in C · IVmaj7 in G');
		// Real accidentals, because the key names beside them already are.
		const relative = cardsForPivots('C').find((card) => card.identity.includes('|Am|'))!;
		expect(relative.payload.detail).toContain('♭III');
		expect(relative.payload.detail).not.toContain('bIII');
		expect(dominant.payload.detail).not.toContain(dominant.payload.label);
	});

	it('answers with the chord the two numerals point at', () => {
		const dominant = cardsForPivots('C').find((card) => card.identity.includes('|G|'))!;
		expect(dominant.payload.label).toBe('Cmaj7');
		expect(dominant.payload.answerPitchClasses.sort((a, b) => a - b)).toEqual([0, 4, 7, 11]);
	});

	/*
	 * The parallel key shares no diatonic seventh at all, which is exactly why
	 * that modulation is hard — and why it gets no hinge card rather than a card
	 * with an empty answer.
	 */
	it('makes no card for a crossing with nothing to pivot on', () => {
		const cards = cardsForPivots('C');
		expect(cards.some((card) => card.identity.includes('|Cm|'))).toBe(false);
		expect(cards).toHaveLength(3);
	});

	it('takes one pivot per crossing, and the same one every time', () => {
		expect(cardsForPivots('C').map((c) => c.identity)).toEqual(
			cardsForPivots('C').map((c) => c.identity)
		);
		// The relative shares all seven; one card, not seven.
		expect(cardsForPivots('C').filter((c) => c.identity.includes('|Am|'))).toHaveLength(1);
	});
});
