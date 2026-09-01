import { describe, expect, it } from 'vitest';
import { RUNGS, STAGES, stageByKey } from './ladder';
import { PROGRESSIONS, progressionById } from './progressions';
import {
	FLAT_REACH,
	PROGRESSION_ANCHORS,
	SHARP_REACH,
	STATIONS,
	builtBy,
	columnOf,
	neighbours,
	progressionAnchor,
	sayInKey,
	stageAtAccidentals,
	wrapAccidentals
} from './atlas';

const stage = (key: string) => {
	const found = stageByKey(key);
	if (!found) throw new Error(`no stage for ${key}`);
	return found;
};

describe('the geography', () => {
	it('lays the twelve out by accidentals, flats first', () => {
		expect(STATIONS.map((s) => s.key)).toEqual([
			'Gb',
			'Db',
			'Ab',
			'Eb',
			'Bb',
			'F',
			'C',
			'G',
			'D',
			'A',
			'E',
			'B'
		]);
	});

	it('gives every stage a distinct column, C in the middle', () => {
		const columns = STAGES.map(columnOf);
		expect(new Set(columns).size).toBe(STAGES.length);
		expect(columnOf(stage('C'))).toBe(FLAT_REACH);
		expect(Math.min(...columns)).toBe(0);
		expect(Math.max(...columns)).toBe(FLAT_REACH + SHARP_REACH);
	});

	it('closes the loop: one more sharp than B is the same station as G flat', () => {
		expect(stageAtAccidentals(6).key).toBe('Gb');
		expect(wrapAccidentals(6)).toBe(-6);
		expect(wrapAccidentals(-7)).toBe(5);
	});

	it('leaves the twelve real values alone', () => {
		for (const s of STAGES) {
			expect(wrapAccidentals(s.accidentals)).toBe(s.accidentals);
			expect(stageAtAccidentals(s.accidentals).key).toBe(s.key);
		}
	});
});

describe('neighbours', () => {
	it('does not move for the relative', () => {
		const [relative] = neighbours(stage('C'));
		expect(relative.relation).toBe('relative');
		expect(relative.stops).toBe(0);
		expect(relative.stage.key).toBe('C');
		expect(relative.label).toBe('Am');
	});

	it('puts the dominant one stop sharp and the subdominant one stop flat', () => {
		const from = neighbours(stage('C'));
		expect(from.find((n) => n.relation === 'dominant')?.stage.key).toBe('G');
		expect(from.find((n) => n.relation === 'subdominant')?.stage.key).toBe('F');
	});

	it('puts the parallel three stops flat, always', () => {
		// The whole reason `RELATION_ORDER` ranks it last of the named four: it
		// shares a letter and not a neighbourhood.
		expect(neighbours(stage('C')).find((n) => n.relation === 'parallel')?.stage.key).toBe('Eb');
		expect(neighbours(stage('G')).find((n) => n.relation === 'parallel')?.stage.key).toBe('Bb');
		expect(neighbours(stage('Eb')).find((n) => n.relation === 'parallel')?.stage.key).toBe('Gb');
	});

	it('wraps round the loop rather than walking off the end', () => {
		// D flat minor is C sharp minor, which is E major's relative.
		const parallel = neighbours(stage('Db')).find((n) => n.relation === 'parallel');
		expect(parallel?.stage.key).toBe('E');
		expect(parallel?.label).toBe('Dbm');
	});

	it('names four relations and lands every one of them on a real station', () => {
		for (const s of STAGES) {
			const found = neighbours(s);
			expect(found).toHaveLength(4);
			for (const n of found) expect(stageByKey(n.stage.key)).toBeDefined();
		}
	});
});

describe('builtBy', () => {
	it('finds the nearest key that actually builds a chord', () => {
		expect(builtBy('G7')?.key).toBe('C');
		expect(builtBy('E7')?.key).toBe('A');
		expect(builtBy('Db7')?.key).toBe('Gb');
	});

	it('sends the borrowed fourth to the parallel minor rather than further out', () => {
		// F minor is diatonic to both E flat and A flat. In C it is the borrowed
		// iv, borrowed from C minor, which is three flats — E flat's.
		expect(builtBy('Fm')?.key).toBe('Eb');
	});

	it('answers null for a chord no key builds', () => {
		expect(builtBy('G7sus4')).toBeNull();
		expect(builtBy('AmMaj7')).toBeNull();
	});
});

describe('progressionAnchor', () => {
	it('anchors every progression in the library', () => {
		expect(Object.keys(PROGRESSION_ANCHORS)).toHaveLength(PROGRESSIONS.length);
	});

	it('opens the three main chords on the rung that builds them', () => {
		const anchor = PROGRESSION_ANCHORS['I-IV-V-I'];
		expect(anchor.opensOn).toBe('primary-triads');
		expect(anchor.borrows).toEqual([]);
	});

	it('waits for the sevenths before offering the jazz cadence', () => {
		expect(PROGRESSION_ANCHORS['ii-V-I'].opensOn).toBe('all-sevenths');
		expect(PROGRESSION_ANCHORS['ii-V-I'].borrows).toEqual([]);
	});

	it('never offers a minor progression before the rung that grants a minor key', () => {
		const minorRung = RUNGS.findIndex((rung) => rung.id === 'relative-minor');
		for (const progression of PROGRESSIONS.filter((p) => p.mode === 'minor')) {
			const anchor = PROGRESSION_ANCHORS[progression.id];
			if (anchor.lineIndex === null) continue;
			expect(anchor.lineIndex).toBeGreaterThanOrEqual(minorRung);
		}
	});

	it('sends borrowed and blues chords flat, and secondary dominants sharp', () => {
		// Not designed in — read off the library, and the reason the map is laid
		// out from the middle rather than from one end.
		const flatward = ['borrowed-four', 'backdoor', 'mixolydian-cadence', 'blues-basic'];
		for (const id of flatward) {
			const borrows = PROGRESSION_ANCHORS[id].borrows;
			expect(borrows.length).toBeGreaterThan(0);
			for (const borrow of borrows) expect(borrow.from?.accidentals).toBeLessThan(0);
		}

		for (const id of ['secondary-dominant', 'ragtime-circle']) {
			const borrows = PROGRESSION_ANCHORS[id].borrows;
			expect(borrows.length).toBeGreaterThan(0);
			for (const borrow of borrows) expect(borrow.from?.accidentals).toBeGreaterThan(0);
		}
	});

	it('reads the ragtime circle as three consecutive stations walking home', () => {
		const borrows = PROGRESSION_ANCHORS['ragtime-circle'].borrows;
		expect(borrows.map((b) => b.from?.key)).toEqual(['A', 'D', 'G']);
		expect(borrows.map((b) => b.stops)).toEqual([3, 2, 1]);
	});

	it('puts the tritone substitution at the far terminus', () => {
		const [borrow] = PROGRESSION_ANCHORS['tritone-sub'].borrows;
		expect(borrow.from?.key).toBe('Gb');
		expect(borrow.stops).toBe(6);
	});

	it('leaves the two unteachable shapes without an address', () => {
		// The same pair `ROADMAP.md` records as taught by nothing, found from the
		// other end: no key builds a suspended chord or a minor-major seventh.
		for (const id of ['sus-resolution', 'line-cliche']) {
			const borrows = PROGRESSION_ANCHORS[id].borrows;
			expect(borrows.length).toBeGreaterThan(0);
			for (const borrow of borrows) expect(borrow.from).toBeNull();
		}
	});

	it('agrees with itself when asked directly', () => {
		const progression = progressionById('backdoor');
		expect(progression).toBeDefined();
		expect(progressionAnchor(progression!)).toEqual(PROGRESSION_ANCHORS['backdoor']);
	});
});

describe('sayInKey', () => {
	it('leaves C alone', () => {
		expect(sayInKey('Fm', 0)).toBe('Fm');
		expect(sayInKey('E7', 0)).toBe('E7');
	});

	it('moves a borrowed chord with the departure', () => {
		// The borrowed fourth in E flat is A flat minor; the ragtime III7 there is
		// G7. Both are one fifth per accidental, respelled from the flat side.
		expect(sayInKey('Fm', -3)).toBe('Abm');
		expect(sayInKey('E7', -3)).toBe('G7');
		expect(sayInKey('D7', -3)).toBe('F7');
	});

	it('respells from the sharp side in a sharp key', () => {
		expect(sayInKey('E7', 1)).toBe('B7');
		expect(sayInKey('Bb', 2)).toBe('C');
	});

	it('wraps round the loop like everything else', () => {
		// The tritone substitution in G flat is G7, which C builds.
		expect(sayInKey('Db7', -6)).toBe('G7');
	});

	it('keeps whatever follows the root', () => {
		expect(sayInKey('AmMaj7', -1)).toBe('DmMaj7');
		expect(sayInKey('G7sus4', 1)).toBe('D7sus4');
	});
});
