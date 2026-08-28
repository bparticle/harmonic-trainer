import { GROOVES, type Groove } from '$lib/audio/groove';
import { MISSION_CHARTS, type ChartCategory } from '$lib/curriculum/charts';
import { rungById, type RungId } from '$lib/curriculum/ladder';
import { PROGRESSIONS } from '$lib/curriculum/progressions';
import {
	describeShortfall,
	emptyVocabulary,
	isReady,
	reachOf,
	shortfall,
	taughtBy,
	type Demand,
	type Vocabulary
} from '$lib/curriculum/vocabulary';
import { progressionSkillCode, rungSkillCode } from '$lib/curriculum/cards';
import { parseChord, type ChordQuality } from '$lib/music/chord';
import { keyTonic } from '$lib/music/key';
import { GUIDE_TONE_TARGET, type Goal } from '$lib/practice/goal';
import { bandById, type BandId, type TempoLadder } from '$lib/practice/tempo';
import type { CardDirection, ChartStyle } from '$lib/server/db/schema';
import { isRetiredIntroduction, selectDue, type Schedulable } from '$lib/srs/scheduler';

/**
 * Composing a workout.
 *
 * The successor to `planSession`, and the same discipline: pure, no clock of its
 * own, no database, no browser. Given the same inputs and the same date it
 * composes the same workout, which is what makes a reload resume rather than
 * re-roll.
 *
 * What changed is the thing being composed. A session was six fixed blocks sized
 * by a timer and filled from the due pile — so a well-run deck made it end in
 * three minutes, and every day looked like the last one. A workout is three to
 * five **tasks**, each with a goal that can be met rather than a clock that runs
 * out, and it is composed fresh each day from four inputs: the due pile, the
 * neighbourhood of the ladder position, the record's cold spots, and one novelty
 * slot.
 *
 * The four task kinds are the ones the play-along page cannot ask, plus the page
 * itself. The ear and the function are questions no chart poses; the mission
 * *is* the chart, under a constraint, with a goal. `Goal` itself, the line that
 * describes one and the bar a guide-tone goal is set at now live in
 * `practice/goal.ts` beside the evaluator that answers them — see the note there
 * for why they had to move out of this module.
 *
 * Both drill tasks are queues of card ids over one bank, and they partition it
 * by direction — the ear takes `hear_play` and `hear_name`, the function takes
 * `degree_play` — which is what "one pool per workout, nothing asked twice"
 * amounts to in practice. The fallthrough in `composeWorkout` hands each built
 * task out once, so a workout of four tasks is four tasks.
 *
 * Three things the plan left open, decided here and open to being overruled by
 * the record later:
 *
 *   - **A short pool cycles rather than ending early.** "The task ends at the
 *     count, never at pile-empty" is the whole point of the fallback tiers, but
 *     an account three days old owns four ear questions in total. Ten questions
 *     from four cards is ear training; four questions and a shrug is the bug
 *     being fixed. The pool is passed over at most `MAX_PASSES` times, so one
 *     card is asked three times and not ten.
 *   - **Scales stay in the ear pool.** The plan leaves open whether the ear task
 *     should ever play sequences and recommends chords only. Taking the
 *     recommendation now would leave a brand-new account — one rung, the C major
 *     scale — with no ear material at all, and a first workout that has to be
 *     playable is the stronger constraint. `directionsForRung` already refuses
 *     to ask a scale to be *named*; being asked to play one back is a fair
 *     question.
 *   - **The function task asks cards, not the ladder directly.** This module
 *     first built its degree prompts by walking `itemsForRung` over everywhere
 *     reached, which was quick and answered nothing to anyone. A prompt
 *     synthesised on the spot is never due, never graded and never recorded — so
 *     `DIRECTION_WEIGHT['degree_play']`, which the plan asks for in the same
 *     breath, would have weighed nothing, because no degree question would ever
 *     have passed through `selectDue`. Making a card direction and then routing
 *     around the scheduler is two decisions that contradict each other. So the
 *     degrees are generated as cards in `cards.ts` like every other question,
 *     and the function task is a queue of card ids exactly as the ear task is.
 *     What survives from the first version is the round-robin: the queue is
 *     spread across keys, because a function is the one thing in the app that
 *     means the same in all twelve of them and eight `IV`s in one key is a
 *     spelling drill wearing a numeral.
 */

const DAY_MS = 86_400_000;

/**
 * The day a timestamp falls in.
 *
 * The same seed `chooseKey` has always used. Everything below that varies by
 * date varies through this number and nothing else, so the workout is fixed for
 * the day the moment the date is known.
 */
export function dayNumber(now: Date): number {
	return Math.floor(now.getTime() / DAY_MS);
}

// ---------------------------------------------------------------------------
// What a workout is made of
// ---------------------------------------------------------------------------

/** Tasks, not minutes. Minutes were always an estimate; tasks are countable. */
export type WorkoutSize = 'short' | 'standard' | 'long';

export const TASK_COUNT: Record<WorkoutSize, number> = { short: 3, standard: 4, long: 6 };

export type TaskKind = 'ear' | 'function' | 'crossing' | 'mission' | 'new_thing';

/**
 * A mission: the real play-along page under a constraint.
 *
 * These are the parameters `/backing` learns to read beside the `?chart=` it
 * already takes. The tempo is a floor rather than a setting, because playing it
 * faster than asked is not cheating.
 */
export type Mission = {
	chartSlug: string;
	chartName: string;
	keyCenter: string;
	bpmFloor: number;
	groove: Groove;
	choruses: number;
	/** Hands off the roots: thirds and sevenths doing the work. */
	rootless: boolean;
	/** The cold spot this was aimed at, when it was aimed at one. */
	coldSpot: ColdSpot | null;
	/**
	 * The band the floor aims at, when the ladder had one to suggest.
	 *
	 * Null on a tune nothing has been held clean on, where the floor is the
	 * tune's own tempo exactly as it always was. This is where M16 and M15 meet:
	 * a mission already carried a key, a tune and a tempo, so "hold the bar at
	 * the next band up on this tune" needed a band on the mission and nothing
	 * else — no new task kind, no second goal type.
	 */
	band: BandId | null;
	/**
	 * Runs this tune already has on the record, before today.
	 *
	 * So the mission can say *first time* or *played four times* rather than
	 * naming a tune with no indication of whether you have ever met it. Optional
	 * for the usual reason: a mission composed before this existed says nothing
	 * rather than claiming the tune is new.
	 */
	playedBefore?: number;
};

/** A single unseen item: the next rung, the next progression, or a new groove. */
export type Novelty =
	| { kind: 'rung'; key: string; rungId: RungId }
	| { kind: 'progression'; progressionId: string; keyCenter: string }
	| { kind: 'groove'; groove: Groove };

/**
 * A novelty's identity, so tomorrow can refuse to repeat today.
 *
 * A string rather than the object itself, because what gets carried forward is
 * read back out of a finished workout and compared, and comparing two shapes
 * structurally is a bug waiting for the day a field is added.
 */
export function noveltyId(novelty: Novelty): string {
	switch (novelty.kind) {
		case 'rung':
			return `rung|${novelty.key}|${novelty.rungId}`;
		case 'progression':
			return `progression|${novelty.keyCenter}|${novelty.progressionId}`;
		case 'groove':
			return `groove|${novelty.groove}`;
	}
}

/**
 * What a drill task is actually made of.
 *
 * The complaint this answers is a fair one and was never about the material:
 * the mix of keys and rungs a workout hands out is good, and the workout simply
 * refused to say what the mix *was*. Four tasks called Ear, Function, Mission
 * and One new thing, with a count of questions each, is a workout that knows
 * far more about itself than it is letting on.
 *
 * So a task now carries the answer to the three questions somebody asks while
 * looking at it: **which keys**, **which material**, and **how much of this
 * have I seen before**. All three come off the cards that were just queued —
 * nothing new is measured and nothing is estimated.
 *
 * Counted per question rather than per card, because a queue repeats cards when
 * the pool is small and the honest reading of "three new" is three of the things
 * you are about to be asked, not three rows in a table.
 *
 * Optional on the task, and every reader treats its absence as "say nothing":
 * a workout composed before this existed is still sitting in somebody's
 * `plan_json` and must draw as it always did rather than as a task made
 * entirely of revision.
 */
export type Makeup = {
	/** Keys the questions touch, in the order they are first asked. */
	keys: string[];
	/** Skill codes covered, in the order they are first asked. */
	skills: string[];
	/** Questions on material that has never been answered before. */
	fresh: number;
	/** Questions on material that has. */
	seen: number;
};

type TaskBase = {
	title: string;
	/** One line saying what to do, shown while the task runs. */
	instruction: string;
	goal: Goal;
};

export type EarTask = TaskBase & { kind: 'ear'; cardIds: string[]; makeup?: Makeup };
export type CrossingTask = TaskBase & { kind: 'crossing'; cardIds: string[]; makeup?: Makeup };
export type FunctionTask = TaskBase & { kind: 'function'; cardIds: string[]; makeup?: Makeup };
export type MissionTask = TaskBase & { kind: 'mission'; mission: Mission };
export type NewThingTask = TaskBase & { kind: 'new_thing'; novelty: Novelty };

export type Task = EarTask | FunctionTask | CrossingTask | MissionTask | NewThingTask;

export type Workout = {
	/**
	 * The shape stored in `plan_json`. A v1 session found on upgrade is left
	 * where it lies rather than migrated, so the two shapes have to be told
	 * apart by looking.
	 */
	version: 2;
	/** The day it was composed for, which is also the whole of its seed. */
	day: number;
	size: WorkoutSize;
	keyCenter: string;
	tasks: Task[];
	/** What the home picker pinned, if anything. */
	choice: Choice | null;
	/** The cold spots that steered it, in the order they steered. */
	coldSpots: ColdSpot[];
	/** Lifted out of its task so tomorrow can avoid it. */
	novelty: Novelty | null;
	/**
	 * Why there is no play-along today, on the days there is none.
	 *
	 * Null whenever a mission was set, which is nearly always. It is not null on
	 * the first day or two of an account, and the difference between a workout
	 * that quietly has three tasks instead of four and one that says *the tunes
	 * all want a chord you have not met yet, here is the one that teaches it* is
	 * the difference between a locked door and a curriculum. The page shows it;
	 * nothing else reads it.
	 */
	missionHeld: MissionHeld | null;
};

/**
 * A play-along that is being kept back, and what would release it.
 *
 * `needs` is the nearest tune's shortfall rather than the union of every tune's,
 * because the honest answer to "what am I waiting for" is the smallest one.
 * `teaches` names progressions by id, in the library's own order, so the page can
 * link to the thing that unlocks it instead of leaving the reader to guess.
 */
export type MissionHeld = {
	/** The nearest tune of the lot, by `reachOf`. */
	chartSlug: string;
	chartName: string;
	/** What it would ask that nothing has taught. Already in words. */
	needs: string;
	/** Progression ids that would teach one of those, nearest first. */
	teaches: string[];
};

// ---------------------------------------------------------------------------
// What it is composed from
// ---------------------------------------------------------------------------

/**
 * A key and a quality the record shows you avoiding.
 *
 * The blind-spot report, arriving as an input rather than as a finding: one row
 * per `GROUP BY` over `chord_attempts`. The query that fills it belongs to a
 * later phase; this is the shape it has to arrive in.
 *
 * `attempts: 0` is the coldest thing there is and the reason `accuracy` is
 * nullable — a key you have never played has no accuracy, and calling that zero
 * would rank it alongside a key you played badly. They are different facts.
 */
export type ColdSpot = {
	/** The key the chord was heard in, not the tune's home key. */
	keyCenter: string;
	quality: ChordQuality;
	attempts: number;
	/** Guide tones landed, 0–1, or null when nothing was ever played there. */
	accuracy: number | null;
};

/**
 * One `GROUP BY` over the record, folded into cold spots.
 *
 * The query cannot answer this on its own: it groups chords as they were written
 * — `Bb7`, `Dm7b5` — and a cold spot is about the *quality*, which is what makes
 * a dominant a dominant in all twelve keys. So the grouping stays in SQL, where
 * counting belongs, and the reading of a symbol stays in `parseChord`, which is
 * the one place in the app allowed to decide what a chord symbol means.
 *
 * A symbol that will not parse is dropped rather than filed under a guess: a
 * cold spot is used to steer a mission, and steering by a misread chord is worse
 * than steering by one fewer.
 *
 * **Nothing is invented for a quality the record has never seen.** A row here
 * would have to name a key to be filed under, and there is no honest answer to
 * "which key have you never played a diminished chord in" — the truthful answer
 * is all of them. So the composer steers by the coldest quality the record
 * actually holds, and a quality with no rows at all steers nothing, exactly as
 * an empty record steers nothing on a first workout.
 */
export function coldSpotsFrom(
	rows: Array<{ localKey: string; chord: string; attempts: number; landed: number }>
): ColdSpot[] {
	const folded = new Map<string, ColdSpot & { landed: number }>();

	for (const row of rows) {
		let quality: ChordQuality;
		try {
			quality = parseChord(row.chord).quality;
		} catch {
			continue;
		}

		// The tonic, not the label. A chord heard in `Eb dorian` was heard in E♭,
		// and a cold spot filed under the mode would leave the key looking colder
		// than the record says it is.
		const keyCenter = keyTonic(row.localKey);
		const at = `${keyCenter}\0${quality}`;
		const spot = folded.get(at) ?? {
			keyCenter,
			quality,
			attempts: 0,
			accuracy: null,
			landed: 0
		};
		spot.attempts += row.attempts;
		spot.landed += row.landed;
		folded.set(at, spot);
	}

	return [...folded.values()]
		.map(({ landed, ...spot }) => ({
			...spot,
			// Null rather than zero where nothing was played, which is the difference
			// between a key you played badly and a key you have never been in.
			accuracy: spot.attempts > 0 ? landed / spot.attempts : null
		}))
		.sort((a, b) => a.attempts - b.attempts);
}

/** What the home picker pinned. Choosing pins the material; the day still varies around it. */
export type Choice =
	| { kind: 'rung'; key: string; rungId: RungId }
	| { kind: 'progression'; progressionId: string; keyCenter: string };

/**
 * A chart a mission may be set on.
 *
 * Structurally what `ChartSeed` already is, so the built-ins satisfy it without
 * translation — but declared here rather than imported, because a chart of your
 * own comes out of the database and has to fit the same slot.
 */
export type MissionChart = {
	slug: string;
	name: string;
	style: ChartStyle;
	category: ChartCategory;
	mode: 'major' | 'minor';
	defaultBpm: number;
	defaultGroove: Groove;
	/**
	 * What the tune asks of a pair of hands, derived from its grid.
	 *
	 * Arrives as data for the same reason the cold spots and the tempo ladders
	 * do: this module is pure and does not parse Roman numerals. See
	 * `curriculum/vocabulary.ts`, which derives it, and `composeMission`, which
	 * is the only thing here that reads it.
	 */
	demand: Demand;
};

export type WorkoutInput = {
	size?: WorkoutSize;
	/** Everything with a schedule, due or not. */
	cards: Schedulable[];
	/** Every cell the frontier holds: `cellsOf(frontier)`. */
	reached: Array<{ key: string; rungId: RungId }>;
	/**
	 * The cell the frontier would open next, for the slot that offers a new thing.
	 *
	 * Passed in rather than derived, because working it out means knowing the
	 * shape of the frontier and this module is pure and does not. It used to be
	 * computed here — take the last cell reached, ask `nextPosition` — which only
	 * worked while "reached" was a prefix of one walk and the last element of it
	 * was therefore the edge. A frontier has no last element in that sense: the
	 * deepest rung is not the most recently opened cell.
	 */
	nextCell?: { key: string; rungId: RungId } | null;
	/** The record's cold spots. Empty is a fair answer on a first workout. */
	coldSpots?: ColdSpot[];
	/** Yesterday's novelty, by `noveltyId`. */
	yesterdaysNovelty?: string | null;
	choice?: Choice | null;
	/** Charts available to a mission. The built-ins when the caller says nothing. */
	charts?: MissionChart[];
	/**
	 * What each tune's tempo ladder suggests, by chart slug.
	 *
	 * An input the way cold spots are an input, and for the same reason: this
	 * module is pure and must stay that way, so the grade arrives already derived
	 * from the runs rather than the composer reaching for a database to ask. A
	 * tune missing from here is a tune the ladder has nothing to say about, which
	 * is the honest answer on a first workout and harmless after.
	 */
	ladders?: Record<string, TempoLadder>;
	/**
	 * What the record already shows played, for the novelty slot.
	 *
	 * The plan lists the composer's inputs without this one, and the novelty slot
	 * cannot be honest without it: "a groove never yet played over" is not a
	 * question the due pile or the ladder can answer. Absent, everything counts
	 * as new, which is true of a first workout and harmless after.
	 */
	played?: { progressions?: string[]; grooves?: Groove[] };
	/**
	 * How many runs each tune already has on the record, by chart slug.
	 *
	 * The same kind of input as the ladders above and derived the same way, so
	 * the mission can say whether the tune it names is one you have met. A tune
	 * missing from here has never been played, which is what an absent key in a
	 * count means everywhere else in this module.
	 */
	plays?: Record<string, number>;
	/** Whether the current rung looks solid, so the slot can say "ready to move on". */
	rungLooksSolid?: boolean;
	/**
	 * What the drill room has taught: the shapes met and the ground reached.
	 *
	 * The input that stops a workout from drilling a C triad and then sending you
	 * to a three-tonic cycle. Derived from the rungs reached and the progressions
	 * met — see `curriculum/vocabulary.ts` — and arriving already derived, like
	 * every other fact this pure module needs.
	 *
	 * Absent means *nothing has been taught*, which is only true of an account
	 * with no ladder at all. Every real caller passes one; the default is the
	 * conservative reading rather than the permissive one, because the failure
	 * this milestone fixes was an over-permissive default.
	 */
	vocabulary?: Vocabulary;
	now?: Date;
};

// ---------------------------------------------------------------------------
// The numbers
// ---------------------------------------------------------------------------

/** The ear task's count. Ten, and it does not move with the due pile. */
const EAR_QUESTIONS = 10;

/**
 * How many times a short pool may be gone round.
 *
 * The clamp that keeps "never runs dry" from becoming "the same chord ten
 * times". Three passes over one card is a drill; ten is a punishment.
 */
const MAX_PASSES = 3;

/**
 * Fewer than the ear asks, because each one is two answers — play it, then name
 * it — so eight of these is about the same amount of work as ten of those.
 */
const FUNCTION_QUESTIONS = 8;

/**
 * How much of a queue a pinned choice may take.
 *
 * Half, and this is the whole difference between honouring a choice and obeying
 * one. `startOrResume` narrowed every drill to a single skill code, and twenty
 * minutes then orbited the handful of facts that skill holds. A choice is worth
 * half the questions; the rest of the queue keeps varying, which is what stops
 * the picker from rebuilding the cage it was meant to open.
 */
const pinnedShare = (count: number) => Math.ceil(count / 2);

const MISSION_CHORUSES = 2;

const EAR_DIRECTIONS: CardDirection[] = ['hear_play', 'hear_name'];

const FUNCTION_DIRECTIONS: CardDirection[] = ['degree_play'];

/**
 * The three key questions, in their own partition.
 *
 * Where are we, where did it go, and what was the hinge. They must not be folded
 * into the ear task: its whole instruction is "listen, then play or name *it*" —
 * a chord, a thing with a symbol. These ask where you are, which is a different
 * question with a different answer, and mixing them would make one task that
 * could not say what it wanted.
 *
 * Together rather than three tasks, because they are three ways of asking one
 * thing and a workout with three key-drills in it would be a workout about
 * nothing else.
 */
const CROSSING_DIRECTIONS: CardDirection[] = ['key_hear', 'key_moved', 'pivot_play'];

/** Six keys is enough to be a discrimination and short enough to finish. */
const CROSSING_QUESTIONS = 6;

/**
 * Which form a cold quality is most at home in.
 *
 * Only the confident ones. A cold dominant belongs in a blues; the minor
 * qualities belong in a minor blues. Major has no obvious home — nearly every
 * chart is full of them — so a cold major steers nothing rather than steering
 * badly.
 */
const QUALITY_HOME: Partial<Record<ChordQuality, ChartStyle>> = {
	dom: 'blues',
	min: 'minor_blues',
	min6: 'minor_blues',
	minMaj: 'minor_blues',
	min7b5: 'minor_blues',
	dim7: 'minor_blues'
};

// ---------------------------------------------------------------------------
// Deterministic variation
// ---------------------------------------------------------------------------

/**
 * Move the window along a list without disturbing what is inside it.
 *
 * Rotation rather than a shuffle, everywhere the day has to change an answer.
 * A shuffled due pile would throw away the ordering `selectDue` just worked out;
 * a rotated one keeps the most overdue card ahead of the least and simply starts
 * somewhere else, which is all that is needed for two days with an unchanged
 * pile to hand out different cards.
 */
function rotate<T>(items: T[], by: number): T[] {
	if (items.length < 2) return [...items];
	const at = ((by % items.length) + items.length) % items.length;
	return [...items.slice(at), ...items.slice(0, at)];
}

/** First occurrence wins, so a list built in priority order stays in it. */
function unique<T>(items: T[], keyOf: (item: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of items) {
		const key = keyOf(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

/** Repeat a short list until it is long enough, then cut it to length. */
function fill<T>(pool: T[], count: number): T[] {
	if (pool.length === 0) return [];
	const out: T[] = [];
	while (out.length < count) out.push(...pool);
	return out.slice(0, count);
}

// ---------------------------------------------------------------------------
// The key
// ---------------------------------------------------------------------------

/**
 * The keys the record has least to say about, coldest first.
 *
 * Ranked by attempts and nothing else. Accuracy decides nothing here on purpose:
 * a key played badly has at least been played, and the complaint this milestone
 * answers is that total freedom turns twelve keys into four.
 */
export function coldestKeys(
	reachedKeys: string[],
	coldSpots: ColdSpot[] = [],
	count = 4
): string[] {
	const attempts = new Map<string, number>();
	for (const spot of coldSpots) {
		attempts.set(spot.keyCenter, (attempts.get(spot.keyCenter) ?? 0) + spot.attempts);
	}
	return [...reachedKeys]
		.sort((a, b) => (attempts.get(a) ?? 0) - (attempts.get(b) ?? 0))
		.slice(0, count);
}

/**
 * The key today is in.
 *
 * Seeded exactly as `chooseKey` has always been: the coldest few, rotated by the
 * day number. Not shared with `plan.ts` despite being the same idea, because
 * that module dies when the page flips and a dependency on it would have to be
 * unpicked on the way out.
 */
export function chooseKeyCenter(reachedKeys: string[], coldSpots: ColdSpot[], day: number): string {
	if (reachedKeys.length === 0) return 'C';
	const pool = coldestKeys(reachedKeys, coldSpots);
	return rotate(pool, day)[0];
}

// ---------------------------------------------------------------------------
// The queues that never run dry
// ---------------------------------------------------------------------------

/**
 * One direction's worth of the bank, in the order it is worth asking.
 *
 * Due first, near-due next, fresh material last — the order the plan names, and
 * the reason "Nothing due for this block today" stops being possible. The third
 * tier is not a subset of the first two: a card that has never been reviewed is
 * *due* the moment it exists, so leaving it in the due pile would put material
 * you were shown this morning ahead of the review work that is actually owed.
 * It goes to the back instead, where it fills whatever the reviews left over.
 *
 * Every card in the bank exists because something reached it — `cards.ts` makes
 * nothing until it is — so the bank *is* the reached material and needs no
 * filtering down to it. The only thing taken out is the one direction that has
 * somewhere better to be asked.
 */
function tieredPool(
	cards: Schedulable[],
	options: { now: Date; day: number; directions: CardDirection[]; coldKeys?: string[] }
): Schedulable[] {
	const pool = cards.filter((c) => options.directions.includes(c.direction));
	if (pool.length === 0) return [];

	const reviewed = pool.filter((c) => c.state.reps > 0);

	// Graduated introductions are dropped here and nowhere else in the app: a
	// symbol you can already play is a question the chart asks all day with a
	// band behind it. `plan.ts` does not ask for this, so the six-block session
	// keeps its warm-up until the page that replaces it exists.
	const due = selectDue(reviewed, {
		now: options.now,
		coldKeys: options.coldKeys,
		retireIntroductions: true
	});
	const dueIds = new Set(due.map((c) => c.cardId));

	const nearDue = reviewed
		.filter((c) => !dueIds.has(c.cardId) && !isRetiredIntroduction(c))
		.sort((a, b) => a.state.dueAt.getTime() - b.state.dueAt.getTime());

	// No retirement filter on the fresh tier: `reps === 0` is a card still in
	// `new`, and being new is the whole of what earns an introduction.
	const fresh = pool.filter((c) => c.state.reps === 0);

	// Each tier keeps its own ordering and starts somewhere else each day.
	return [
		...rotate(due, options.day),
		...rotate(nearDue, options.day),
		...rotate(fresh, options.day)
	];
}

/**
 * Lead with a pinned skill without narrowing to it.
 *
 * A pinned choice does not narrow the queue — narrowing is the cage this
 * milestone is undoing — it leads it, and the rest of the queue is whatever else
 * the tiers offer. Half the questions at most, and the pinned cards past that
 * half are not thrown away, only sent to the back.
 */
function leadWithPinned(
	ordered: Schedulable[],
	pinnedAll: Schedulable[],
	count: number
): Schedulable[] {
	if (pinnedAll.length === 0) return ordered;
	const pinnedIds = new Set(pinnedAll.map((c) => c.cardId));
	const rest = ordered.filter((c) => !pinnedIds.has(c.cardId));
	return unique([...pinnedAll.slice(0, count), ...rest, ...ordered], (c) => c.cardId);
}

/** Repeat a short pool rather than ending early, up to `MAX_PASSES` times. */
function toQueue(ordered: Schedulable[], count: number): string[] {
	return fill(
		ordered.map((c) => c.cardId),
		Math.min(count, ordered.length * MAX_PASSES)
	);
}

const withSkill = (cards: Schedulable[], skill: string | null | undefined) =>
	skill ? cards.filter((c) => c.skillCode === skill) : [];

/**
 * What a queue turned out to be made of.
 *
 * Read off the same cards the queue was built from, after it was built, so it
 * cannot drift from what will actually be asked — a summary derived from the
 * inputs rather than from the output is a summary of a different queue.
 *
 * A card the bank no longer holds is skipped rather than counted as new. That
 * cannot happen while a queue is composed and handed out in one breath; it is
 * the shape of the bug on the day one is composed from a stale bank, and
 * miscounting is a worse outcome there than counting fewer.
 */
export function makeupOf(cardIds: string[], cards: Schedulable[]): Makeup {
	const byId = new Map(cards.map((card) => [card.cardId, card]));
	const keys: string[] = [];
	const skills: string[] = [];
	let fresh = 0;
	let seen = 0;

	for (const id of cardIds) {
		const card = byId.get(id);
		if (!card) continue;
		if (!keys.includes(card.keyCenter)) keys.push(card.keyCenter);
		if (card.skillCode && !skills.includes(card.skillCode)) skills.push(card.skillCode);
		// Reps and not `state`, because a card failed back to `learning` has still
		// been met — "new" here means nobody has ever been asked this.
		if (card.state.reps === 0) fresh++;
		else seen++;
	}

	return { keys, skills, fresh, seen };
}

/** Ten aural questions, and never fewer because the deck is well run. */
export function earQueue(
	cards: Schedulable[],
	options: { now: Date; day: number; coldKeys?: string[]; pinnedSkill?: string | null }
): string[] {
	const tiered = tieredPool(cards, { ...options, directions: EAR_DIRECTIONS });
	if (tiered.length === 0) return [];

	// The pinned cards are rotated on their own account, because a pinned skill
	// large enough to fill the queue would otherwise freeze it: the tiers rotate
	// past cards that are not pinned, which leaves the pinned ones in the same
	// order every day.
	const pinned = rotate(withSkill(tiered, options.pinnedSkill), options.day);
	return toQueue(leadWithPinned(tiered, pinned, pinnedShare(EAR_QUESTIONS)), EAR_QUESTIONS);
}

/**
 * One key at a time, in turn.
 *
 * A key holds twenty-two numbered chords by the time its sevenths are up, so
 * taking the first eight of a flat list means eight chords of one key — which is
 * the complaint this milestone opens with, rebuilt inside the task meant to
 * answer it. Round-robin instead: eight questions touch eight keys, and today's
 * key still goes first. The lanes are not rotated again; they were filled from a
 * list the day had already turned.
 */
function spreadByKey(cards: Schedulable[], day: number, lead?: string): Schedulable[] {
	const byKey = new Map<string, Schedulable[]>();
	for (const card of cards) {
		const lane = byKey.get(card.keyCenter);
		if (lane) lane.push(card);
		else byKey.set(card.keyCenter, [card]);
	}

	const keyOrder = unique(
		[...(lead && byKey.has(lead) ? [lead] : []), ...rotate([...byKey.keys()], day)],
		(key) => key
	);
	return interleave(keyOrder.map((key) => byKey.get(key)!));
}

/**
 * One from each lane, then the next from each, until they run out.
 *
 * Written once because two queues want it for two different reasons: the
 * function task takes its lanes to be keys, so eight questions touch eight
 * keys, and the crossing task takes its lanes to be *directions*, so a task
 * called "where are we?" is not six of the one question that happens to have
 * the most cards.
 */
function interleave<T>(lanes: T[][]): T[] {
	const out: T[] = [];
	const deepest = Math.max(0, ...lanes.map((lane) => lane.length));
	for (let depth = 0; depth < deepest; depth++) {
		for (const lane of lanes) if (lane[depth]) out.push(lane[depth]);
	}
	return out;
}

/**
 * Eight degrees, spread over as many keys as the ladder has reached.
 *
 * The same tiers as the ear queue over the other half of the bank, and then the
 * round-robin — the one thing the function task does that the ear task does not,
 * because a numeral is the app's one piece of knowledge that transposes for
 * free and asking it eight times in one key throws that away.
 *
 * The spread comes before the pinning rather than after, so a pinned rung is
 * entered through today's key: choosing "the sevenths in F" and being asked
 * about the sevenths in B first would be an odd way of honouring it.
 */
export function functionQueue(
	cards: Schedulable[],
	options: {
		now: Date;
		day: number;
		coldKeys?: string[];
		pinnedSkill?: string | null;
		keyCenter?: string;
	}
): string[] {
	const tiered = tieredPool(cards, { ...options, directions: FUNCTION_DIRECTIONS });
	if (tiered.length === 0) return [];

	// No second rotation for the pinned cards here: the round-robin has already
	// reordered them, so they do not sit still the way the ear queue's would.
	const spread = spreadByKey(tiered, options.day, options.keyCenter);
	const pinned = withSkill(spread, options.pinnedSkill);
	return toQueue(
		leadWithPinned(spread, pinned, pinnedShare(FUNCTION_QUESTIONS)),
		FUNCTION_QUESTIONS
	);
}

/**
 * Six key questions, spread across as many keys as the frontier has opened.
 *
 * The spread is the exercise rather than a nicety. Kornell and Bjork's finding
 * is about *discrimination* — interleaving pays because it puts confusable
 * things next to each other and lets the difference become visible — and twelve
 * keys are as confusable as categories get. Six questions all in C would be six
 * repetitions of "yes, still C"; six across four keys is the thing being
 * taught. So this uses the same round-robin the function task does, and for a
 * stronger reason.
 *
 * No pinning. Choosing a rung on the home page leads the other two queues, and
 * leading this one would defeat it: a pinned key is a key you have been told,
 * which is the one thing this question must not do.
 */
export function crossingQueue(
	cards: Schedulable[],
	options: { now: Date; day: number; coldKeys?: string[] }
): string[] {
	const tiered = tieredPool(cards, { ...options, directions: CROSSING_DIRECTIONS });
	if (tiered.length === 0) return [];

	/*
	 * Interleaved by *direction* first, and this is not a preference.
	 *
	 * The three questions do not have equal numbers of cards and never will: one
	 * key-centre card per key, four modulations per key, and a pivot for every
	 * near relation that has one. Spreading by key alone let the ratio decide the
	 * task, and six questions came back as four modulations and two key centres
	 * with the pivot never appearing at all — a task named "where are we?" that
	 * mostly asked something else.
	 *
	 * So each direction is a lane, each lane is spread across keys the way the
	 * function task spreads, and the lanes are taken in turn. The day rotates
	 * which lane leads, so the same three questions do not arrive in the same
	 * order every morning.
	 */
	const lanes = CROSSING_DIRECTIONS.map((direction) =>
		spreadByKey(
			tiered.filter((card) => card.direction === direction),
			options.day
		)
	).filter((lane) => lane.length > 0);

	return toQueue(interleave(rotate(lanes, options.day)), CROSSING_QUESTIONS);
}

// ---------------------------------------------------------------------------
// The mission
// ---------------------------------------------------------------------------

/**
 * Which chart, in which key, at what tempo.
 *
 * `nth` picks the second mission of a long workout without repeating the first.
 * The chart's own tempo and groove are kept: a tune played at the wrong tempo in
 * the wrong groove is not that tune slightly off, and a mission has no business
 * being the exception.
 */
function composeMission(input: {
	charts: MissionChart[];
	vocabulary: Vocabulary;
	keyCenter: string;
	coldKeys: string[];
	coldSpots: ColdSpot[];
	ladders: Record<string, TempoLadder>;
	plays: Record<string, number>;
	day: number;
	nth: number;
}): Mission | null {
	/*
	 * The gate, and it comes before everything else.
	 *
	 * Only tunes whose every chord shape has been met and whose distance from the
	 * key has been travelled. This is the whole of the fix: the composer used to
	 * reach into the entire chart list, so an account two rungs old could be sent
	 * to a chart that modulates by major thirds. It cannot now, and not because a
	 * difficulty number says so — because the tune asks for a shape nobody has
	 * shown you and the comparison is written down.
	 *
	 * Sorted by reach so the *first* tune to become available is the plainest one
	 * that qualifies rather than whichever happened to sort first. The day still
	 * rotates below; it now rotates a pool that is near where you are.
	 */
	const ready = input.charts
		.filter((chart) => isReady(chart.demand, input.vocabulary))
		.sort((a, b) => reachOf(a.demand) - reachOf(b.demand) || a.slug.localeCompare(b.slug));

	if (ready.length === 0) return null;

	// The coldest quality steers which form is offered, where it has a home.
	const coldest = [...input.coldSpots].sort((a, b) => a.attempts - b.attempts)[0] ?? null;
	const wantedStyle = coldest ? QUALITY_HOME[coldest.quality] : undefined;
	const steeredSlugs = new Set(
		wantedStyle ? ready.filter((c) => c.style === wantedStyle).map((c) => c.slug) : []
	);

	// Rotated in two halves rather than as one list, or the day's rotation would
	// walk straight past the charts the cold quality just steered towards.
	// `nth` then indexes rather than re-seeds, so a long workout's second mission
	// is the next chart along and never the first one again.
	const pool = [
		...rotate(
			ready.filter((c) => steeredSlugs.has(c.slug)),
			input.day
		),
		...rotate(
			ready.filter((c) => !steeredSlugs.has(c.slug)),
			input.day
		)
	];
	const chart = pool[input.nth % pool.length];

	// A second mission goes somewhere else, so a long workout is not the same
	// tune twice in a row in the same key.
	const keys = input.coldKeys.length ? input.coldKeys : [input.keyCenter];
	const keyCenter = input.nth === 0 ? input.keyCenter : rotate(keys, input.day + input.nth)[0];

	/*
	 * The tempo, from the ladder where there is one.
	 *
	 * The floor was always the tune's own tempo, which says the same thing to
	 * somebody who has held it clean at 63% and to somebody who has held it clean
	 * past tempo. Where the ladder has something to suggest, the mission asks for
	 * the next band up instead — rhythm changes held at 63% of 160 is asked for at
	 * 128 rather than at 160, which is the thing to practise rather than the thing
	 * to bounce off.
	 *
	 * It stays a floor: playing it faster than asked was never cheating and still
	 * is not, and a mission asking below the tune's own tempo is a suggestion
	 * about where the work is, not a speed limit. A tune the ladder cannot speak
	 * for keeps the tempo it goes at, exactly as before.
	 */
	const ladder = input.ladders[chart.slug];
	const climbing = ladder?.next && ladder.nextBpm ? ladder : null;

	return {
		chartSlug: chart.slug,
		chartName: chart.name,
		keyCenter,
		bpmFloor: climbing?.nextBpm ?? chart.defaultBpm,
		band: climbing?.next ?? null,
		groove: chart.defaultGroove,
		choruses: MISSION_CHORUSES,
		// Every third day the roots are taken away. Often enough to be a habit,
		// rarely enough that it still reads as a constraint rather than the rules.
		rootless: (input.day + input.nth) % 3 === 2,
		coldSpot: coldest,
		playedBefore: input.plays[chart.slug] ?? 0
	};
}

function missionGoal(chart: MissionChart | undefined, mission: Mission): Goal {
	// Getting round a cycle at all is the achievement; guide tones are not the
	// question a chart that modulates twelve times is asking.
	if (chart?.category === 'cycle') return { kind: 'choruses', count: 1 };
	return { kind: 'guide_tones', percent: GUIDE_TONE_TARGET, choruses: mission.choruses };
}

// ---------------------------------------------------------------------------
// The novelty
// ---------------------------------------------------------------------------

/**
 * The one new thing, and never the one from yesterday.
 *
 * The next rung leads when the current one looks solid — that is where "ready to
 * move on" gets said out loud, instead of being a small button at the bottom of
 * the home page. Otherwise a progression or a groove takes the slot, because
 * being told to advance on a rung you are still fighting is the opposite of
 * encouraging.
 */
export function chooseNovelty(input: {
	keyCenter: string;
	/** What the frontier would open next, or null at the bottom of the ladder. */
	nextCell?: { key: string; rungId: RungId } | null;
	playedProgressions: string[];
	playedGrooves: Groove[];
	rungLooksSolid: boolean;
	yesterday: string | null;
	day: number;
}): Novelty | null {
	const next = input.nextCell ?? null;
	const nextRung: Novelty | null = next
		? { kind: 'rung', key: next.key, rungId: next.rungId }
		: null;

	const seenProgressions = new Set(input.playedProgressions);
	const progressions: Novelty[] = PROGRESSIONS.filter((p) => !seenProgressions.has(p.id)).map(
		(p) => ({ kind: 'progression', progressionId: p.id, keyCenter: input.keyCenter })
	);

	const seenGrooves = new Set(input.playedGrooves);
	const grooves: Novelty[] = GROOVES.filter((g) => !seenGrooves.has(g.id)).map((g) => ({
		kind: 'groove',
		groove: g.id
	}));

	const rest = rotate([...progressions, ...grooves], input.day);
	// The rung is either the head or the last resort: offered first when it looks
	// solid, and still offered when there is nothing else left to be new.
	const ranked = input.rungLooksSolid
		? [...(nextRung ? [nextRung] : []), ...rest]
		: [...rest, ...(nextRung ? [nextRung] : [])];

	return ranked.find((candidate) => noveltyId(candidate) !== input.yesterday) ?? null;
}

// ---------------------------------------------------------------------------
// Building the tasks
// ---------------------------------------------------------------------------

function earTask(cardIds: string[], cards: Schedulable[]): EarTask | null {
	if (cardIds.length === 0) return null;
	return {
		kind: 'ear',
		title: 'Ear',
		instruction: `${cardIds.length} questions · listen, then play or name.`,
		goal: { kind: 'questions', count: cardIds.length },
		cardIds,
		makeup: makeupOf(cardIds, cards)
	};
}

function functionTask(cardIds: string[], cards: Schedulable[]): FunctionTask | null {
	if (cardIds.length === 0) return null;
	return {
		kind: 'function',
		title: 'Function',
		instruction: `${cardIds.length} degrees across keys · play, then name.`,
		goal: { kind: 'questions', count: cardIds.length },
		cardIds,
		makeup: makeupOf(cardIds, cards)
	};
}

function crossingTask(cardIds: string[], cards: Schedulable[]): CrossingTask | null {
	if (cardIds.length === 0) return null;
	return {
		kind: 'crossing',
		title: 'Where are we?',
		instruction: `${cardIds.length} questions · where the music is, where it went, and what turned it.`,
		goal: { kind: 'questions', count: cardIds.length },
		cardIds,
		makeup: makeupOf(cardIds, cards)
	};
}

function missionTask(mission: Mission, chart: MissionChart | undefined): MissionTask {
	const constraint = mission.rootless ? ' Rootless · thirds and sevenths only.' : '';
	/*
	 * Why that tempo, when it is the ladder's and not the tune's.
	 *
	 * Said out loud rather than left as a number that looks wrong: a mission that
	 * asks for 128 on a tune the player knows goes at 160 has to explain itself,
	 * or it reads as a bug. Named as a band and not as a threshold — the tempo is
	 * a floor, and the sentence never claims anything is locked.
	 */
	const band = mission.band ? bandById(mission.band) : null;
	const climbing = band ? ` ${band.name} · one band up.` : '';
	/*
	 * Whether you have met this tune, said in the instruction and not only in a
	 * chip. A mission that names a tune without saying that is the first sentence
	 * of a paragraph nobody wrote the rest of — and the answer changes what the
	 * next twenty minutes are: reading a chart for the first time and returning
	 * to one for the fifth are different jobs.
	 */
	const met = describeAcquaintance(mission.playedBefore);
	return {
		kind: 'mission',
		title: 'Mission',
		instruction: `${mission.chartName} · ${mission.keyCenter} · ${mission.groove} · ≥${mission.bpmFloor} BPM.${met}${climbing}${constraint}`,
		goal: missionGoal(chart, mission),
		mission
	};
}

/**
 * How well you already know this tune, in the words a person would use.
 *
 * Nothing at all when the count is missing, which is what an old stored mission
 * looks like: silence is honest there and "first time" would not be.
 */
export function describeAcquaintance(playedBefore: number | undefined): string {
	if (playedBefore === undefined) return '';
	if (playedBefore === 0) return ' First time on this tune.';
	if (playedBefore === 1) return ' Played once before.';
	return ` Played ${playedBefore} times before.`;
}

function newThingTask(novelty: Novelty): NewThingTask {
	return {
		kind: 'new_thing',
		title: 'One new thing',
		instruction: noveltyLine(novelty),
		goal: { kind: 'once' },
		novelty
	};
}

/**
 * What the new thing is, in the words the material already carries.
 *
 * The rung's own `teaches`, the progression's own `describes`, the groove's own
 * `notes` — written once, for someone meeting the thing for the first time, and
 * not worth writing a second time here in slightly different words.
 */
function noveltyLine(novelty: Novelty): string {
	switch (novelty.kind) {
		case 'rung': {
			const rung = rungById(novelty.rungId);
			return rung
				? `${rung.label}, in ${novelty.key}. ${rung.teaches} ${rung.instruction}`
				: `Something new in ${novelty.key}.`;
		}
		case 'progression': {
			const progression = PROGRESSIONS.find((p) => p.id === novelty.progressionId);
			return progression
				? `${progression.name} in ${novelty.keyCenter}. ${progression.describes} ${progression.listenFor}`
				: `A new progression in ${novelty.keyCenter}.`;
		}
		case 'groove': {
			const groove = GROOVES.find((g) => g.id === novelty.groove);
			return groove
				? `New groove · ${groove.name}. ${groove.notes}`
				: 'A rhythm section you have not played over.';
		}
	}
}

/**
 * The order of the kinds, by size.
 *
 * There are three drill-room questions now rather than two, and the sizes
 * deliberately did not all grow to fit. A workout that gains a task because the
 * app gained a feature is the app spending somebody else's morning.
 *
 * So: **short** rotates through the three, one a day. **Standard** keeps its
 * four and alternates the middle slot between the degrees and the key question —
 * they are siblings, both asking where a sound sits rather than what it is, and
 * every other day is often enough for either. **Long** is the one that grew, to
 * six, because asking for the long workout is asking for all of it.
 *
 * The mission and the new thing survive at every size, since a short day that
 * never plays with anyone and never meets anything is not a short workout, it
 * is a shrug.
 */
function slotsFor(size: WorkoutSize, day: number): TaskKind[] {
	switch (size) {
		case 'short':
			return [DRILLS[day % DRILLS.length], 'mission', 'new_thing'];
		case 'standard':
			return ['ear', day % 2 === 0 ? 'function' : 'crossing', 'mission', 'new_thing'];
		case 'long':
			return ['ear', 'function', 'crossing', 'mission', 'new_thing', 'mission'];
	}
}

/** The three question kinds a short day rotates between. */
const DRILLS: TaskKind[] = ['ear', 'function', 'crossing'];

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

/**
 * Compose today's workout.
 *
 * Deterministic in the date and the inputs: the same state on the same day
 * composes the identical workout, and the next day's genuinely differs. Nothing
 * here reads a clock, a database or a keyboard, so all of that is provable
 * without any of them.
 *
 * A slot that cannot be built falls through rather than leaving a hole — ear to
 * function to mission and back round, so a slot is filled by whatever else there
 * is before it is given up on.
 *
 * The mission used to be the end of every fallthrough, on the grounds that it
 * was always buildable because the built-in charts are always there. It is not
 * any more, and deliberately: a chart nobody has been taught the chords of is
 * worse than no chart. On the first day of an account — one rung, seven notes,
 * no chord shape at all — the drill room has one task in it and no tune is
 * playable, so the workout is genuinely two tasks long and nothing can honestly
 * make it four.
 *
 * It therefore says so rather than padding. `missionHeld` names the nearest tune
 * and what it is waiting for, the size picker counts the tasks that were
 * actually composed, and by the second rung there is a play-along. A count that
 * is true is worth more than a count that is round.
 */
export function composeWorkout(input: WorkoutInput): Workout {
	const now = input.now ?? new Date();
	const day = dayNumber(now);
	const size = input.size ?? 'standard';
	const coldSpots = input.coldSpots ?? [];
	const choice = input.choice ?? null;

	const reachedKeys = [...new Set(input.reached.map((r) => r.key))];
	const coldKeys = coldestKeys(reachedKeys, coldSpots);

	// A pinned choice takes its key with it, whether or not the ladder has been
	// there — exploring is not the same as advancing, and a key you deliberately
	// chose is never silently ignored. Otherwise the day picks one.
	const keyCenter = choice
		? choice.kind === 'rung'
			? choice.key
			: choice.keyCenter
		: chooseKeyCenter(reachedKeys, coldSpots, day);

	const pinnedSkill = choice
		? choice.kind === 'rung'
			? rungSkillCode(choice.rungId)
			: progressionSkillCode(choice.progressionId)
		: null;
	const novelty = chooseNovelty({
		keyCenter,
		nextCell: input.nextCell ?? null,
		playedProgressions: input.played?.progressions ?? [],
		playedGrooves: input.played?.grooves ?? [],
		rungLooksSolid: input.rungLooksSolid ?? false,
		yesterday: input.yesterdaysNovelty ?? null,
		day
	});

	const charts = input.charts ?? MISSION_CHARTS;
	const chartBySlug = new Map(charts.map((c) => [c.slug, c]));
	const vocabulary = input.vocabulary ?? emptyVocabulary();

	// Two queues, one bank, partitioned by direction — so nothing is asked twice
	// without either queue having to know the other exists.
	const ear = earTask(earQueue(input.cards, { now, day, coldKeys, pinnedSkill }), input.cards);
	const fn = functionTask(
		functionQueue(input.cards, { now, day, coldKeys, pinnedSkill, keyCenter }),
		input.cards
	);
	const crossing = crossingTask(crossingQueue(input.cards, { now, day, coldKeys }), input.cards);

	let missionsBuilt = 0;
	/*
	 * Missions already set, as tune-and-key.
	 *
	 * A long workout asks for two, and early on the ready pool can hold one tune —
	 * on an account two rungs old it holds exactly one. `composeMission` cycles
	 * its pool with `nth % length`, so the second ask comes back with the same
	 * chart, and with only one key reached it comes back in the same key too. Two
	 * identical tasks is not a longer workout, so the second is refused and the
	 * slot falls through to the drill room like any other slot that cannot be
	 * built.
	 */
	const missionsSet = new Set<string>();
	const nextMission = (): MissionTask | null => {
		const mission = composeMission({
			charts,
			vocabulary,
			keyCenter,
			coldKeys,
			coldSpots,
			ladders: input.ladders ?? {},
			plays: input.plays ?? {},
			day,
			nth: missionsBuilt
		});
		if (!mission) return null;

		const already = `${mission.chartSlug} ${mission.keyCenter}`;
		if (missionsSet.has(already)) return null;
		missionsSet.add(already);

		missionsBuilt++;
		return missionTask(mission, chartBySlug.get(mission.chartSlug));
	};

	// A drill task is built once and handed out once. Without this a fallthrough
	// would satisfy two slots with the same task and quietly make a workout of
	// four tasks into three.
	const spent = new Set<Task>();
	const take = (task: Task | null): Task | null => {
		if (!task || spent.has(task)) return null;
		spent.add(task);
		return task;
	};

	const tasks: Task[] = [];
	for (const slot of slotsFor(size, day)) {
		// Falling through in this order and no other: the ear and the function are
		// the questions nothing else in the app can pose, and the mission is the
		// one that can always be posed.
		const built =
			slot === 'ear'
				? (take(ear) ?? take(fn) ?? take(crossing) ?? nextMission())
				: slot === 'function'
					? (take(fn) ?? take(crossing) ?? take(ear) ?? nextMission())
					: slot === 'crossing'
						? (take(crossing) ?? take(fn) ?? take(ear) ?? nextMission())
						: slot === 'new_thing'
							? novelty
								? newThingTask(novelty)
								: (nextMission() ?? take(ear) ?? take(fn) ?? take(crossing))
							: (nextMission() ?? take(ear) ?? take(fn) ?? take(crossing));

		if (built) tasks.push(built);
	}

	return {
		version: 2,
		day,
		size,
		keyCenter,
		tasks,
		choice,
		coldSpots,
		novelty,
		// Only worth saying when a slot actually wanted one and could not have it.
		missionHeld: missionsBuilt === 0 ? heldBack(charts, vocabulary) : null
	};
}

/**
 * The nearest tune that is not ready yet, and what it is waiting for.
 *
 * Nearest by `reachOf`, which is the same ordering `composeMission` picks from,
 * so the tune named here is the one that will actually turn up first. Null when
 * there is no chart list at all, which is a state no real caller is in.
 */
function heldBack(charts: MissionChart[], vocabulary: Vocabulary): MissionHeld | null {
	const nearest = [...charts].sort(
		(a, b) => reachOf(a.demand) - reachOf(b.demand) || a.slug.localeCompare(b.slug)
	)[0];
	if (!nearest) return null;

	const gap = shortfall(nearest.demand, vocabulary);
	return {
		chartSlug: nearest.slug,
		chartName: nearest.name,
		needs: describeShortfall(gap),
		teaches: taughtBy(gap)
	};
}
