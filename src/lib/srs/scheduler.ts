import {
	FSRS,
	Rating,
	State,
	createEmptyCard,
	generatorParameters,
	type Card,
	type Grade
} from 'ts-fsrs';
import type { CardDirection, ReviewRating, SrsStateKind } from '$lib/server/db/schema';

/**
 * Spaced repetition.
 *
 * FSRS rather than SM-2: the schema was always FSRS-shaped, and with four
 * directions across twelve keys the card count runs to thousands, which is
 * where scheduling efficiency actually pays for itself.
 *
 * The algorithm comes from `ts-fsrs` rather than being hand-rolled. Its edge
 * cases — same-day reviews, fuzz, retrievability at zero elapsed time — are
 * exactly where a home-made version is *silently* wrong, and a scheduler that
 * is quietly mis-scheduling is the worst possible failure here: nothing in the
 * UI would ever reveal it.
 *
 * What this module owns is the translation between the database row and the
 * library's card, and the decision about which due card to put in front of you
 * next. That second part is ours, and it is where the four directions stop
 * being equal.
 */

/** Our stored shape. Mirrors the `srs_state` table. */
export type SrsState = {
	stability: number;
	difficulty: number;
	dueAt: Date;
	reps: number;
	lapses: number;
	state: SrsStateKind;
	lastReviewedAt: Date | null;
};

const STATE_TO_DB: Record<State, SrsStateKind> = {
	[State.New]: 'new',
	[State.Learning]: 'learning',
	[State.Review]: 'review',
	[State.Relearning]: 'relearning'
};

const DB_TO_STATE: Record<SrsStateKind, State> = {
	new: State.New,
	learning: State.Learning,
	review: State.Review,
	relearning: State.Relearning
};

// `Grade` rather than `Rating`: the library's Rating union includes `Manual`,
// which is not something a review can produce.
const RATING_TO_FSRS: Record<ReviewRating, Grade> = {
	again: Rating.Again,
	hard: Rating.Hard,
	good: Rating.Good,
	easy: Rating.Easy
};

/*
 * Two parameters turned off, both deliberately.
 *
 * **Fuzz** exists to stop large decks bunching reviews onto one day. That is a
 * real problem for a thousand-card language deck and not one here — a practice
 * session takes what is due and stops. Off, the scheduler is deterministic, so
 * the tests can assert real intervals instead of ranges.
 *
 * **Short-term scheduling** adds sub-day learning steps (1 minute, 10 minutes)
 * for cramming something in a single sitting. This app practises once a day, so
 * a card due in ten minutes means nothing to it; within-session repetition is
 * the session engine's job, not the scheduler's. Leaving it on also required
 * persisting a `learning_steps` counter, and getting that wrong pinned every
 * card at the ten-minute step forever — an entirely self-inflicted bug that
 * disappears along with the feature nobody here needs.
 */
const engine = new FSRS(generatorParameters({ enable_fuzz: false, enable_short_term: false }));

export function initialState(now = new Date()): SrsState {
	return fromCard(createEmptyCard(now));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toCard(state: SrsState): Card {
	// `elapsed_days` and `scheduled_days` are recomputed by the engine, but it
	// reads them for the review log, so they are reconstructed rather than zeroed.
	const scheduled = state.lastReviewedAt
		? Math.max(0, (state.dueAt.getTime() - state.lastReviewedAt.getTime()) / DAY_MS)
		: 0;

	return {
		due: state.dueAt,
		stability: state.stability,
		difficulty: state.difficulty,
		elapsed_days: 0,
		scheduled_days: scheduled,
		learning_steps: 0,
		reps: state.reps,
		lapses: state.lapses,
		state: DB_TO_STATE[state.state],
		last_review: state.lastReviewedAt ?? undefined
	};
}

function fromCard(card: Card): SrsState {
	return {
		stability: card.stability,
		difficulty: card.difficulty,
		dueAt: card.due,
		reps: card.reps,
		lapses: card.lapses,
		state: STATE_TO_DB[card.state],
		lastReviewedAt: card.last_review ?? null
	};
}

/** Apply a grade and return the new scheduling state. */
export function schedule(state: SrsState, rating: ReviewRating, now = new Date()): SrsState {
	const { card } = engine.next(toCard(state), now, RATING_TO_FSRS[rating]);
	return fromCard(card);
}

/** What each grade would do, for showing the intervals on the log screen. */
export function preview(state: SrsState, now = new Date()): Record<ReviewRating, SrsState> {
	const grades: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
	return Object.fromEntries(grades.map((g) => [g, schedule(state, g, now)])) as Record<
		ReviewRating,
		SrsState
	>;
}

/**
 * Probability of recalling this card right now, 0–1.
 *
 * Used for ordering rather than for scheduling: among cards that are all due,
 * the one closest to being forgotten is the one worth asking first.
 */
export function retrievability(state: SrsState, now = new Date()): number {
	if (state.state === 'new' || !state.lastReviewedAt) return 0;
	return engine.get_retrievability(toCard(state), now, false) as number;
}

export function isDue(state: SrsState, now = new Date()): boolean {
	return state.dueAt.getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------
// Choosing what to ask
// ---------------------------------------------------------------------------

/**
 * How hard each direction pulls when several cards are equally due.
 *
 * These are *selection* weights, not adjustments to the algorithm. Distorting
 * FSRS's intervals to favour a direction would corrupt its model of your
 * memory; changing which due card gets picked does not.
 *
 * The pivot leads, because it is the one question with two keys in it and the
 * only direction whose answer is a chord you have to find rather than a chord
 * you were shown. Its two siblings — a cadence and the note it came home to —
 * used to lead ahead of it and have been withdrawn; see DECISIONS.md.
 *
 * Play-to-name comes next, and `degree_play` is the direction that asks it:
 * *play the chord that numeral asks for, then name what you played*. It is the
 * weakest link among the chord directions and the one the whole app exists to
 * fix — being able to play a thing you cannot name is the problem statement —
 * and it is the half the play-along page never asks, because a chart shows
 * symbols and never numbers.
 *
 * The weight used to sit on `play_name`, which posed the same question with the
 * key left off and was never asked by anything. It has moved house rather than
 * changed size: the number is the same number, on the direction that spends it.
 */
export const DIRECTION_WEIGHT: Record<CardDirection, number> = {
	// The heaviest, and it earns it: two keys, no chord name, and a shape that
	// has to be found from what it does rather than from what it is called.
	pivot_play: 1.55,
	// Then the chord directions, play-to-name first — see the note above.
	degree_play: 1.6,
	hear_name: 1.15,
	see_play: 1.0,
	hear_play: 1.0,
	/*
	 * Retired, and kept only because the enum and the old rows are.
	 *
	 * Nothing generates `play_name` any more — see `directionsForRung` — so this
	 * entry decides nothing and cannot: the cards that carry it were never in any
	 * pool, which is how a weight this heavy went its whole life unspent. Left at
	 * the number it had rather than zeroed, because a tombstone that has been
	 * edited reads as a live decision.
	 */
	play_name: 1.6
};

export type Schedulable = {
	cardId: string;
	direction: CardDirection;
	keyCenter: string;
	/** Which skill the card belongs to, so a block can ask for its own material. */
	skillCode?: string;
	state: SrsState;
};

/**
 * The direction that is an introduction rather than a review.
 *
 * `see_play` shows you the symbol and asks you to play it — which is exactly
 * what a chart does, all day, with a rhythm section behind it. It earns its
 * place the first few times, while the symbol is still new, and after that it
 * is the one question the band already asks better.
 *
 * It is also the only direction that *hands over* material rather than testing
 * it, which is why the workout's fourth drill is built on it and why that drill
 * leads the day: nothing else in the app shows you a symbol and its notes at the
 * same time, and every other question about a chord assumes somebody has.
 */
const INTRODUCTION: CardDirection = 'see_play';

/**
 * Has this card outgrown being shown its own symbol?
 *
 * Only a *graduated* introduction retires. `review` is FSRS saying the card is
 * known, and a known symbol is one the chart will keep asking anyway.
 * `relearning` is the opposite fact — the card graduated and was then failed,
 * which for `see_play` means you were shown a symbol and could not play it. To
 * retire that one would be the app noticing the gap and then declining to
 * mention it. Failing hands the introduction back; passing is what gives it up.
 */
export function isRetiredIntroduction(card: Pick<Schedulable, 'direction' | 'state'>): boolean {
	return card.direction === INTRODUCTION && card.state.state === 'review';
}

export type SelectionOptions = {
	now?: Date;
	/** Keys that have been neglected, which get a nudge to the front. */
	coldKeys?: string[];
	coldKeyBoost?: number;
	/**
	 * Drop graduated introductions from the pile.
	 *
	 * Opt-in, and off by default, because retiring a question is a claim about
	 * where else it gets asked and only the caller is in a position to make it.
	 * Workout composition is the caller that makes it: the symbol you can already
	 * play is one the play-along page asks all day with a band behind it. The
	 * six-block session used to be the reason for the default; it is gone, and the
	 * default stays because the claim is still not this module's to make.
	 */
	retireIntroductions?: boolean;
};

/**
 * Order the due cards by how much each is worth asking now.
 *
 * Overdue-ness dominates, then the direction weight, then whether the key is
 * one that has been avoided. A card that is barely due but sits in a key never
 * touched can outrank one that is slightly more overdue in a comfortable key —
 * which is the point, since the comfortable keys are not where the work is.
 */
export function selectDue(cards: Schedulable[], options: SelectionOptions = {}): Schedulable[] {
	const now = options.now ?? new Date();
	const cold = new Set(options.coldKeys ?? []);
	const boost = options.coldKeyBoost ?? 1.35;

	return cards
		.filter((c) => isDue(c.state, now))
		.filter((c) => !options.retireIntroductions || !isRetiredIntroduction(c))
		.map((c) => {
			const overdueDays = Math.max(
				0,
				(now.getTime() - c.state.dueAt.getTime()) / (24 * 60 * 60 * 1000)
			);
			// A brand new card counts as mildly urgent rather than infinitely so.
			const urgency = c.state.state === 'new' ? 0.5 : 1 + overdueDays;
			const priority =
				urgency * DIRECTION_WEIGHT[c.direction] * (cold.has(c.keyCenter) ? boost : 1);
			return { card: c, priority };
		})
		.sort((a, b) => b.priority - a.priority)
		.map((entry) => entry.card);
}

/**
 * Grade a review from what was actually played.
 *
 * Correctness comes from the pitch classes; the grade then comes from how long
 * it took. Latency is the measurement that matters here, so it is what
 * separates "good" from "easy" rather than a self-report nobody makes honestly
 * under time pressure.
 */
export function gradeFromPerformance(
	correct: boolean,
	latencyMs: number | null,
	thresholds = { easy: 1500, good: 4000 }
): ReviewRating {
	if (!correct) return 'again';
	if (latencyMs === null) return 'good';
	if (latencyMs <= thresholds.easy) return 'easy';
	if (latencyMs <= thresholds.good) return 'good';
	return 'hard';
}
