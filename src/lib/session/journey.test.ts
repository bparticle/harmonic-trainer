import { describe, expect, it } from 'vitest';
import {
	FIRST_FRONTIER,
	RUNGS,
	STAGES,
	deepen,
	frontierFromPosition,
	widenNext,
	type Frontier
} from '$lib/curriculum/ladder';
import {
	LADDER_CELLS,
	describeTasks,
	describeWhen,
	journeyProgress,
	ladderPath,
	ladderTotals,
	hasOutgrown,
	looksSolid,
	readyToMoveOn,
	rungOfSkill,
	type RungRecord
} from './journey';

/** A frontier `moves` deepenings past the start. */
const after = (moves: number): Frontier => {
	let frontier = FIRST_FRONTIER;
	for (let i = 0; i < moves; i++) frontier = deepen(frontier) ?? frontier;
	return frontier;
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

describe('the path, as the frontier', () => {
	it('is one row per rung, always, so nothing is hidden behind a scroll', () => {
		expect(ladderPath(FIRST_FRONTIER)).toHaveLength(RUNGS.length);
		expect(ladderPath(after(4))).toHaveLength(RUNGS.length);
	});

	it('names how many keys each rung is open in', () => {
		const path = ladderPath(after(3));
		expect(path.map((step) => step.keys)).toEqual([4, 3, 2, 1, 0, 0, 0]);
		expect(path[0].keyNames).toEqual(['C', 'G', 'F', 'D']);
	});

	it('marks the deepest open rung as here, the rest as open or ahead', () => {
		const path = ladderPath(after(2));
		expect(path.map((step) => step.state)).toEqual([
			'open',
			'open',
			'here',
			'ahead',
			'ahead',
			'ahead',
			'ahead'
		]);
	});

	it('puts the whole ladder ahead on a first morning but the first rung here', () => {
		const path = ladderPath(FIRST_FRONTIER);
		expect(path[0].state).toBe('here');
		expect(path.slice(1).every((step) => step.state === 'ahead')).toBe(true);
	});

	/*
	 * The number that answers "do I know this yet". A rung met in four keys and
	 * answered well in all of them is a different thing from one met in four and
	 * answered well in one, and only a total across its keys can say so.
	 */
	it('sums the record across every key a rung is open in', () => {
		const records: RungRecord[] = [
			{ key: 'C', rungId: 'scale', reviews: 6, correct: 6 },
			{ key: 'G', rungId: 'scale', reviews: 4, correct: 3 },
			// Open in neither: rung two only reaches C at this depth.
			{ key: 'G', rungId: 'tonic-triad', reviews: 40, correct: 40 }
		];
		const path = ladderPath(after(1), records);
		expect(path[0]).toMatchObject({ keys: 2, reviews: 10, correct: 9 });
		expect(path[1]).toMatchObject({ keys: 1, reviews: 0, correct: 0, untouched: true });
	});

	it('never counts a key the rung is not open in', () => {
		const records: RungRecord[] = [{ key: 'Gb', rungId: 'scale', reviews: 99, correct: 99 }];
		expect(ladderPath(FIRST_FRONTIER, records)[0].reviews).toBe(0);
	});

	it('calls a rung solid on its total, agreeing with the button that offers it', () => {
		const records: RungRecord[] = [
			{ key: 'C', rungId: 'scale', reviews: 4, correct: 4 },
			{ key: 'G', rungId: 'scale', reviews: 4, correct: 4 }
		];
		// Four is under the rung's suggestAfter of six; eight across two keys is not.
		expect(ladderPath(FIRST_FRONTIER, records)[0].solid).toBe(false);
		expect(ladderPath(after(1), records)[0].solid).toBe(true);
	});

	it('never calls a closed rung untouched, because it has not been opened', () => {
		expect(ladderPath(FIRST_FRONTIER).filter((step) => step.untouched)).toHaveLength(1);
	});
});

describe('journeyProgress', () => {
	it('counts cells open rather than steps along a walk', () => {
		expect(journeyProgress(FIRST_FRONTIER)).toMatchObject({ cells: 1, total: LADDER_CELLS });
		// Deepening opens more than one cell, which is the point of it.
		expect(journeyProgress(after(1)).cells).toBe(3);
		expect(journeyProgress(after(6)).cells).toBe(28);
	});

	it('reports depth and breadth separately, because they move separately', () => {
		const progress = journeyProgress(after(3));
		expect(progress.depth).toBe(4);
		expect(progress.rungs).toBe(RUNGS.length);
		expect(progress.keys).toBe(4);
	});

	it('fills to one only when every cell is open', () => {
		const everything: Frontier = { widths: RUNGS.map(() => STAGES.length) };
		expect(journeyProgress(everything).fill).toBe(1);
		expect(journeyProgress(everything).cells).toBe(LADDER_CELLS);
	});

	it('only ever goes up, whichever move is made', () => {
		let frontier: Frontier = FIRST_FRONTIER;
		let last = journeyProgress(frontier).cells;
		for (let i = 0; i < 30; i++) {
			frontier = deepen(frontier) ?? widenNext(frontier) ?? frontier;
			const now = journeyProgress(frontier).cells;
			expect(now).toBeGreaterThanOrEqual(last);
			last = now;
		}
	});

	it('agrees with a migrated position about how much is open', () => {
		const migrated = frontierFromPosition('G', 'primary-triads')!;
		// All seven of C, plus three of G: ten cells.
		expect(journeyProgress(migrated).cells).toBe(10);
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

describe('a rung that has been worked past the point of teaching anything', () => {
	const homeChord = RUNGS[1]; // suggested after six

	/*
	 * The account this was written for had answered the home chord eighty-five
	 * times at forty-nine per cent. `looksSolid` was false every single morning,
	 * so the app never once offered the next rung, and the only advice on screen
	 * was the same rung again tomorrow. Being stuck and being unready are
	 * different, and only one of them is a reason to wait.
	 */
	it('is not solid, and says so', () => {
		expect(looksSolid(homeChord, 85, 42)).toBe(false);
	});

	it('is still worth offering the way on', () => {
		expect(hasOutgrown(homeChord, 85)).toBe(true);
		expect(readyToMoveOn(homeChord, 85, 42)).toBe(true);
	});

	it('does not fire while the rung is still doing its job', () => {
		expect(hasOutgrown(homeChord, homeChord.suggestAfter)).toBe(false);
		expect(hasOutgrown(homeChord, homeChord.suggestAfter * 3 - 1)).toBe(false);
	});

	it('agrees with looksSolid wherever looksSolid is happy', () => {
		expect(readyToMoveOn(homeChord, 10, 9)).toBe(true);
		expect(looksSolid(homeChord, 10, 9)).toBe(true);
	});

	it('offers nothing on a rung nobody has answered', () => {
		expect(readyToMoveOn(homeChord, 0, 0)).toBe(false);
	});
});
