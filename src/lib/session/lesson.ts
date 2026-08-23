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

export function isChordShape(card: LessonCard | null | undefined): boolean {
	return Boolean(
		card &&
		(card.payload.kind === 'triad' || card.payload.kind === 'seventh') &&
		SHAPE_DIRECTIONS.has(card.direction)
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
