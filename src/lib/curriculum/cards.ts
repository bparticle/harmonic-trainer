import type { CardDirection } from '$lib/server/db/schema';
import { formatKey, key as makeKey } from '$lib/music/key';
import { midi, pitchClass } from '$lib/music/note';
import { NEAR_RELATIONS, crossingsWithRelation } from './crossing';
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
	/**
	 * Progressions only: the chords in order, and the answer to the card.
	 *
	 * `answerPitchClasses` beside it is the union of all of them, which is a fact
	 * about the material rather than anything to play. See `cardsForProgression`.
	 */
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
 * Moving between keys, as one skill rather than twelve.
 *
 * Every other skill code names a thing to be learned — a rung, a progression.
 * This one names a *question*, and the twelve keys are its instances, carried
 * on the card's own `key_center` exactly as they are for every other card. One
 * code rather than one per key, because "can you get from here to there" is a
 * single ability that happens to be tested in twelve places.
 *
 * The string still says `key-centre` because rows say it: this code is written
 * into `skills` and pointed at by every crossing card ever made, including the
 * withdrawn ones whose reviews are still on the record. Renaming it would be
 * renaming history to match the present, which is the one thing a record must
 * not do.
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
 * The rungs give what they always gave, and a key deep enough to have been
 * taught its sevenths also gets its pivots. Nothing here is made for a key
 * merely because the frontier has touched it — that rule is what put six
 * cadence questions in front of an account whose whole vocabulary was the C
 * scale, and it left with them.
 */
export function cardsForReached(reached: Array<{ key: string; rungId: RungId }>): GeneratedCard[] {
	const rungs = reached.flatMap(({ key, rungId }) => {
		const stage = STAGES.find((s) => s.key === key);
		return stage ? cardsForRung(rungId, stage) : [];
	});

	/*
	 * The pivot question asks for a diatonic seventh, which is a chord rather
	 * than a note, so it waits for the rung that teaches sevenths in that key.
	 *
	 * **It is the only crossing card left, and that is the point.** The two that
	 * were answered with a single note — a cadence and the note it came home to,
	 * two cadences and where the second landed — were made for every key the
	 * frontier had opened, from the first morning, on the argument that a
	 * one-note answer is inside everybody's vocabulary. The argument was about
	 * the *answer* and the difficulty was in the *question*: three triads nobody
	 * had been taught, no key written down, and a first workout that opened with
	 * six of them. See DECISIONS.md. What is left waits for a rung, which is what
	 * the rest of this file has always done.
	 */
	const sevenths = new Set(
		reached.filter((cell) => cell.rungId === 'all-sevenths').map((cell) => cell.key)
	);

	return [...rungs, ...[...sevenths].flatMap(cardsForPivots)];
}

// ---------------------------------------------------------------------------
// The hinge
// ---------------------------------------------------------------------------

/**
 * One chord, named by what it does in two keys at once.
 *
 * `vi7 in C · ii7 in G`, and the answer is A minor seventh. The realisation that
 * two numerals point at the same place under the hands is the whole of what a
 * pivot modulation is, and it is a different question from `degree_play`, which
 * gives one numeral in one key and asks for spelling.
 *
 * One card per crossing rather than one per pivot. C and its relative minor
 * share all seven of their diatonic sevenths, so taking every pivot would make
 * seven near-identical cards for the easiest relation in the set and none at all
 * for the parallel, which shares no chord whatsoever. The first is taken because
 * `pivotChords` walks the degrees in order and the first is the lowest — a
 * stable choice, and a test asserts it stays one.
 */
export function cardsForPivots(keyName: string): GeneratedCard[] {
	const from = makeKey(keyName);

	return crossingsWithRelation(from, NEAR_RELATIONS).flatMap((crossing) => {
		const [pivot] = crossing.pivots;
		// The parallel key shares no diatonic chord at all, which is exactly why
		// that modulation is hard — and why there is no hinge card for it.
		if (!pivot) return [];

		const here = formatKey(from, true);
		const there = formatKey(crossing.to, true);
		// The numerals arrive as the database spells them — `bIIImaj7`, `iim7b5`.
		// The key names beside them are already unicode, and half a line of real
		// accidentals next to half a line of ASCII reads as a mistake.
		const numeral = (roman: string) => roman.replace(/b/g, '♭').replace(/#/g, '♯');

		const payload: CardPayload = {
			kind: 'pivot',
			label: pivot.symbol,
			answerPitchClasses: pivot.pitchClasses,
			// The prompt itself: two functions, no chord name. `pose` reads this.
			detail: `${numeral(pivot.romanInFrom)} in ${here} · ${numeral(pivot.romanInTo)} in ${there}`
		};

		return [
			{
				skillCode: CROSSING_SKILL,
				keyCenter: keyName,
				direction: 'pivot_play' as const,
				payload,
				identity: `crossing|pivot|${keyName}|${formatKey(crossing.to)}|${pivot.symbol}|pivot_play`
			}
		];
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
 *
 * **`steps` is the answer, and `answerPitchClasses` is not.** For every other
 * card those pitch classes are the whole of what to play; here they are the
 * union of every chord's notes, which is the material the passage touches and
 * nothing anybody could hold at once. `pose` and `markPassage` read `steps` and
 * never the union, and the union stays because cards are insert-only: an
 * account that pinned a progression last month holds a row with this exact
 * payload, and changing what is written here would split the population into two
 * shapes wearing one identity while fixing nothing for the older half. Both
 * halves already carry the steps, so both are answerable.
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
 *
 * **And null for no code at all.** Every caller reads this off a card that may
 * not be there — `skillLabel(currentCard?.skillCode)` — and between the last
 * answer of a task and the next task loading there genuinely is no card. The
 * signature said `string`, so that gap threw `Cannot read properties of
 * undefined (reading 'startsWith')` out of a Svelte flush, which abandons the
 * rest of that flush: the screen kept the previous question's chord shape and
 * feedback under the new one, and the next answer went unregistered until
 * something else woke the graph up. A missing code is the same question as an
 * unrecognised one — *what is this called?* — and has the same answer.
 */
export function skillLabel(code: string | null | undefined): string | null {
	if (!code) return null;
	if (code.startsWith('rung:')) {
		return RUNGS.find((rung) => rungSkillCode(rung.id) === code)?.label ?? null;
	}
	if (code.startsWith('prog:')) {
		return PROGRESSIONS.find((p) => progressionSkillCode(p.id) === code)?.name ?? null;
	}
	if (code === CROSSING_SKILL) return 'The hinge';
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
	 * The crossing question, as one skill.
	 *
	 * Level six rather than zero, and the number is the whole correction. It was
	 * answerable on the first morning while the cadence questions were in it —
	 * the cadence did the teaching and the answer was one note — and that was the
	 * argument that put six of them in front of somebody who had learned a scale.
	 * What is left is a pivot, which needs a diatonic seventh, which is the sixth
	 * rung. The level now says so.
	 */
	const crossings: SkillSeed[] = [
		{
			code: CROSSING_SKILL,
			name: 'The hinge',
			level: 6,
			category: 'keys',
			description: 'One chord, doing a job in each of two keys.',
			prereqs: [rungSkillCode('all-sevenths')]
		}
	];

	return [...rungs, ...progressions, ...crossings];
}
