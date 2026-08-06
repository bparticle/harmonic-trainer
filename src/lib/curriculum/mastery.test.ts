import { describe, expect, it } from 'vitest';
import { MASTERY, SKILLS, skillByCode } from './skills';
import { availableSkills, coldKeys, evaluate, nextSkill, type SkillStats } from './mastery';

/** Build a stats map where the listed skills are fully mastered. */
function mastered(...codes: string[]): Map<string, SkillStats> {
	const map = new Map<string, SkillStats>();
	for (const skillCode of codes) {
		map.set(skillCode, { skillCode, reviews: 20, correct: 19, transfers: 2 });
	}
	return map;
}

describe('mastery', () => {
	it('needs enough reviews before accuracy means anything', () => {
		const stats = new Map([['L0', { skillCode: 'L0', reviews: 5, correct: 5, transfers: 1 }]]);
		const verdict = evaluate(stats).get('L0')!;
		expect(verdict.mastered).toBe(false);
		expect(verdict.accuracy).toBe(1);
		expect(verdict.shortfall).toContain('more reviews');
	});

	it('needs accuracy above the bar', () => {
		const stats = new Map([['L0', { skillCode: 'L0', reviews: 20, correct: 14, transfers: 1 }]]);
		const verdict = evaluate(stats).get('L0')!;
		expect(verdict.mastered).toBe(false);
		expect(verdict.shortfall).toContain('accuracy');
	});

	it('needs the thing to turn up in free playing', () => {
		// The brief's real success metric, so it is a gate and not a footnote.
		expect(MASTERY.requiresTransfer).toBe(true);
		const stats = new Map([['L0', { skillCode: 'L0', reviews: 20, correct: 19, transfers: 0 }]]);
		const verdict = evaluate(stats).get('L0')!;
		expect(verdict.mastered).toBe(false);
		expect(verdict.shortfall).toContain('free playing');
	});

	it('passes when all three are met', () => {
		expect(evaluate(mastered('L0')).get('L0')!.mastered).toBe(true);
	});
});

describe('unlocking', () => {
	it('opens only the inventory at the start', () => {
		const verdicts = evaluate(new Map());
		expect(availableSkills(verdicts).map((s) => s.code)).toEqual(['L0']);
		expect(nextSkill(verdicts)!.code).toBe('L0');
	});

	it('opens the next skill once its prerequisite is mastered', () => {
		const verdicts = evaluate(mastered('L0'));
		expect(verdicts.get('L1')!.unlocked).toBe(true);
		expect(verdicts.get('L2')!.unlocked).toBe(false);
		expect(verdicts.get('L2')!.blockedBy).toEqual(['L1']);
	});

	it('keeps a skill shut until every prerequisite is mastered, not just one', () => {
		const verdicts = evaluate(mastered('L0', 'L1', 'L1b', 'L2', 'L3', 'L4', 'L6'));
		// L8 needs both L6 and L7; only L6 is done.
		expect(verdicts.get('L8')!.unlocked).toBe(false);
		expect(verdicts.get('L8')!.blockedBy).toEqual(['L7']);
	});

	it('opens the blues as soon as there is a key to play it in', () => {
		const verdicts = evaluate(mastered('L0', 'L1'));
		expect(verdicts.get('A0')!.unlocked).toBe(true);
	});

	it('walks the whole graph when everything is mastered', () => {
		const verdicts = evaluate(mastered(...SKILLS.map((s) => s.code)));
		expect([...verdicts.values()].every((v) => v.unlocked && v.mastered)).toBe(true);
		expect(availableSkills(verdicts)).toEqual([]);
		expect(nextSkill(verdicts)).toBeNull();
	});

	it('teaches in curriculum order rather than skipping ahead', () => {
		const verdicts = evaluate(mastered('L0', 'L1', 'L1b', 'L2', 'L3'));
		const next = nextSkill(verdicts)!;
		expect(next.level).toBeLessThanOrEqual(
			Math.min(...availableSkills(verdicts).map((s) => s.level))
		);
	});

	it('gives every unmastered skill a reason', () => {
		const verdicts = evaluate(new Map());
		for (const verdict of verdicts.values()) {
			if (!verdict.mastered) expect(verdict.shortfall, verdict.skill.code).toBeTruthy();
		}
	});

	it('survives circular prerequisites without hanging', () => {
		const cyclic = [
			{ ...skillByCode('L0')!, code: 'X', prereqs: ['Y'] },
			{ ...skillByCode('L0')!, code: 'Y', prereqs: ['X'] }
		];
		const verdicts = evaluate(new Map(), cyclic);
		expect(verdicts.get('X')!.unlocked).toBe(false);
		expect(verdicts.get('Y')!.shortfall).toContain('circular');
	});
});

describe('cold keys', () => {
	it('finds the least practised', () => {
		const reviews = new Map([
			['C', 90],
			['F', 60],
			['G', 55],
			['Gb', 2],
			['B', 0]
		]);
		expect(coldKeys(reviews, ['C', 'F', 'G', 'Gb', 'B'], 2)).toEqual(['B', 'Gb']);
	});

	it('treats a key with no history at all as coldest', () => {
		const reviews = new Map([['C', 10]]);
		expect(coldKeys(reviews, ['C', 'Ab'], 1)).toEqual(['Ab']);
	});
});
