import { describe, expect, it } from 'vitest';
import {
	addKey,
	answeredByNote,
	answeredOnRim,
	availableLenses,
	buildSet,
	chooseLens,
	eligible,
	freshProgress,
	inPlay,
	KEYS,
	MAX_STRENGTH,
	meet,
	nextKey,
	openAll,
	parseProgress,
	readyForNext,
	requeue,
	scored,
	serializeProgress,
	SET_SIZE,
	SOLID,
	stationFill,
	strengthAfter,
	type Lens,
	type Progress,
	type Turn
} from './fifths';

/** Every key in play and shown, at the given strengths (or one for all). */
function progressWith(strengths: Record<string, number> | [number, number]): Progress {
	const strength = Array.isArray(strengths)
		? Object.fromEntries(KEYS.slice(0, strengths[0]).map((key) => [key.name, strengths[1]]))
		: strengths;
	return { strength, waiting: [], bestStreak: 0 };
}

const byName = (name: string) => KEYS.find((key) => key.name === name)!;
const seeded = (seed: number) => () => {
	seed = (seed * 16807) % 2147483647;
	return (seed - 1) / 2147483646;
};

describe('Fifths keys', () => {
	it('come in outward from C, alternating sides, and spell shared stations both ways', () => {
		expect(KEYS.map((key) => key.signature)).toEqual([
			0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7
		]);
		expect(new Set(KEYS.map((key) => key.position)).size).toBe(12);
		for (const [position, names] of [
			[5, ['B', 'C♭']],
			[6, ['F♯', 'G♭']],
			[7, ['D♭', 'C♯']]
		] as const) {
			expect(KEYS.filter((key) => key.position === position).map((key) => key.name)).toEqual(names);
		}
	});
});

describe('Fifths progress', () => {
	it('starts with C, G and F waiting to be shown, and opens nothing until they are met', () => {
		const fresh = freshProgress();
		expect(inPlay(fresh).map((key) => key.name)).toEqual(['C', 'G', 'F']);
		expect(fresh.waiting).toEqual(['C', 'G', 'F']);
		expect(readyForNext(fresh)).toBe(false);
		expect(eligible(fresh, 'find')).toEqual([]);

		const met = ['C', 'G', 'F'].reduce((progress, name) => meet(progress, byName(name)), fresh);
		expect(met.waiting).toEqual([]);
		expect(eligible(met, 'find')).toHaveLength(3);
		expect(Object.values(met.strength)).toEqual([1, 1, 1]);
	});

	it('brings in the next key only when every key in play is solid', () => {
		const almost = progressWith({ C: SOLID, G: SOLID, F: SOLID - 1 });
		expect(readyForNext(almost)).toBe(false);
		const solid = scored(almost, byName('F'), { hit: true, quick: false });
		expect(readyForNext(solid)).toBe(true);
		expect(nextKey(solid)?.name).toBe('D');

		const added = addKey(solid, byName('D'));
		expect(added.waiting).toEqual(['D']);
		expect(readyForNext(added)).toBe(false);
		expect(addKey(added, byName('D'))).toBe(added);
	});

	it('counts any right answer below solid, only quick ones above it, and takes one for a miss', () => {
		expect(strengthAfter(1, { hit: true, quick: false })).toBe(2);
		expect(strengthAfter(SOLID, { hit: true, quick: false })).toBe(SOLID);
		expect(strengthAfter(SOLID, { hit: true, quick: true })).toBe(SOLID + 1);
		expect(strengthAfter(MAX_STRENGTH, { hit: true, quick: true })).toBe(MAX_STRENGTH);
		expect(strengthAfter(SOLID, { hit: false, quick: false })).toBe(SOLID - 1);
		expect(strengthAfter(0, { hit: false, quick: false })).toBe(0);
	});

	it('opens every key at one without lowering any', () => {
		const opened = openAll(progressWith({ C: 4, G: 2 }));
		expect(inPlay(opened)).toHaveLength(KEYS.length);
		expect(opened.strength).toMatchObject({ C: 4, G: 2, F: 1, 'C♭': 1 });
		expect(opened.waiting).toEqual([]);
	});

	it('fills a shared station by both of its keys', () => {
		const progress = progressWith({ B: MAX_STRENGTH, C: 3 });
		expect(stationFill(progress, 5)).toBe(0.5);
		expect(stationFill(progress, 0)).toBe(3 / MAX_STRENGTH);
		expect(stationFill(progress, 9)).toBe(0);
	});

	it('reads its own save back, and turns a finished first-version wave into solid keys', () => {
		const progress = { ...progressWith({ C: 5, G: 2, 'B♭': 0 }), waiting: ['B♭'], bestStreak: 9 };
		expect(parseProgress(JSON.parse(JSON.stringify(serializeProgress(progress))))).toEqual(
			progress
		);

		const legacy = parseProgress({ unlocked: 2, bestMixed: 0 });
		expect(inPlay(legacy).map((key) => key.name)).toEqual(['C', 'G', 'F', 'D', 'B♭', 'A', 'E♭']);
		expect(Object.values(legacy.strength).every((value) => value === SOLID)).toBe(true);
		expect(inPlay(parseProgress({ unlocked: 4 }))).toHaveLength(KEYS.length);

		for (const junk of [null, 'nope', { unlocked: 9 }, { version: 2, strength: { C: 99 } }]) {
			expect(parseProgress(junk)).toEqual(freshProgress());
		}
		const cleaned = parseProgress({ version: 2, strength: { C: 2, X: 3, G: -1 }, waiting: ['X'] });
		expect(cleaned).toEqual({ strength: { C: 2 }, waiting: [], bestStreak: 0 });
	});
});

describe('Fifths sets', () => {
	it('opens each kind of question as the keys earn it', () => {
		expect(availableLenses(progressWith([3, 0]))).toEqual(['find']);
		expect(availableLenses(progressWith([3, 1]))).toEqual(['find', 'signature']);
		expect(availableLenses(progressWith([3, 2]))).toEqual([
			'find',
			'signature',
			'name',
			'find-signature'
		]);
		// Every step from C, G and F starts at C: not a set worth asking.
		expect(availableLenses(progressWith([3, 3]))).not.toContain('step');
		expect(availableLenses(progressWith([5, 3]))).toContain('step');
		expect(availableLenses(progressWith({ C: 3, G: 3, F: 3, D: 1 }))).not.toContain('step');
	});

	it('keeps to new kinds within a round and never asks the same kind twice running', () => {
		const progress = progressWith([7, 3]);
		for (let seed = 1; seed < 40; seed++) {
			const random = seeded(seed);
			const used: Lens[] = [];
			for (let i = 0; i < 3; i++) used.push(chooseLens(progress, used, random));
			expect(new Set(used).size).toBe(3);
		}
		const two = progressWith([3, 1]);
		expect(chooseLens(two, ['find', 'signature'], () => 0)).toBe('find');
		expect(chooseLens(two, ['signature', 'find'], () => 0)).toBe('signature');
		expect(chooseLens(progressWith([3, 0]), ['find'], () => 0)).toBe('find');
	});

	it('asks four of a kind from keys in play, never the same key twice running', () => {
		const progress = progressWith([7, 3]);
		for (const lens of ['find', 'signature', 'name', 'find-signature', 'step'] as const) {
			for (let seed = 1; seed < 30; seed++) {
				const set = buildSet(progress, lens, seeded(seed), byName('C'));
				expect(set).toHaveLength(SET_SIZE);
				expect(set[0].target.name).not.toBe('C');
				for (const [i, question] of set.entries()) {
					expect(question.lens).toBe(lens);
					expect(inPlay(progress)).toContain(question.target);
					if (i > 0) expect(question.target).not.toBe(set[i - 1].target);
				}
			}
		}
	});

	it('always asks a key that has just been shown, without asking it twice running', () => {
		const progress = progressWith({ C: 5, G: 5, F: 5, D: 5, 'B♭': 1 });
		const fresh = byName('B♭');
		for (let seed = 1; seed < 80; seed++) {
			const set = buildSet(progress, 'find', seeded(seed), undefined, [fresh]);
			expect(set.map((q) => q.target)).toContain(fresh);
			for (let i = 1; i < set.length; i++) expect(set[i].target).not.toBe(set[i - 1].target);
		}
		// Never first, straight after its own introduction: that answer is still under the finger.
		const after = progressWith({ C: 4, G: 4, F: 4, D: 4, 'B♭': 4, 'D♭': 1 });
		const shown = byName('D♭');
		for (let seed = 1; seed < 400; seed++) {
			const set = buildSet(after, 'find', seeded(seed), shown, [shown]);
			expect(set[0].target).not.toBe(shown);
			expect(set.map((q) => q.target)).toContain(shown);
		}

		const first = ['C', 'G', 'F'].map(byName);
		for (let seed = 1; seed < 80; seed++) {
			const opening = buildSet(progressWith([3, 1]), 'find', seeded(seed), undefined, first);
			expect(new Set(opening.map((q) => q.target))).toEqual(new Set(first));
		}
	});

	it('asks weak keys far more often than strong ones', () => {
		const progress = progressWith({ C: 5, G: 5, F: 5, D: 1 });
		const random = seeded(7);
		let weak = 0;
		for (let i = 0; i < 200; i++) {
			weak += buildSet(progress, 'find', random).filter((q) => q.target.name === 'D').length;
		}
		// No key twice running caps D at two of four; it should be close to that.
		expect(weak / 200).toBeGreaterThan(1.6);
	});

	it('offers four different answers, one side only at a shared station', () => {
		const progress = openAll(progressWith([15, 3]));
		for (let seed = 1; seed < 60; seed++) {
			for (const lens of ['name', 'signature'] as const) {
				for (const question of buildSet(progress, lens, seeded(seed))) {
					if (!('choices' in question)) throw new Error('expected choices');
					expect(new Set(question.choices).size).toBe(4);
					expect(question.choices).toContain(question.target);
					if (lens === 'name') {
						const positions = question.choices.map((key) => key.position);
						expect(new Set(positions).size).toBe(4);
						if (['B', 'C♭', 'F♯', 'G♭', 'D♭', 'C♯'].includes(question.target.name)) {
							for (const choice of question.choices) {
								expect(Math.sign(choice.signature)).toBe(Math.sign(question.target.signature));
							}
						}
					} else {
						const twin = KEYS.find((key) => key.signature === -question.target.signature);
						if (twin && twin !== question.target) expect(question.choices).toContain(twin);
					}
				}
			}
		}
	});

	it('steps by one signature, which is one station, in the direction it says', () => {
		const progress = openAll(progressWith([15, 3]));
		for (let seed = 1; seed < 40; seed++) {
			for (const question of buildSet(progress, 'step', seeded(seed))) {
				if (question.lens !== 'step') throw new Error('expected a step');
				expect(question.target.signature).toBe(question.from.signature + question.direction);
				expect(question.target.position).toBe(
					(question.from.position + question.direction + 12) % 12
				);
				expect(progress.strength[question.from.name]).toBeDefined();
			}
		}
	});

	it('answers where-questions on the rim, and lets a played note answer only what the prompt does not name', () => {
		const target = byName('E♭');
		expect(answeredOnRim({ lens: 'find', target })).toBe(true);
		expect(answeredOnRim({ lens: 'signature', target, choices: [target] })).toBe(false);
		expect(answeredByNote({ lens: 'find', target })).toBe(false);
		expect(answeredByNote({ lens: 'signature', target, choices: [target] })).toBe(false);
		expect(answeredByNote({ lens: 'find-signature', target })).toBe(true);
		expect(answeredByNote({ lens: 'name', target, choices: [target] })).toBe(true);
	});
});

describe('Fifths requeue', () => {
	const turns = (progress: Progress, lens: Lens): Turn[] =>
		buildSet(progress, lens, seeded(3)).map((question) => ({ question, attempt: 0 }));

	it('brings a miss back two questions later, once, with its choices reshuffled', () => {
		const queue = turns(progressWith([7, 3]), 'signature');
		const next = requeue(queue, false, () => 0);
		expect(next.slice(0, 2)).toEqual(queue.slice(1, 3));
		expect(next[2]).toMatchObject({ attempt: 1, question: { target: queue[0].question.target } });
		expect(next[2].question).not.toEqual(queue[0].question);
		expect(next.slice(3)).toEqual(queue.slice(3));

		const last: Turn[] = [{ question: queue[0].question, attempt: 1 }];
		expect(requeue(last, false)).toEqual([]);
		expect(requeue(queue, true)).toEqual(queue.slice(1));
	});

	it('keeps an introduction until it is tapped', () => {
		const intro: Turn[] = [{ question: { lens: 'intro', target: byName('D') }, attempt: 0 }];
		expect(requeue(intro, false)).toBe(intro);
		expect(requeue(intro, true)).toEqual([]);
	});
});
