import { MASTERY, SKILLS, type SkillSeed } from './skills';

/**
 * Which skills are open, and why.
 *
 * A skill unlocks when every prerequisite is mastered, and mastery needs three
 * things: enough reviews to mean anything, accuracy above the bar, and at least
 * one unprompted appearance in free play.
 *
 * That third condition is the one that matters. A thing is not learned because
 * it was answered correctly twelve times in a drill; it is learned when it
 * turns up in playing nobody asked for. The brief calls that the app's real
 * scoreboard, so it belongs in the gate rather than in a report nobody reads.
 */

export type SkillStats = {
	skillCode: string;
	reviews: number;
	correct: number;
	/** Unprompted appearances in free-play takes. */
	transfers: number;
};

export type MasteryVerdict = {
	skill: SkillSeed;
	mastered: boolean;
	unlocked: boolean;
	accuracy: number;
	reviews: number;
	transfers: number;
	/** Prerequisites still in the way. */
	blockedBy: string[];
	/** What is missing, in words worth showing. */
	shortfall: string | null;
};

const emptyStats = (skillCode: string): SkillStats => ({
	skillCode,
	reviews: 0,
	correct: 0,
	transfers: 0
});

function describeShortfall(stats: SkillStats, accuracy: number): string | null {
	const missing: string[] = [];
	if (stats.reviews < MASTERY.minimumReviews) {
		missing.push(`${MASTERY.minimumReviews - stats.reviews} more reviews`);
	} else if (accuracy < MASTERY.accuracy) {
		missing.push(`accuracy at ${Math.round(accuracy * 100)}%, needs ${MASTERY.accuracy * 100}%`);
	}
	if (MASTERY.requiresTransfer && stats.transfers === 0) {
		missing.push('has not turned up in free playing yet');
	}
	return missing.length ? missing.join('; ') : null;
}

/**
 * Evaluate the whole graph.
 *
 * Walked in dependency order so a skill's unlock state can be read off its
 * prerequisites, which have already been decided by the time it is reached.
 */
export function evaluate(
	stats: Map<string, SkillStats>,
	skills: SkillSeed[] = SKILLS
): Map<string, MasteryVerdict> {
	const verdicts = new Map<string, MasteryVerdict>();
	const byCode = new Map(skills.map((s) => [s.code, s]));
	/** Skills caught in a prerequisite loop; none of them can ever open. */
	const cyclic = new Set<string>();

	const decide = (skill: SkillSeed, trail: Set<string>): MasteryVerdict => {
		const existing = verdicts.get(skill.code);
		if (existing) return existing;

		/*
		 * A cycle should already have been caught by topologicalOrder at seed
		 * time; this only stops an infinite loop if bad data gets this far.
		 *
		 * Everything currently on the trail is part of the loop, so all of them
		 * are marked — returning a verdict for just this one would be discarded
		 * the moment the outer call finished computing its own.
		 */
		if (trail.has(skill.code)) {
			for (const code of trail) cyclic.add(code);
			cyclic.add(skill.code);
			return {
				skill,
				mastered: false,
				unlocked: false,
				accuracy: 0,
				reviews: 0,
				transfers: 0,
				blockedBy: [...trail],
				shortfall: 'circular prerequisites'
			};
		}
		trail.add(skill.code);

		const blockedBy: string[] = [];
		for (const code of skill.prereqs) {
			const prereq = byCode.get(code);
			if (!prereq) {
				blockedBy.push(code);
				continue;
			}
			if (!decide(prereq, trail).mastered) blockedBy.push(code);
		}

		const s = stats.get(skill.code) ?? emptyStats(skill.code);
		const accuracy = s.reviews > 0 ? s.correct / s.reviews : 0;

		const mastered =
			s.reviews >= MASTERY.minimumReviews &&
			accuracy >= MASTERY.accuracy &&
			(!MASTERY.requiresTransfer || s.transfers > 0);

		const looping = cyclic.has(skill.code);
		const verdict: MasteryVerdict = {
			skill,
			mastered: mastered && !looping,
			unlocked: blockedBy.length === 0 && !looping,
			accuracy,
			reviews: s.reviews,
			transfers: s.transfers,
			blockedBy,
			shortfall: looping
				? 'circular prerequisites'
				: mastered
					? null
					: describeShortfall(s, accuracy)
		};

		trail.delete(skill.code);
		verdicts.set(skill.code, verdict);
		return verdict;
	};

	for (const skill of skills) decide(skill, new Set());
	return verdicts;
}

/** Skills available to practise now: unlocked and not yet mastered. */
export function availableSkills(verdicts: Map<string, MasteryVerdict>): SkillSeed[] {
	return [...verdicts.values()]
		.filter((v) => v.unlocked && !v.mastered)
		.sort((a, b) => a.skill.level - b.skill.level)
		.map((v) => v.skill);
}

/**
 * The next thing to teach.
 *
 * The lowest unlocked, unmastered skill — the curriculum is ordered for a
 * reason, and skipping ahead is how you end up with holes.
 */
export function nextSkill(verdicts: Map<string, MasteryVerdict>): SkillSeed | null {
	return availableSkills(verdicts)[0] ?? null;
}

/** Keys with the least practice, which the scheduler pulls forward. */
export function coldKeys(
	reviewsByKey: Map<string, number>,
	allKeys: string[],
	count = 4
): string[] {
	return [...allKeys]
		.sort((a, b) => (reviewsByKey.get(a) ?? 0) - (reviewsByKey.get(b) ?? 0))
		.slice(0, count);
}
