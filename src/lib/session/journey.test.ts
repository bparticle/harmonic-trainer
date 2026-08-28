import { describe, expect, it } from 'vitest';
import { FIRST_POSITION, positionOf, RUNGS, STAGES } from '$lib/curriculum/ladder';
import {
	LADDER_LENGTH,
	describeTasks,
	describeWhen,
	journeyProgress,
	ladderTotals,
	looksSolid,
	ordinalOf,
	pathWindow,
	rungOfSkill,
	type RungRecord
} from './journey';

const at = (key: string, rungId: string) => {
	const position = positionOf(key, rungId);
	if (!position) throw new Error(`no such position: ${key} ${rungId}`);
	return position;
};

describe('looksSolid', () => {
	const rung = RUNGS[1]; // the home chord, suggested after six

	it('wants enough questions before it says anything', () => {
		expect(looksSolid(rung, 5, 5)).toBe(false);
		expect(looksSolid(rung, 6, 6)).toBe(true);
	});

	it('wants them mostly right', () => {
		expect(looksSolid(rung, 10, 7)).toBe(false);
		expect(looksSolid(rung, 10, 8)).toBe(true);
	});

	it('says nothing about a rung nobody has been asked', () => {
		expect(looksSolid(rung, 0, 0)).toBe(false);
	});
});

describe('pathWindow', () => {
	it('puts the current position in the middle and names the sides', () => {
		const steps = pathWindow(at('C', 'primary-triads'), [], { behind: 2, ahead: 3 });
		expect(steps.map((step) => step.label)).toEqual([
			'The scale',
			'The home chord',
			'The three main chords',
			'All seven triads',
			'Adding the seventh',
			'All seven sevenths'
		]);
		expect(steps.map((step) => step.state)).toEqual([
			'done',
			'done',
			'here',
			'ahead',
			'ahead',
			'ahead'
		]);
	});

	it('clamps rather than inventing a past', () => {
		const steps = pathWindow(FIRST_POSITION, [], { behind: 3, ahead: 2 });
		expect(steps).toHaveLength(3);
		expect(steps[0].state).toBe('here');
	});

	it('clamps at the far end of the ladder too', () => {
		const last = at(STAGES[STAGES.length - 1].key, RUNGS[RUNGS.length - 1].id);
		const steps = pathWindow(last, [], { behind: 1, ahead: 4 });
		expect(steps).toHaveLength(2);
		expect(steps[steps.length - 1].ordinal).toBe(LADDER_LENGTH);
	});

	it('crosses into the next key and marks where it did', () => {
		const steps = pathWindow(at('C', 'relative-minor'), [], { behind: 1, ahead: 2 });
		const opened = steps.filter((step) => step.opensKey);
		expect(opened).toHaveLength(1);
		expect(opened[0].key).toBe('G');
		expect(opened[0].label).toBe('The scale');
	});

	it('carries the record for the step it belongs to, and nobody else', () => {
		const records: RungRecord[] = [
			{ key: 'C', rungId: 'scale', reviews: 8, correct: 8 },
			// Same rung, different key: must not be read as this key's.
			{ key: 'G', rungId: 'tonic-triad', reviews: 40, correct: 40 }
		];
		const steps = pathWindow(at('C', 'tonic-triad'), records, { behind: 1, ahead: 0 });
		expect(steps[0]).toMatchObject({ key: 'C', reviews: 8, correct: 8, solid: true });
		expect(steps[1]).toMatchObject({ key: 'C', reviews: 0, correct: 0, untouched: true });
	});

	it('never calls a step ahead untouched, because it has not been reached', () => {
		const steps = pathWindow(FIRST_POSITION, [], { behind: 0, ahead: 3 });
		expect(steps.filter((step) => step.state === 'ahead').every((step) => !step.untouched)).toBe(
			true
		);
	});
});

describe('journeyProgress', () => {
	it('counts from one and ends at the length of the ladder', () => {
		expect(journeyProgress(FIRST_POSITION)).toMatchObject({ step: 1, total: LADDER_LENGTH });
		const last = at(STAGES[STAGES.length - 1].key, RUNGS[RUNGS.length - 1].id);
		expect(journeyProgress(last).step).toBe(LADDER_LENGTH);
		expect(journeyProgress(last).fill).toBe(1);
	});

	it('agrees with the ordinal the window uses', () => {
		const position = at('F', 'tonic-seventh');
		expect(journeyProgress(position).step).toBe(ordinalOf(position.stageIndex, position.rungIndex));
	});
});

describe('ladderTotals', () => {
	it('counts only what has actually been asked', () => {
		const totals = ladderTotals([
			{ key: 'C', rungId: 'scale', reviews: 10, correct: 9 },
			{ key: 'C', rungId: 'tonic-triad', reviews: 4, correct: 3 },
			{ key: 'G', rungId: 'scale', reviews: 0, correct: 0 }
		]);
		expect(totals).toEqual({ reviews: 14, correct: 12, keys: 1, steps: 2 });
	});

	it('is zero on an empty record rather than undefined', () => {
		expect(ladderTotals([])).toEqual({ reviews: 0, correct: 0, keys: 0, steps: 0 });
	});
});

describe('describeWhen', () => {
	const now = new Date(2026, 7, 28, 9, 0); // Friday 28 August 2026

	it('names today and yesterday as calendar days, not as hours', () => {
		expect(describeWhen(new Date(2026, 7, 28, 23, 30), now)).toBe('today');
		expect(describeWhen(new Date(2026, 7, 27, 23, 30), now)).toBe('yesterday');
	});

	it('names the weekday inside the last week', () => {
		expect(describeWhen(new Date(2026, 7, 25, 10, 0), now)).toBe('Tue');
	});

	it('gives a date once the weekday would be ambiguous', () => {
		expect(describeWhen(new Date(2026, 7, 12, 10, 0), now)).toBe('12 Aug');
	});

	it('never counts days since', () => {
		for (let back = 0; back < 30; back++) {
			const when = new Date(2026, 7, 28 - back, 10, 0);
			expect(describeWhen(when, now)).not.toMatch(/ago/);
		}
	});
});

describe('describeTasks', () => {
	it('joins them in order', () => {
		expect(describeTasks(['Ear', 'Function', 'Mission'])).toBe('Ear · Function · Mission');
	});

	it('counts a repeat rather than stuttering', () => {
		expect(describeTasks(['Ear', 'Mission', 'Mission'])).toBe('Ear · Mission ×2');
	});

	it('says nothing about an empty workout', () => {
		expect(describeTasks([])).toBe('');
	});
});

describe('rungOfSkill', () => {
	it('reads a rung code back', () => {
		expect(rungOfSkill('rung:tonic-triad')).toBe('tonic-triad');
	});

	it('refuses anything that is not one', () => {
		expect(rungOfSkill('prog:ii-V-I')).toBeNull();
		expect(rungOfSkill('rung:nonsense')).toBeNull();
	});
});
