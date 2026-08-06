import { describe, expect, it } from 'vitest';
import { MASTERY, SKILLS, dependents, skillByCode, topologicalOrder } from './skills';
import { ALL_DIRECTIONS, CIRCLE_KEYS, cardsForCurriculum, cardsForSkill, itemsFor } from './cards';
import { key as makeKey, parseKey } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

describe('the skill graph', () => {
	it('has unique codes', () => {
		const codes = SKILLS.map((s) => s.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	it('references only skills that exist', () => {
		for (const skill of SKILLS) {
			for (const prereq of skill.prereqs) {
				expect(skillByCode(prereq), `${skill.code} needs ${prereq}`).toBeDefined();
			}
		}
	});

	it('is acyclic', () => {
		expect(() => topologicalOrder()).not.toThrow();
		expect(topologicalOrder()).toHaveLength(SKILLS.length);
	});

	it('orders every prerequisite before what needs it', () => {
		const order = topologicalOrder().map((s) => s.code);
		for (const skill of SKILLS) {
			for (const prereq of skill.prereqs) {
				expect(order.indexOf(prereq), `${prereq} before ${skill.code}`).toBeLessThan(
					order.indexOf(skill.code)
				);
			}
		}
	});

	it('detects a cycle rather than looping forever', () => {
		const cyclic = [
			{ ...SKILLS[0], code: 'X', prereqs: ['Y'] },
			{ ...SKILLS[0], code: 'Y', prereqs: ['X'] }
		];
		expect(() => topologicalOrder(cyclic)).toThrow(/cycle/i);
	});

	it('starts from the inventory, which needs nothing', () => {
		const start = SKILLS.filter((s) => s.prereqs.length === 0);
		expect(start.map((s) => s.code)).toEqual(['L0']);
	});

	it('covers every level the brief lists', () => {
		for (const code of ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11']) {
			expect(skillByCode(code), code).toBeDefined();
		}
	});

	it('runs an application track in parallel from level one', () => {
		const applied = SKILLS.filter((s) => s.category === 'application');
		expect(applied.map((s) => s.code)).toEqual(['A0', 'A1', 'A2', 'A3']);
		// The blues starts as soon as there is a key to play it in.
		expect(skillByCode('A0')!.prereqs).toEqual(['L1']);
		expect(Math.min(...applied.map((s) => s.level))).toBe(1);
	});

	it('describes every skill as a change from something already owned', () => {
		for (const skill of SKILLS) {
			expect(skill.description.length, skill.code).toBeGreaterThan(60);
		}
	});

	it('knows what unlocks when a skill is mastered', () => {
		expect(dependents('L4').map((s) => s.code).sort()).toEqual(['L4b', 'L5', 'L7']);
		// The minor blues waits on the minor ii-V, not the major one.
		expect(dependents('L4b').map((s) => s.code)).toEqual(['A1']);
		expect(dependents('L11')).toEqual([]);
	});

	it('gates on transfer, not just accuracy', () => {
		expect(MASTERY.accuracy).toBe(0.85);
		expect(MASTERY.minimumReviews).toBeGreaterThanOrEqual(12);
		expect(MASTERY.requiresTransfer).toBe(true);
	});
});

describe('card generation', () => {
	it('generates cards for every drillable skill', () => {
		for (const skill of SKILLS) {
			const cards = cardsForSkill(skill);
			const drillable = skill.generator.kind !== 'inventory' && skill.generator.kind !== 'none';
			expect(cards.length > 0, `${skill.code} (${skill.generator.kind})`).toBe(drillable);
		}
	});

	it('covers all twelve keys', () => {
		const cards = cardsForSkill(skillByCode('L1')!);
		expect(new Set(cards.map((c) => c.keyCenter)).size).toBe(12);
	});

	it('walks the keys round the circle of fifths, not chromatically', () => {
		expect(CIRCLE_KEYS).toEqual([0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
	});

	it('makes a separate card per direction', () => {
		const cards = cardsForSkill(skillByCode('L1')!);
		const directions = new Set(cards.map((c) => c.direction));
		expect([...directions].sort()).toEqual([...ALL_DIRECTIONS].sort());
	});

	it('gives every card a stable identity', () => {
		const first = cardsForCurriculum(SKILLS).map((c) => c.identity);
		const second = cardsForCurriculum(SKILLS).map((c) => c.identity);
		expect(first).toEqual(second);
		expect(new Set(first).size, 'identities must be unique').toBe(first.length);
	});

	it('never asks a direction the item cannot answer', () => {
		// A scale has no single chord shape to read off the wheel and name.
		const modes = cardsForSkill(skillByCode('L6')!);
		expect(modes.some((c) => c.direction === 'hear_name')).toBe(false);

		const inversions = cardsForSkill(skillByCode('L2')!);
		expect(inversions.some((c) => c.direction === 'play_name')).toBe(false);
	});

	it('gives every card an answer', () => {
		for (const card of cardsForCurriculum(SKILLS)) {
			expect(card.payload.answerPitchClasses.length, card.identity).toBeGreaterThan(0);
			expect(card.payload.label.length, card.identity).toBeGreaterThan(0);
		}
	});

	it('keeps every answer pitch class in range', () => {
		for (const card of cardsForCurriculum(SKILLS)) {
			for (const pc of card.payload.answerPitchClasses) {
				expect(pc, card.identity).toBeGreaterThanOrEqual(0);
				expect(pc, card.identity).toBeLessThan(12);
			}
		}
	});

	it('keeps every voicing on a real keyboard', () => {
		for (const card of cardsForCurriculum(SKILLS)) {
			for (const note of card.payload.answerVoicing ?? []) {
				expect(note, `${card.identity} → ${note}`).toBeGreaterThanOrEqual(21);
				expect(note, `${card.identity} → ${note}`).toBeLessThanOrEqual(108);
			}
		}
	});

	it('matches every voicing to the pitch classes it claims', () => {
		for (const card of cardsForCurriculum(SKILLS)) {
			if (!card.payload.answerVoicing) continue;
			if (card.payload.kind === 'rootless' || card.payload.kind === 'shell') continue;
			if (card.payload.kind === 'modulation' || card.payload.kind === 'upper-structure') continue;
			const claimed = new Set(card.payload.answerPitchClasses);
			for (const note of card.payload.answerVoicing) {
				expect(claimed.has(((note % 12) + 12) % 12), card.identity).toBe(true);
			}
		}
	});
});

describe('transposition is a parameter, never hardcoded', () => {
	it('produces the same item shapes in every key', () => {
		const skill = skillByCode('L1')!;
		const shapes = CIRCLE_KEYS.map((pc) => {
			const k = makeKey(['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][pc]);
			return itemsFor(skill.generator, k).map((i) => i.answerPitchClasses.length).join(',');
		});
		expect(new Set(shapes).size).toBe(1);
	});

	it('names the ii-V-I correctly in a sample of keys', () => {
		const skill = skillByCode('L4')!;
		for (const [name, expected] of [
			['C', 'Dm7 – G7 – Cmaj7'],
			['Eb', 'Fm7 – Bb7 – Ebmaj7'],
			['B', 'C#m7 – F#7 – Bmaj7']
		] as const) {
			const [item] = itemsFor(skill.generator, parseKey(name));
			expect(item.label, name).toBe(expected);
		}
	});

	it('borrows from the parallel minor, spelled for the key', () => {
		const skill = skillByCode('L8')!;
		const items = itemsFor(skill.generator, parseKey('C'));
		const labels = items.map((i) => i.label);
		expect(labels).toContain('Fm7');
		expect(labels).toContain('Abmaj7');
		expect(labels).toContain('Bb7');
	});

	it('builds secondary dominants a fifth above their target', () => {
		const skill = skillByCode('L7')!;
		const items = itemsFor(skill.generator, parseKey('C'));
		const toVi = items.find((i) => i.degree === 'V7/vi');
		expect(toVi?.label).toBe('E7 → Am7');

		const sub = items.find((i) => i.degree === 'subV7/vi');
		expect(sub?.label).toBe('Bb7 → Am7');
	});

	it('puts a diminished-seventh spoke of modulations at every distance', () => {
		const skill = skillByCode('L9')!;
		const items = itemsFor(skill.generator, parseKey('C'));
		const labels = items.map((i) => i.label);
		expect(labels).toContain('C → G');
		expect(labels).toContain('C → F');
		expect(labels).toContain('C → D');
	});
});

describe('scale of the whole curriculum', () => {
	it('produces a serious but not absurd number of cards', () => {
		const cards = cardsForCurriculum(SKILLS);
		expect(cards.length).toBeGreaterThan(1000);
		expect(cards.length).toBeLessThan(20000);
	});

	it('spreads across every key', () => {
		const cards = cardsForCurriculum(SKILLS);
		const byKey = new Map<string, number>();
		for (const card of cards) byKey.set(card.keyCenter, (byKey.get(card.keyCenter) ?? 0) + 1);
		expect(byKey.size).toBeGreaterThanOrEqual(12);
	});
});
