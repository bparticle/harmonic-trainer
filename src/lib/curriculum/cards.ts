import type { CardDirection } from '$lib/server/db/schema';
import { formatKey, key as makeKey } from '$lib/music/key';
import { midi, pitchClass } from '$lib/music/note';
import {
	CADENCE_NAME,
	NEAR_RELATIONS,
	RELATION_LABELS,
	cadenceIn,
	crossingsWithRelation,
	describeCrossing
} from './crossing';
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

	/*
	 * The pivot question asks for a diatonic seventh, which is a chord rather
	 * than a note — so unlike the other two it has to wait for the rung that
	 * teaches sevenths in that key. The rest of the crossing family is answered
	 * with a single note and is open from the first morning.
	 */
	const sevenths = new Set(
		reached.filter((cell) => cell.rungId === 'all-sevenths').map((cell) => cell.key)
	);

	return [
		...rungs,
		...keys.flatMap(cardsForKeyCentre),
		...keys.flatMap(cardsForKeyMoved),
		...keys.filter((key) => sevenths.has(key)).flatMap(cardsForPivots)
	];
}

// ---------------------------------------------------------------------------
// Where are we, where did it go, and what was the hinge
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

/**
 * Two cadences, and the question is where the second one landed.
 *
 * The harder sibling of `cardsForKeyCentre`, and harder for a reason worth
 * naming: identifying a key from silence is one job, and *holding* one key while
 * another arrives is another. Krumhansl and Kessler measured exactly this —
 * modulations between close keys are established by the listener sooner than
 * distant ones — so the four near relations are what this asks about, and the
 * queue meets them near-first because `crossingsWithRelation` returns them in
 * the curriculum's own order.
 *
 * The answer is still one note: the tonic of the key it moved to. The
 * *relation* — the dominant, the relative — is what actually transposes and is
 * the thing worth learning, so it is named in the reveal rather than demanded as
 * an answer. Grading a relation would need a multiple choice this app does not
 * have, and an honour-system reveal that always records "correct" would put a
 * number in the record that means nothing.
 */
export function cardsForKeyMoved(keyName: string): GeneratedCard[] {
	const from = makeKey(keyName);

	return crossingsWithRelation(from, NEAR_RELATIONS).map((crossing) => {
		const to = crossing.to;
		const tonic = to.tonic;
		const relation = RELATION_LABELS[crossing.relation];

		const payload: CardPayload = {
			kind: 'key-moved',
			// The reveal names both halves: where it went, and what that move is
			// called. The name is the half that survives being transposed.
			label: `${formatKey(to, true)} — ${relation}`,
			answerPitchClasses: [pitchClass(tonic)],
			answerVoicing: [midi(tonic)],
			detail: describeCrossing(crossing),
			steps: [...cadenceIn(from), ...cadenceIn(to)].map((chord) => ({
				numeral: chord.numeral,
				symbol: chord.symbol,
				pitchClasses: chord.pitchClasses,
				voicing: chord.voicing
			}))
		};

		return {
			skillCode: CROSSING_SKILL,
			keyCenter: keyName,
			direction: 'key_moved' as const,
			payload,
			identity: `crossing|moved|${keyName}|${formatKey(to)}|key_moved`
		};
	});
}

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
