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

describe('how a chord leaves the key', () => {
	it('says a chord built only from the scale leaves it at all', () => {
		expect(demandOf(['I', 'ii7', 'V7', 'vi']).devices).toEqual([]);
	});

	/*
	 * The blues: a dominant on the tonic or the fourth, where the key asks for
	 * neither. In no key is that correct and it works anyway, which is why it is
	 * its own device rather than a secondary dominant that happens to point home.
	 */
	it('calls a dominant on I or IV the blues', () => {
		expect(demandOf(['I7']).devices).toEqual(['blues']);
		expect(demandOf(['IV7']).devices).toEqual(['blues']);
	});

	it('calls a chord from the parallel key borrowed', () => {
		// The minor iv, the flat seven, and the flat-six major seventh: all of them
		// diatonic to C minor, which is a place a tune in C actually goes.
		expect(demandOf(['iv']).devices).toEqual(['borrowed']);
		expect(demandOf(['bVII']).devices).toEqual(['borrowed']);
		expect(demandOf(['bVII7']).devices).toEqual(['borrowed']);
		expect(demandOf(['bVImaj7']).devices).toEqual(['borrowed']);
	});

	it('calls a dominant aimed at a degree of the key a secondary dominant', () => {
		// E7 lands on A, A7 on D, D7 on G — every one of them already in C.
		expect(demandOf(['III7']).devices).toEqual(['secondary']);
		expect(demandOf(['VI7']).devices).toEqual(['secondary']);
		expect(demandOf(['II7']).devices).toEqual(['secondary']);
		expect(demandOf(['V7/vi']).devices).toEqual(['secondary']);
	});

	it('calls a chord belonging to neither key chromatic', () => {
		expect(demandOf(['bII7']).devices).toEqual(['chromatic']);
		expect(demandOf(['bIII7']).devices).toEqual(['chromatic']);
		expect(demandOf(['#iv°7']).devices).toEqual(['chromatic']);
		expect(demandOf(['IIImaj7']).devices).toEqual(['chromatic']);
	});

	/*
	 * The raised seventh is part of what "minor key" means to a player. Without it
	 * a minor ii–V would be rated as more distant than a tritone sub, which is the
	 * opposite of true.
	 */
	it('lets a minor key have its dominant V without leaving home', () => {
		expect(demandOf(['i7', 'iiø7', 'V7'], 'minor').devices).toEqual([]);
		expect(demandOf(['i', 'iv', 'v'], 'minor').devices).toEqual([]);
	});

	it('collects every device a grid uses, in the order a curriculum meets them', () => {
		expect(
			demandOfGrid(
				[
					['I', 'iv'],
					['I7', 'bII7']
				],
				'major'
			).devices
		).toEqual(['borrowed', 'blues', 'chromatic']);
	});

	it('is a set rather than a ladder, so one device never implies another', () => {
		// The whole reason the ordered version was wrong: knowing the blues tells
		// you nothing about borrowed chords, and must not unlock them.
		const bluesOnly = vocabularyOf({ rungs: ALL_RUNGS, progressions: ['blues-basic'] });
		expect(isReady(demandOf(['I7']), bluesOnly)).toBe(true);
		expect(isReady(demandOf(['iv']), bluesOnly)).toBe(false);
		expect(isReady(demandOf(['bII7']), bluesOnly)).toBe(false);
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

	it('never leaves the key anywhere on the ladder', () => {
		expect(vocabularyFromRungs(ALL_RUNGS).devices).toEqual([]);
	});

	/*
	 * The division of labour the two modules turned out to already have: the
	 * ladder teaches shapes and never leaves the key, and the progression library
	 * is the only thing in the app that takes you out of it. Neither had to be
	 * edited for this to be true, which is the argument that it is the real
	 * structure rather than one imposed to make the gate work.
	 */
	it('leaves the key only in the progression library, and only from level four', () => {
		for (const progression of PROGRESSIONS) {
			const demand = demandOfNumerals(progression.numerals, progression.mode);
			if (demand.devices.length) expect(progression.level, progression.id).toBeGreaterThan(3);
		}
		expect(vocabularyFromProgressions(['blues-basic']).devices).toEqual(['blues']);
		expect(vocabularyFromProgressions(['tritone-sub']).devices).toEqual(['chromatic']);
		expect(vocabularyFromProgressions(['I-IV-V-I', 'ii-V-I']).devices).toEqual([]);
	});

	/*
	 * The property that makes the levels worth having: each one from four up is
	 * the first place some device is met, so no single progression can open the
	 * whole back half of the library on its own.
	 */
	it('gives no progression more than its share of the ways out of the key', () => {
		for (const progression of PROGRESSIONS) {
			const demand = demandOfNumerals(progression.numerals, progression.mode);
			expect(demand.devices.length, progression.id).toBeLessThanOrEqual(2);
		}
	});

	it('adds the two halves together', () => {
		const both = vocabularyOf({ rungs: ['all-triads'], progressions: ['blues-basic'] });
		expect(both.shapes).toContain('minor');
		expect(both.shapes).toContain('dominant seventh');
		expect(both.devices).toEqual(['blues']);
	});

	it('knows nothing by default, because that is the conservative reading', () => {
		expect(emptyVocabulary()).toEqual({ shapes: [], devices: [] });
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

	it('holds the cycles back until every device in them has been met', () => {
		const some = knowing('C', 'all-sevenths', ['blues-basic', 'secondary-dominant']);
		expect(ready('three-tonic-cycle', some)).toBe(false);

		const all = knowing(
			'C',
			'all-sevenths',
			PROGRESSIONS.map((p) => p.id)
		);
		expect(ready('three-tonic-cycle', all)).toBe(true);
		expect(ready('fifths-cycle', all)).toBe(true);
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
		expect(sorted[0].demand.devices).toEqual([]);
		expect(sorted[sorted.length - 1].demand.devices).toContain('chromatic');
		// Nothing that leaves the key may sort ahead of anything that stays in it.
		const lastPlain = sorted.map((c) => c.demand.devices.length === 0).lastIndexOf(true);
		const firstAway = sorted.findIndex((c) => c.demand.devices.length > 0);
		expect(lastPlain).toBeLessThan(firstAway);
	});

	it('derives a chart’s demand from its grid, so an edit changes it', () => {
		expect(chartDemand({ grid: [['I', 'IV', 'V', 'I']], mode: 'major' })).toEqual({
			shapes: ['major'],
			devices: []
		});
		expect(chartDemand({ grid: [['I', 'bII7']], mode: 'major' }).devices).toEqual(['chromatic']);
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
		expect(gap.devices).toEqual(['blues']);
		expect(describeShortfall(gap)).toContain('dominant sevenths');
	});

	it('names the shape when it is a shape that is missing', () => {
		const gap = shortfall(chartsBySlug.get('four-chord-loop')!.demand, knowing('C', 'tonic-triad'));
		expect(gap.shapes).toEqual(['minor']);
		expect(gap.devices).toEqual([]);
		expect(describeShortfall(gap)).toBe('minor');
	});

	it('says nothing at all when there is no gap', () => {
		expect(describeShortfall({ shapes: [], devices: [] })).toBe('');
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
