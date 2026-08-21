import { describe, expect, it } from 'vitest';
import { CHARTS, MISSION_CHARTS, chartDemand } from './charts';
import { PROGRESSIONS, progressionById } from './progressions';
import { RUNGS, STAGES, itemsForRung, reachedSoFar, positionOf, type RungId } from './ladder';
import {
	ALL_RUNGS,
	demandOfGrid,
	demandOfNumerals,
	describeShortfall,
	emptyVocabulary,
	isReady,
	reachOf,
	shapeOf,
	shapesForRung,
	shortfall,
	taughtBy,
	vocabularyFromProgressions,
	vocabularyFromRungs,
	vocabularyOf,
	type Shape
} from './vocabulary';

const demandOf = (numerals: string[], mode: 'major' | 'minor' = 'major') =>
	demandOfNumerals(numerals, mode);

const rungsTo = (key: string, rungId: RungId) =>
	reachedSoFar(positionOf(key, rungId)!).map((place) => place.rungId);

const knowing = (key: string, rungId: RungId, progressions: string[] = []) =>
	vocabularyOf({ rungs: rungsTo(key, rungId), progressions });

const chartsBySlug = new Map(MISSION_CHARTS.map((chart) => [chart.slug, chart]));
const ready = (slug: string, vocabulary: ReturnType<typeof knowing>) =>
	isReady(chartsBySlug.get(slug)!.demand, vocabulary);

describe('the shape a chord makes', () => {
	it('tells a triad from the seventh built on it', () => {
		expect(demandOf(['I']).shapes).toEqual(['major']);
		expect(demandOf(['Imaj7']).shapes).toEqual(['major seventh']);
		expect(demandOf(['ii']).shapes).toEqual(['minor']);
		expect(demandOf(['ii7']).shapes).toEqual(['minor seventh']);
	});

	/*
	 * A bare lowercase numeral takes its quality from the key, so `vii` in a major
	 * key is the diminished triad. A suffix means the numeral is naming its own
	 * quality, which is why `vii7` is the plain minor seventh a bird blues uses as
	 * the ii of its III7 — and `viiø7` is how the half-diminished one is written.
	 */
	it('reads a bare lowercase vii as the diminished triad the key makes it', () => {
		expect(demandOf(['vii']).shapes).toEqual(['diminished']);
		expect(demandOf(['viiø7']).shapes).toEqual(['half-diminished']);
		expect(demandOf(['vii7']).shapes).toEqual(['minor seventh']);
	});

	it('counts a dominant as a dominant wherever it stands', () => {
		for (const numeral of ['V7', 'I7', 'III7', 'bII7', 'bVII7']) {
			expect(demandOf([numeral]).shapes, numeral).toEqual(['dominant seventh']);
		}
	});

	/*
	 * The fold, stated as a test so that changing it has to be deliberate. A sixth
	 * chord is the triad with a sixth on top and the chart prints the symbol; a
	 * fully-diminished seventh is the vii° with the stack carried one third
	 * further. Neither waits on a rung of its own. What is never folded is
	 * anything whose middle changes — a minor seventh is its own thing.
	 */
	it('folds the sixth into its triad and the diminished seventh into the diminished', () => {
		expect(demandOf(['I6']).shapes).toEqual(['major']);
		expect(demandOf(['i6']).shapes).toEqual(['minor']);
		expect(demandOf(['#iv°7']).shapes).toEqual(['diminished']);
	});

	it('gives an unreadable numeral the shape nothing teaches, rather than throwing', () => {
		const demand = demandOf(['wat']);
		expect(demand.shapes).toEqual(['unknown']);
		expect(isReady(demand, vocabularyOf({ rungs: ALL_RUNGS }))).toBe(false);
	});
});

describe('how far from the key a chord stands', () => {
	it('calls a chord built only from the scale in_key', () => {
		expect(demandOf(['I', 'ii7', 'V7', 'vi']).ground).toBe('in_key');
	});

	it('calls a chord rooted in the key with a note outside it coloured', () => {
		// The blues I7: root at home, seventh borrowed. One foot outside.
		expect(demandOf(['I7']).ground).toBe('coloured');
		// A secondary dominant, and the minor iv borrowed from the parallel minor.
		expect(demandOf(['III7']).ground).toBe('coloured');
		expect(demandOf(['iv']).ground).toBe('coloured');
	});

	it('calls a chord rooted outside the key off_key', () => {
		expect(demandOf(['bII7']).ground).toBe('off_key');
		expect(demandOf(['bIII7']).ground).toBe('off_key');
		expect(demandOf(['#iv°7']).ground).toBe('off_key');
	});

	/*
	 * The raised seventh is part of what "minor key" means to a player. Without it
	 * a minor ii–V would be rated as more distant than a tritone sub, which is the
	 * opposite of true.
	 */
	it('lets a minor key have its dominant V without leaving home', () => {
		expect(demandOf(['i7', 'iiø7', 'V7'], 'minor').ground).toBe('in_key');
		expect(demandOf(['i', 'iv', 'v'], 'minor').ground).toBe('in_key');
	});

	it('takes the furthest chord as the whole grid’s answer', () => {
		expect(
			demandOfGrid(
				[
					['I', 'IV'],
					['I7', 'bII7']
				],
				'major'
			).ground
		).toBe('off_key');
	});
});

describe('what the drill room teaches', () => {
	it('gives the scale rung no shape at all, because it builds no chord', () => {
		expect(shapesForRung('scale')).toEqual([]);
	});

	it('reads each rung off the chords it actually builds', () => {
		expect(shapesForRung('tonic-triad')).toEqual(['major']);
		expect(shapesForRung('all-triads')).toEqual(['diminished', 'major', 'minor']);
		expect(shapesForRung('tonic-seventh')).toEqual(['major seventh']);
		expect(shapesForRung('all-sevenths')).toEqual([
			'dominant seventh',
			'half-diminished',
			'major seventh',
			'minor seventh'
		]);
		expect(shapesForRung('relative-minor')).toEqual(['minor']);
	});

	it('keeps the whole ladder on home ground', () => {
		expect(vocabularyFromRungs(ALL_RUNGS).ground).toBe('in_key');
	});

	/*
	 * The division of labour the two modules turned out to already have: the
	 * ladder teaches shapes and never leaves the key, and the progression library
	 * is the only thing in the app that takes you out of it. Neither had to be
	 * edited for this to be true, which is the argument that it is the real
	 * structure rather than one imposed to make the gate work.
	 */
	it('leaves the key only in the progression library, and only at levels four and five', () => {
		for (const progression of PROGRESSIONS) {
			const demand = demandOfNumerals(progression.numerals, progression.mode);
			if (demand.ground !== 'in_key') expect(progression.level, progression.id).toBeGreaterThan(3);
		}
		expect(vocabularyFromProgressions(['blues-basic']).ground).toBe('coloured');
		expect(vocabularyFromProgressions(['tritone-sub']).ground).toBe('off_key');
		expect(vocabularyFromProgressions(['I-IV-V-I', 'ii-V-I']).ground).toBe('in_key');
	});

	it('adds the two halves together', () => {
		const both = vocabularyOf({ rungs: ['all-triads'], progressions: ['blues-basic'] });
		expect(both.shapes).toContain('minor');
		expect(both.shapes).toContain('dominant seventh');
		expect(both.ground).toBe('coloured');
	});

	it('knows nothing by default, because that is the conservative reading', () => {
		expect(emptyVocabulary()).toEqual({ shapes: [], ground: 'in_key' });
		expect(isReady(chartsBySlug.get('blues-12')!.demand, emptyVocabulary())).toBe(false);
	});
});

describe('the gate, against the material the app actually ships', () => {
	/*
	 * The complaint this whole module answers, written down as a test: somebody on
	 * the second rung of the first key was being sent to a three-tonic cycle.
	 */
	it('does not offer a three-tonic cycle to somebody who has met one chord', () => {
		expect(ready('three-tonic-cycle', knowing('C', 'tonic-triad'))).toBe(false);
		expect(ready('three-tonic-cycle', knowing('C', 'all-sevenths'))).toBe(false);
		expect(ready('bird-blues', knowing('C', 'all-sevenths'))).toBe(false);
		expect(ready('fifths-cycle', knowing('C', 'all-sevenths'))).toBe(false);
	});

	it('opens a tune of plain triads as soon as the triads are met', () => {
		expect(ready('four-chord-loop', knowing('C', 'primary-triads'))).toBe(false);
		expect(ready('four-chord-loop', knowing('C', 'all-triads'))).toBe(true);
		expect(ready('doo-wop', knowing('C', 'all-triads'))).toBe(true);
	});

	it('holds the blues back until the blues has been taught', () => {
		expect(ready('blues-12', knowing('C', 'all-sevenths'))).toBe(false);
		expect(ready('blues-12', knowing('C', 'all-sevenths', ['blues-basic']))).toBe(true);
	});

	it('holds the cycles back until something has taken you out of the key', () => {
		const chromatic = knowing('C', 'all-sevenths', [
			'blues-basic',
			'secondary-dominant',
			'tritone-sub'
		]);
		expect(ready('three-tonic-cycle', chromatic)).toBe(true);
		expect(ready('fifths-cycle', chromatic)).toBe(true);
	});

	it('lets everything in the book be reached eventually', () => {
		const everything = vocabularyOf({
			rungs: ALL_RUNGS,
			progressions: PROGRESSIONS.map((progression) => progression.id)
		});
		const stuck = MISSION_CHARTS.filter((chart) => !isReady(chart.demand, everything));
		expect(stuck.map((chart) => chart.slug)).toEqual([]);
	});

	/*
	 * The ordering is what decides which tune turns up *first* once several are
	 * legal on the same day, so it is worth pinning: nothing that leaves the key
	 * may sort ahead of anything that stays in it.
	 */
	it('puts the plainest tunes first', () => {
		const sorted = [...MISSION_CHARTS].sort((a, b) => reachOf(a.demand) - reachOf(b.demand));
		const grounds = sorted.map((chart) => chart.demand.ground);
		expect(grounds).toEqual([...grounds].sort((a, b) => grounds.indexOf(a) - grounds.indexOf(b)));
		expect(sorted[0].demand.ground).toBe('in_key');
		expect(sorted[sorted.length - 1].demand.ground).toBe('off_key');
	});

	it('derives a chart’s demand from its grid, so an edit changes it', () => {
		expect(chartDemand({ grid: [['I', 'IV', 'V', 'I']], mode: 'major' })).toEqual({
			shapes: ['major'],
			ground: 'in_key'
		});
		expect(chartDemand({ grid: [['I', 'bII7']], mode: 'major' }).ground).toBe('off_key');
	});

	it('carries a demand for every built-in', () => {
		expect(MISSION_CHARTS).toHaveLength(CHARTS.length);
		for (const chart of MISSION_CHARTS)
			expect(chart.demand.shapes.length, chart.slug).toBeGreaterThan(0);
	});
});

describe('saying what is missing', () => {
	it('reports the gap rather than a bare refusal', () => {
		const gap = shortfall(chartsBySlug.get('blues-12')!.demand, knowing('C', 'all-sevenths'));
		expect(gap.shapes).toEqual([]);
		expect(gap.ground).toBe('coloured');
		expect(describeShortfall(gap)).toContain('outside the key');
	});

	it('names the shape when it is a shape that is missing', () => {
		const gap = shortfall(chartsBySlug.get('four-chord-loop')!.demand, knowing('C', 'tonic-triad'));
		expect(gap.shapes).toEqual(['minor']);
		expect(describeShortfall(gap)).toBe('minor');
	});

	it('says nothing at all when there is no gap', () => {
		expect(describeShortfall({ shapes: [], ground: null })).toBe('');
	});

	it('points at a progression that would teach it, gentlest first', () => {
		const gap = shortfall(chartsBySlug.get('blues-12')!.demand, knowing('C', 'all-sevenths'));
		const suggested = taughtBy(gap);
		expect(suggested.length).toBeGreaterThan(0);
		const levels = suggested.map((id) => progressionById(id)!.level);
		expect(levels).toEqual([...levels].sort((a, b) => a - b));
		expect(suggested[0]).toBe('blues-basic');
	});

	it('is answered by every rung of the ladder being listed', () => {
		expect(ALL_RUNGS).toEqual(RUNGS.map((rung) => rung.id));
	});
});

describe('a shape is a shape in all twelve keys', () => {
	it('reads the same demand whatever key the chart is played in', () => {
		// The demand is derived once against C on purpose: neither axis moves with
		// the key, which is the same reason charts are stored as numerals.
		const shapes: Shape[] = chartDemand({ grid: [['ii7', 'V7', 'Imaj7']], mode: 'major' }).shapes;
		expect(shapes).toEqual(['dominant seventh', 'major seventh', 'minor seventh']);
	});

	it('teaches the same shapes on every stage of the ladder', () => {
		for (const rung of RUNGS) {
			for (const stage of STAGES) {
				const shapes = [
					...new Set(
						itemsForRung(rung.id, stage)
							.map((item) => item.chord)
							.filter((chord) => chord !== undefined)
							.map(shapeOf)
					)
				].sort();
				expect(shapes, `${rung.id} in ${stage.key}`).toEqual(shapesForRung(rung.id));
			}
		}
	});
});
