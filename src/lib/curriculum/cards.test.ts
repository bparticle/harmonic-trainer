import { describe, expect, it } from 'vitest';
import { pitchClass } from '$lib/music/note';
import { parseKey } from '$lib/music/key';
import {
	CROSSING_SKILL,
	allSkillCodes,
	cardsForPivots,
	cardsForReached,
	skillSeeds
} from './cards';
import { RUNGS, STAGES } from './ladder';

describe('cards for everything the frontier holds', () => {
	const reached = [
		{ key: 'C', rungId: 'scale' as const },
		{ key: 'C', rungId: 'tonic-triad' as const },
		{ key: 'G', rungId: 'scale' as const }
	];

	/*
	 * The pivot question asks for a diatonic seventh, so it cannot be answered
	 * until the rung that teaches sevenths is open in that key.
	 */
	it('holds the pivot question back until the sevenths are open in that key', () => {
		const shallow = cardsForReached(reached);
		expect(shallow.some((card) => card.direction === 'pivot_play')).toBe(false);

		const deep = cardsForReached([...reached, { key: 'C', rungId: 'all-sevenths' as const }]);
		const pivots = deep.filter((card) => card.direction === 'pivot_play');
		expect(pivots.length).toBeGreaterThan(0);
		expect(pivots.every((card) => card.keyCenter === 'C')).toBe(true);
	});

	/*
	 * The regression this milestone exists for. A key the frontier has merely
	 * touched used to arrive carrying five cadence questions, and a first workout
	 * opened with six of them in front of somebody who knew one scale.
	 */
	it('gives a shallow account nothing but its rungs', () => {
		const shallow = cardsForReached(reached);
		expect(shallow.every((card) => card.skillCode.startsWith('rung:'))).toBe(true);
		expect(shallow.some((card) => card.skillCode === CROSSING_SKILL)).toBe(false);
	});

	it('still makes every rung card it always made', () => {
		const rungCards = cardsForReached(reached).filter((card) => card.skillCode.startsWith('rung:'));
		expect(rungCards.length).toBeGreaterThan(0);
	});

	it('never repeats an identity, so nothing is created twice', () => {
		const all = cardsForReached(
			STAGES.flatMap((stage) => RUNGS.map((rung) => ({ key: stage.key, rungId: rung.id })))
		);
		expect(new Set(all.map((card) => card.identity)).size).toBe(all.length);
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
