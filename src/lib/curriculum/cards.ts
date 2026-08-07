import type { CardDirection } from '$lib/server/db/schema';
import {
	RUNGS,
	STAGES,
	directionsForRung,
	itemsForRung,
	ladderIdentity,
	type LadderItem,
	type RungId,
	type Stage
} from './ladder';
import {
	PROGRESSIONS,
	progressionIdentity,
	realiseProgression,
	type Progression
} from './progressions';

/**
 * Cards are generated from the ladder, and only where you have actually been.
 *
 * The previous version made every card in every key up front — three thousand
 * of them, all due immediately, including altered dominants and quartal
 * voicings. The scheduler then dutifully served whatever was coldest, which is
 * how a practice session ended up asking about chords nobody had ever been
 * shown, in keys nobody had ever played.
 *
 * Now nothing exists until it is reached. A brand new account has exactly one
 * rung's worth of cards: the C major scale.
 */

export type CardPayload = {
	kind: string;
	label: string;
	answerPitchClasses: number[];
	answerVoicing?: number[];
	degree?: string;
	detail?: string;
	/** Progressions only: the chords in order. */
	steps?: Array<{ numeral: string; symbol: string; pitchClasses: number[]; voicing: number[] }>;
};

export type GeneratedCard = {
	/** Skill code this belongs to: `rung:scale`, `prog:ii-V-I`. */
	skillCode: string;
	keyCenter: string;
	direction: CardDirection;
	payload: CardPayload;
	/** Stable across regeneration, so re-seeding keeps review history. */
	identity: string;
};

export const rungSkillCode = (rungId: string) => `rung:${rungId}`;
export const progressionSkillCode = (progressionId: string) => `prog:${progressionId}`;

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

function toPayload(item: LadderItem): CardPayload {
	return {
		kind: item.kind,
		label: item.label,
		answerPitchClasses: item.answerPitchClasses,
		answerVoicing: item.answerVoicing,
		degree: item.degree,
		detail: item.detail
	};
}

/** Every card for one rung in one key. */
export function cardsForRung(rungId: RungId, stage: Stage): GeneratedCard[] {
	const out: GeneratedCard[] = [];
	for (const item of itemsForRung(rungId, stage)) {
		for (const direction of directionsForRung(rungId)) {
			out.push({
				skillCode: rungSkillCode(rungId),
				keyCenter: stage.key,
				direction,
				payload: toPayload(item),
				identity: ladderIdentity(stage.key, rungId, item, direction)
			});
		}
	}
	return out;
}

/** Cards for a list of places already reached. */
export function cardsForReached(reached: Array<{ key: string; rungId: RungId }>): GeneratedCard[] {
	return reached.flatMap(({ key, rungId }) => {
		const stage = STAGES.find((s) => s.key === key);
		return stage ? cardsForRung(rungId, stage) : [];
	});
}

// ---------------------------------------------------------------------------
// Progressions
// ---------------------------------------------------------------------------

/**
 * A progression is one card, not several.
 *
 * It is played as a sequence, checked chord by chord, because the thing worth
 * practising is the movement between them — three separate chord cards would
 * test the chords and miss the point entirely.
 */
export function cardsForProgression(progression: Progression, keyName: string): GeneratedCard[] {
	const realised = realiseProgression(progression, keyName);

	const payload: CardPayload = {
		kind: 'progression',
		label: realised.name,
		answerPitchClasses: [...new Set(realised.steps.flatMap((s) => s.pitchClasses))],
		detail: realised.describes,
		steps: realised.steps.map((s) => ({
			numeral: s.numeral,
			symbol: s.symbol,
			pitchClasses: s.pitchClasses,
			voicing: s.voicing
		}))
	};

	// Played, and heard. Naming a whole progression from a single prompt was the
	// thing that made the old cards read as unanswerable.
	return (['see_play', 'hear_play'] as CardDirection[]).map((direction) => ({
		skillCode: progressionSkillCode(progression.id),
		keyCenter: keyName,
		direction,
		payload,
		identity: `${progressionIdentity(progression.id, keyName)}|${direction}`
	}));
}

/** Every skill code the ladder and the progression library need. */
export function allSkillCodes(): string[] {
	return [
		...RUNGS.map((r) => rungSkillCode(r.id)),
		...PROGRESSIONS.map((p) => progressionSkillCode(p.id))
	];
}

export type SkillSeed = {
	code: string;
	name: string;
	level: number;
	category: 'keys' | 'progressions';
	description: string;
	prereqs: string[];
};

/**
 * The rows for the `skills` table, derived rather than authored.
 *
 * They exist mostly so cards have something to belong to and statistics have
 * something to group by. The real ordering lives in the ladder, and unlocking
 * is a decision you make, so the prerequisite chain here is descriptive rather
 * than enforcing.
 */
export function skillSeeds(): SkillSeed[] {
	const rungs: SkillSeed[] = RUNGS.map((rung, i) => ({
		code: rungSkillCode(rung.id),
		name: rung.label,
		level: i,
		category: 'keys',
		description: rung.teaches,
		prereqs: i === 0 ? [] : [rungSkillCode(RUNGS[i - 1].id)]
	}));

	const progressions: SkillSeed[] = PROGRESSIONS.map((p) => ({
		code: progressionSkillCode(p.id),
		name: p.name,
		level: p.level,
		category: 'progressions',
		description: p.describes,
		prereqs: []
	}));

	return [...rungs, ...progressions];
}
