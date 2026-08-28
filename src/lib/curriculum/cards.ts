import type { CardDirection } from '$lib/server/db/schema';
import { formatKey, key as makeKey } from '$lib/music/key';
import { midi, pitchClass } from '$lib/music/note';
import { CADENCE_NAME, cadenceIn } from './crossing';
import {
	RUNGS,
	STAGES,
	directionsForItem,
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
	/** The key the degree is counted from, when the card's own key is not it. */
	degreeOf?: string;
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

/**
 * Hearing where the music is, as one skill rather than twelve.
 *
 * Every other skill code names a thing to be learned — a rung, a progression.
 * This one names a *question*, and the twelve keys are its instances, carried
 * on the card's own `key_center` exactly as they are for every other card. One
 * code rather than one per key, because "can you hear which key this is" is a
 * single ability that happens to be tested in twelve places.
 */
export const CROSSING_SKILL = 'crossing:key-centre';

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
		degreeOf: item.degreeOf,
		detail: item.detail
	};
}

/** Every card for one rung in one key. */
export function cardsForRung(rungId: RungId, stage: Stage): GeneratedCard[] {
	const out: GeneratedCard[] = [];
	for (const item of itemsForRung(rungId, stage)) {
		for (const direction of directionsForItem(rungId, item)) {
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

/**
 * Cards for a list of places already reached.
 *
 * Two kinds now. The rungs give what they always gave, and every *key* the
 * frontier has opened at all also gets one key-centre card — because the
 * question "which key is this" belongs to the key rather than to any rung of
 * it, and there is exactly one of it per key however deep the ladder goes there.
 */
export function cardsForReached(reached: Array<{ key: string; rungId: RungId }>): GeneratedCard[] {
	const rungs = reached.flatMap(({ key, rungId }) => {
		const stage = STAGES.find((s) => s.key === key);
		return stage ? cardsForRung(rungId, stage) : [];
	});

	const keys = [...new Set(reached.map((cell) => cell.key))];
	return [...rungs, ...keys.flatMap(cardsForKeyCentre)];
}

// ---------------------------------------------------------------------------
// Where are we?
// ---------------------------------------------------------------------------

/**
 * One card per key: a cadence, and the note it came home to.
 *
 * **The stimulus is allowed to be richer than the vocabulary, and that is the
 * point.** Every other card in this file asks you to produce something the
 * ladder has shown you; this one asks you to *recognise* something, and what it
 * plays — three triads — may be more than a first-morning account could play
 * back. That is not the gate leaking. Tillmann, Bharucha and Bigand's account of
 * tonal knowledge is that it is acquired by exposure, and the readiness rule
 * this app keeps has always been about what it asks you to play. The answer here
 * is a single note, and a single note is inside everybody's vocabulary from the
 * first minute.
 *
 * The key is never written down. That is the whole exercise: twelve keys are a
 * set of highly confusable categories, and telling them apart is what
 * interleaving is for — see the note at the top of `crossing.ts`.
 */
export function cardsForKeyCentre(keyName: string): GeneratedCard[] {
	const k = makeKey(keyName);
	const cadence = cadenceIn(k);
	const tonic = k.tonic;

	const payload: CardPayload = {
		kind: 'key-centre',
		// Shown only once the answer is out. Unicode, because it is read by a
		// person rather than written to a column.
		label: formatKey(k, true),
		answerPitchClasses: [pitchClass(tonic)],
		answerVoicing: [midi(tonic)],
		detail: CADENCE_NAME,
		steps: cadence.map((chord) => ({
			numeral: chord.numeral,
			symbol: chord.symbol,
			pitchClasses: chord.pitchClasses,
			voicing: chord.voicing
		}))
	};

	return [
		{
			skillCode: CROSSING_SKILL,
			keyCenter: keyName,
			direction: 'key_hear',
			payload,
			identity: `crossing|key-centre|${keyName}|key_hear`
		}
	];
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

/**
 * What a skill code is called, in the words the material already carries.
 *
 * The rung's own `label` and the progression's own `name` — the same two
 * strings `skillSeeds` copies into the database, read here off the source
 * rather than off the row, so anything that has a code in its hand can say what
 * it is without a query. Null for a code naming nothing, which is what a card
 * left behind by a rung that has since been renamed looks like: a task that
 * cannot name its material says nothing about it.
 */
export function skillLabel(code: string): string | null {
	if (code.startsWith('rung:')) {
		return RUNGS.find((rung) => rungSkillCode(rung.id) === code)?.label ?? null;
	}
	if (code.startsWith('prog:')) {
		return PROGRESSIONS.find((p) => progressionSkillCode(p.id) === code)?.name ?? null;
	}
	if (code === CROSSING_SKILL) return 'Where are we?';
	return null;
}

/** Every skill code the ladder and the progression library need. */
export function allSkillCodes(): string[] {
	return [
		...RUNGS.map((r) => rungSkillCode(r.id)),
		...PROGRESSIONS.map((p) => progressionSkillCode(p.id)),
		CROSSING_SKILL
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

	/*
	 * The key-centre question, as one skill.
	 *
	 * Level zero and no prerequisites, because it is answerable on the first
	 * morning: the cadence does the teaching and the answer is one note.
	 */
	const crossings: SkillSeed[] = [
		{
			code: CROSSING_SKILL,
			name: 'Where are we?',
			level: 0,
			category: 'keys',
			description: 'A cadence, no key written down, and the note it comes home to.',
			prereqs: []
		}
	];

	return [...rungs, ...progressions, ...crossings];
}
