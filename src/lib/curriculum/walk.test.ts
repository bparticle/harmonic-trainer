import { describe, expect, it } from 'vitest';
import { MISSION_CHARTS } from './charts';
import { PROGRESSIONS, type ProgressionLevel } from './progressions';
import { RUNGS, type RungId } from './ladder';
import { demandOfNumerals, isReady, vocabularyOf } from './vocabulary';

/**
 * The shape of the curriculum, walked end to end.
 *
 * Every other test in this directory checks that the gate is *consistent*. This
 * one checks that it is a **curriculum** — that the songbook opens up in steps a
 * person could climb rather than in two jumps with a long flat stretch between
 * them.
 *
 * It is here because the flat stretch was real and invisible. Counting what was
 * open at each step of the ladder and then each level of the library gave, at
 * the time it was first run:
 *
 *     1 → 3 → 5 → 5 → 5 → 5 → 5 → 16 → 16 → 23
 *
 * Five tunes for the whole of the ladder plus seven progressions, then eleven at
 * once, then seven at once. Two progressions carried eighteen of the
 * twenty-three tunes. Nothing was broken; the curriculum was simply lumpy, and
 * nothing measured it, so nobody knew.
 *
 * Two things were changed in response and both are pinned below: the ways out of
 * a key became a set of four named devices rather than a three-step ladder, and
 * the songbook gained tunes in the bands that had none.
 *
 * **This test is meant to be read when it fails.** A failure is not necessarily
 * a bug — it means the material moved and the shape of the climb moved with it.
 * Print the walk, look at where the jump is, and decide whether the library
 * needs re-levelling or the songbook needs a tune in that band.
 */

type Step = { label: string; rungs: RungId[]; progressions: string[] };

/** Every step of the climb, in the order somebody would actually take it. */
function climb(): Step[] {
	const rungs = RUNGS.map((rung) => rung.id);
	const steps: Step[] = rungs.map((_, i) => ({
		label: `rung ${rungs[i]}`,
		rungs: rungs.slice(0, i + 1),
		progressions: []
	}));

	const met: string[] = [];
	for (const progression of [...PROGRESSIONS].sort((a, b) => a.level - b.level)) {
		met.push(progression.id);
		steps.push({
			label: `L${progression.level} ${progression.id}`,
			rungs,
			progressions: [...met]
		});
	}
	return steps;
}

/** How many tunes are open at each step, and which arrived there. */
function openings() {
	let previous = new Set<string>();
	return climb().map((step) => {
		const known = vocabularyOf({ rungs: step.rungs, progressions: step.progressions });
		const open = new Set(
			MISSION_CHARTS.filter((chart) => isReady(chart.demand, known)).map((c) => c.slug)
		);
		const fresh = [...open].filter((slug) => !previous.has(slug));
		previous = open;
		return { ...step, count: open.size, fresh };
	});
}

describe('the climb through the songbook', () => {
	const walk = openings();

	it('never takes anything away', () => {
		for (let i = 1; i < walk.length; i++) {
			expect(walk[i].count, walk[i].label).toBeGreaterThanOrEqual(walk[i - 1].count);
		}
	});

	it('opens nothing at all on the very first rung', () => {
		// Seven notes and no chord shape. There is no honest play-along here, and
		// the workout says so rather than inventing one.
		expect(walk[0].count).toBe(0);
	});

	it('has something playable by the second rung of the first key', () => {
		// The home chord, and a tune of nothing but major triads to use it on.
		expect(walk[1].count).toBeGreaterThan(0);
	});

	it('ends with the whole songbook open', () => {
		expect(walk[walk.length - 1].count).toBe(MISSION_CHARTS.length);
	});

	/*
	 * The one that caught the cliff. A quarter of the songbook arriving on one
	 * step is not a step, it is a gate opening — and whichever progression happens
	 * to sit behind it becomes the only one that matters.
	 */
	it('never opens more than a quarter of the songbook in a single step', () => {
		const cap = Math.ceil(MISSION_CHARTS.length / 4);
		for (const step of walk) {
			expect(
				step.fresh.length,
				`${step.label} opened ${step.fresh.join(', ')}`
			).toBeLessThanOrEqual(cap);
		}
	});

	it('gives every way out of the key at least one tune of its own', () => {
		const byLevel = new Map<ProgressionLevel, number>();
		for (const step of walk) {
			const match = /^L(\d)/.exec(step.label);
			if (!match) continue;
			const level = Number(match[1]) as ProgressionLevel;
			byLevel.set(level, (byLevel.get(level) ?? 0) + step.fresh.length);
		}
		for (const level of [4, 5, 6, 7] as ProgressionLevel[]) {
			expect(byLevel.get(level) ?? 0, `level ${level} opens nothing`).toBeGreaterThan(0);
		}
	});

	/*
	 * Levels one to three teach movement inside a key, and the ladder has already
	 * taught every chord in them — so they are *expected* to open nothing, and
	 * saying so here stops the next person reading the walk as a bug. What must
	 * stay true is that by the time they are reached there is plenty to play.
	 */
	it('leaves the in-key levels teaching movement rather than vocabulary', () => {
		for (const step of walk) {
			const match = /^L([123]) /.exec(step.label);
			if (!match) continue;
			expect(step.fresh, step.label).toEqual([]);
		}
		const beforeLevelFour = walk.find((step) => /^L3 /.test(step.label))!;
		expect(beforeLevelFour.count).toBeGreaterThanOrEqual(10);
	});

	it('agrees with the library about which level teaches which device', () => {
		for (const progression of PROGRESSIONS) {
			const demand = demandOfNumerals(progression.numerals, progression.mode);
			if (progression.level <= 3) expect(demand.devices, progression.id).toEqual([]);
			else expect(demand.devices.length, progression.id).toBe(1);
		}
	});
});
