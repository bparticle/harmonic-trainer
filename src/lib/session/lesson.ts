/**
 * The amount of help a repeated practice card should receive.
 *
 * A short workout can contain the same card more than once. Those repetitions
 * are useful only when they visibly change the job: first copy a demonstrated
 * shape, then play with less help, then recall it. Keeping this pure makes the
 * progression independent of the session UI and, importantly, deterministic
 * when a workout is resumed.
 */

export type GuidanceMode = 'guided' | 'supported' | 'recall';

export type CardGuidance = {
	mode: GuidanceMode;
	round: number;
	rounds: number;
	showTarget: boolean;
	showTargetLabels: boolean;
};

export type LessonCard = {
	id: string;
	keyCenter: string;
	direction: string;
	payload: { kind?: string; label?: string };
};

const SHAPE_DIRECTIONS = new Set(['hear_play', 'see_play', 'degree_play']);

/**
 * The directions a chord may be *demonstrated* in.
 *
 * A narrower set than the one above, and the difference is `degree_play`. That
 * question is answered twice — play the IV of E♭, then say what you played — so
 * it is a shape question and a naming question wearing one card, and everything
 * a demonstration does is a way of saying the name out loud. See `isChordShape`.
 */
const DEMONSTRABLE_DIRECTIONS = new Set(['hear_play', 'see_play']);

/**
 * The musical thing a learner is practising, rather than the database row that
 * happened to ask for it.
 *
 * Chords are met through more than one direction: you may first hear a C triad
 * and later be asked for I in C. Those are two cards but one hand shape, so they
 * should share the same fade from demonstration to recall. Pure naming cards
 * deliberately keep their own identity; grouping those with a playing card
 * would reveal the answer to an ear question before it was asked.
 */
export function guidanceKey(card: LessonCard): string {
	const kind = card.payload.kind;
	const label = card.payload.label;
	if ((kind === 'triad' || kind === 'seventh') && label && SHAPE_DIRECTIONS.has(card.direction)) {
		return `shape|${card.keyCenter}|${kind}|${label}`;
	}
	return `card|${card.id}`;
}

/**
 * Whether this card is a chord being *taught*, which is a narrower thing than a
 * chord being practised.
 *
 * The session page hangs the whole demonstration off this: the watch phase, the
 * chord sounded before you play it, the keys lit under the answer with their
 * note names printed on them, and — the loudest of them — the chord's own symbol
 * across the top of the prompt. All of that is right for `see_play` and
 * `hear_play`, where the answer is a hand shape and the name is either printed
 * already or not being asked for.
 *
 * **`degree_play` was in this set and is the one question it ruins.** It asks
 * for a chord by its function and then asks what you just played, and it was
 * posed with `Am` in display type above `i — Am`, over a keyboard with A, C and
 * E lit and lettered, after the app had played the chord to you. Both halves of
 * the question were answered by the question. It still shares a fade with the
 * shape cards — see `guidanceKey`, which is a separate judgement about how much
 * *repetition* a shape has had — but it is not a thing that may be shown.
 */
export function isChordShape(card: LessonCard | null | undefined): boolean {
	return Boolean(
		card &&
		(card.payload.kind === 'triad' || card.payload.kind === 'seventh') &&
		DEMONSTRABLE_DIRECTIONS.has(card.direction)
	);
}

export function guidanceFor(cardIds: string[], currentIndex: number): CardGuidance {
	const id = cardIds[currentIndex];
	if (!id) {
		return {
			mode: 'guided',
			round: 1,
			rounds: 1,
			showTarget: true,
			showTargetLabels: true
		};
	}

	const rounds = Math.max(1, cardIds.filter((cardId) => cardId === id).length);
	const round = cardIds.slice(0, currentIndex + 1).filter((cardId) => cardId === id).length;

	if (round === 1) {
		return { mode: 'guided', round, rounds, showTarget: true, showTargetLabels: true };
	}
	if (round < rounds) {
		return { mode: 'supported', round, rounds, showTarget: true, showTargetLabels: false };
	}
	return { mode: 'recall', round, rounds, showTarget: false, showTargetLabels: false };
}
