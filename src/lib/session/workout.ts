import { GROOVES, type Groove } from '$lib/audio/groove';
import { CHARTS, type ChartCategory } from '$lib/curriculum/charts';
import { nextPosition, positionOf, rungById, type RungId } from '$lib/curriculum/ladder';
import { PROGRESSIONS } from '$lib/curriculum/progressions';
import { progressionSkillCode, rungSkillCode } from '$lib/curriculum/cards';
import type { ChordQuality } from '$lib/music/chord';
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
 * *is* the chart, under a constraint, with a goal. The goal evaluator arrives in
 * a later phase; everything the drill room asks is here.
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

export const TASK_COUNT: Record<WorkoutSize, number> = { short: 3, standard: 4, long: 5 };

export type TaskKind = 'ear' | 'function' | 'mission' | 'new_thing';

/**
 * The end of a task, expressed as something that can be met.
 *
 * Timers may still bound a task from above; nothing ends because of one. Each
 * variant is a question a later phase can answer from rows — how many were
 * asked, what the run's attempts add up to — rather than from an estimate.
 */
export type Goal =
	/** Ear and function: a fixed number of questions. */
	| { kind: 'questions'; count: number }
	/** A mission judged on guide tones, as a percentage over a number of choruses. */
	| { kind: 'guide_tones'; percent: number; choruses: number }
	/** A mission judged on getting round the form at all. */
	| { kind: 'choruses'; count: number }
	/** One new thing: shown once, tried once. */
	| { kind: 'once' };

/** The goal in a line, for showing it while the task runs. */
export function describeGoal(goal: Goal): string {
	switch (goal.kind) {
		case 'questions':
			return `${goal.count} questions.`;
		case 'guide_tones':
			return `Land ${goal.percent}% of the guide tones over ${goal.choruses} ${
				goal.choruses === 1 ? 'chorus' : 'choruses'
			}.`;
		case 'choruses':
			return goal.count === 1 ? 'All the way round, once.' : `${goal.count} times round.`;
		case 'once':
			return 'Once through. Nothing is being counted.';
	}
}

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

type TaskBase = {
	title: string;
	/** One line saying what to do, shown while the task runs. */
	instruction: string;
	goal: Goal;
};

export type EarTask = TaskBase & { kind: 'ear'; cardIds: string[] };
export type FunctionTask = TaskBase & { kind: 'function'; cardIds: string[] };
export type MissionTask = TaskBase & { kind: 'mission'; mission: Mission };
export type NewThingTask = TaskBase & { kind: 'new_thing'; novelty: Novelty };

export type Task = EarTask | FunctionTask | MissionTask | NewThingTask;

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
};

export type WorkoutInput = {
	size?: WorkoutSize;
	/** Everything with a schedule, due or not. */
	cards: Schedulable[];
	/** Everywhere the ladder has been: `reachedSoFar(position)`. */
	reached: Array<{ key: string; rungId: RungId }>;
	/** The record's cold spots. Empty is a fair answer on a first workout. */
	coldSpots?: ColdSpot[];
	/** Yesterday's novelty, by `noveltyId`. */
	yesterdaysNovelty?: string | null;
	choice?: Choice | null;
	/** Charts available to a mission. The built-ins when the caller says nothing. */
	charts?: MissionChart[];
	/**
	 * What the record already shows played, for the novelty slot.
	 *
	 * The plan lists the composer's inputs without this one, and the novelty slot
	 * cannot be honest without it: "a groove never yet played over" is not a
	 * question the due pile or the ladder can answer. Absent, everything counts
	 * as new, which is true of a first workout and harmless after.
	 */
	played?: { progressions?: string[]; grooves?: Groove[] };
	/** Whether the current rung looks solid, so the slot can say "ready to move on". */
	rungLooksSolid?: boolean;
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
 * The guide-tone threshold, and it is a first guess.
 *
 * The plan says as much: tune it against the record once missions produce rows,
 * not against theory. It lives here alone so that tuning is one edit.
 */
const GUIDE_TONE_TARGET = 70;

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
	const lanes = keyOrder.map((key) => byKey.get(key)!);

	const spread: Schedulable[] = [];
	const deepest = Math.max(...lanes.map((lane) => lane.length));
	for (let depth = 0; depth < deepest; depth++) {
		for (const lane of lanes) if (lane[depth]) spread.push(lane[depth]);
	}
	return spread;
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
	keyCenter: string;
	coldKeys: string[];
	coldSpots: ColdSpot[];
	day: number;
	nth: number;
}): Mission | null {
	if (input.charts.length === 0) return null;

	// The coldest quality steers which form is offered, where it has a home.
	const coldest = [...input.coldSpots].sort((a, b) => a.attempts - b.attempts)[0] ?? null;
	const wantedStyle = coldest ? QUALITY_HOME[coldest.quality] : undefined;
	const steeredSlugs = new Set(
		wantedStyle ? input.charts.filter((c) => c.style === wantedStyle).map((c) => c.slug) : []
	);

	// Rotated in two halves rather than as one list, or the day's rotation would
	// walk straight past the charts the cold quality just steered towards.
	// `nth` then indexes rather than re-seeds, so a long workout's second mission
	// is the next chart along and never the first one again.
	const pool = [
		...rotate(
			input.charts.filter((c) => steeredSlugs.has(c.slug)),
			input.day
		),
		...rotate(
			input.charts.filter((c) => !steeredSlugs.has(c.slug)),
			input.day
		)
	];
	const chart = pool[input.nth % pool.length];

	// A second mission goes somewhere else, so a long workout is not the same
	// tune twice in a row in the same key.
	const keys = input.coldKeys.length ? input.coldKeys : [input.keyCenter];
	const keyCenter = input.nth === 0 ? input.keyCenter : rotate(keys, input.day + input.nth)[0];

	return {
		chartSlug: chart.slug,
		chartName: chart.name,
		keyCenter,
		bpmFloor: chart.defaultBpm,
		groove: chart.defaultGroove,
		choruses: MISSION_CHORUSES,
		// Every third day the roots are taken away. Often enough to be a habit,
		// rarely enough that it still reads as a constraint rather than the rules.
		rootless: (input.day + input.nth) % 3 === 2,
		coldSpot: coldest
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
	reached: Array<{ key: string; rungId: RungId }>;
	keyCenter: string;
	playedProgressions: string[];
	playedGrooves: Groove[];
	rungLooksSolid: boolean;
	yesterday: string | null;
	day: number;
}): Novelty | null {
	const frontier = input.reached[input.reached.length - 1];
	const position = frontier ? positionOf(frontier.key, frontier.rungId) : null;
	const next = position ? nextPosition(position) : null;
	const nextRung: Novelty | null = next
		? { kind: 'rung', key: next.stage.key, rungId: next.rung.id }
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

function earTask(cardIds: string[]): EarTask | null {
	if (cardIds.length === 0) return null;
	return {
		kind: 'ear',
		title: 'Ear',
		instruction: `${cardIds.length} of them. Listen, then play it back or name it. Nothing here needs the screen.`,
		goal: { kind: 'questions', count: cardIds.length },
		cardIds
	};
}

function functionTask(cardIds: string[]): FunctionTask | null {
	if (cardIds.length === 0) return null;
	return {
		kind: 'function',
		title: 'The function',
		instruction: `${cardIds.length} of them, and the key moves under you. Numbers, not symbols: play the chord the degree asks for, then name what you played.`,
		goal: { kind: 'questions', count: cardIds.length },
		cardIds
	};
}

function missionTask(mission: Mission, chart: MissionChart | undefined): MissionTask {
	const constraint = mission.rootless
		? ' Hands off the roots — chord tones only, thirds and sevenths doing the work.'
		: '';
	return {
		kind: 'mission',
		title: 'Mission',
		instruction: `${mission.chartName} in ${mission.keyCenter}, ${mission.groove} at ${mission.bpmFloor} or faster.${constraint}`,
		goal: missionGoal(chart, mission),
		mission
	};
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
				? `Play over a ${groove.name} for once. ${groove.notes}`
				: 'A rhythm section you have not played over.';
		}
	}
}

/**
 * The order of the kinds, by size.
 *
 * Standard is one of each, which is the shape the plan describes. Long adds a
 * second mission at the end, because the principle of the whole milestone is
 * that the band asks whatever the band can ask. Short drops one of the two
 * drill-room questions and alternates which — the mission and the new thing
 * both survive, since a short day that never plays with anyone and never meets
 * anything is not a short workout, it is a shrug.
 */
function slotsFor(size: WorkoutSize, day: number): TaskKind[] {
	switch (size) {
		case 'short':
			return [day % 2 === 0 ? 'ear' : 'function', 'mission', 'new_thing'];
		case 'standard':
			return ['ear', 'function', 'mission', 'new_thing'];
		case 'long':
			return ['ear', 'function', 'mission', 'new_thing', 'mission'];
	}
}

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
 * function to mission, ending at a mission, which is always buildable because
 * the built-in charts are always there. That is what makes the count on the
 * front of the workout a promise: three tasks means three tasks, on the first
 * day of a brand-new account with one rung reached and nothing in the record.
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
		reached: input.reached,
		keyCenter,
		playedProgressions: input.played?.progressions ?? [],
		playedGrooves: input.played?.grooves ?? [],
		rungLooksSolid: input.rungLooksSolid ?? false,
		yesterday: input.yesterdaysNovelty ?? null,
		day
	});

	const charts = input.charts ?? CHARTS;
	const chartBySlug = new Map(charts.map((c) => [c.slug, c]));

	// Two queues, one bank, partitioned by direction — so nothing is asked twice
	// without either queue having to know the other exists.
	const ear = earTask(earQueue(input.cards, { now, day, coldKeys, pinnedSkill }));
	const fn = functionTask(
		functionQueue(input.cards, { now, day, coldKeys, pinnedSkill, keyCenter })
	);

	let missionsBuilt = 0;
	const nextMission = (): MissionTask | null => {
		const mission = composeMission({
			charts,
			keyCenter,
			coldKeys,
			coldSpots,
			day,
			nth: missionsBuilt
		});
		if (!mission) return null;
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
				? (take(ear) ?? take(fn) ?? nextMission())
				: slot === 'function'
					? (take(fn) ?? take(ear) ?? nextMission())
					: slot === 'new_thing'
						? novelty
							? newThingTask(novelty)
							: nextMission()
						: nextMission();

		if (built) tasks.push(built);
	}

	return { version: 2, day, size, keyCenter, tasks, choice, coldSpots, novelty };
}
