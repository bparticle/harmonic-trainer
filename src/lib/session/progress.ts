import { progressionById } from '$lib/curriculum/progressions';
import { rungById, stageByKey } from '$lib/curriculum/ladder';
import { describeGoal } from '$lib/practice/goal';
import type { WorkoutBlockType } from '$lib/server/db/schema';
import { skillLabel } from '$lib/curriculum/cards';
import {
	TASK_COUNT,
	type Choice,
	type Makeup,
	type Task,
	type TaskKind,
	type Workout,
	type WorkoutSize
} from './workout';

/**
 * Where a workout is up to.
 *
 * `workout.ts` composes; this reads one back. Between them sits a stored row and
 * a handful of blocks, and everything about turning those into "task three, and
 * the first two are done" lives here — pure, so the answer can be checked
 * without a database, which is the same reason `composeWorkout` takes its inputs
 * rather than fetching them.
 *
 * Three things are decided here rather than in the store, because each is a
 * judgement rather than a query:
 *
 *   - **A block names its task by kind and position.** `session_blocks` is keyed
 *     by session and type, and a long workout holds two missions, so the kind
 *     alone cannot say which one finished. The position can, and the kind stays
 *     in the name so a row read on its own still says what it was.
 *   - **A v1 session is not a workout.** `plan_json` held six blocks before it
 *     held tasks, and an unfinished one found on upgrade is left exactly where it
 *     lies — never resumed, never migrated, its finished blocks still counted by
 *     the profile. `isWorkout` is the whole of that decision: a plan that is not
 *     a v2 workout is not something this code will hydrate, so the home page
 *     offers a fresh workout and the old row keeps its null `ended_at` forever.
 *   - **Done is what the rows say.** A task is finished when its block has an
 *     `ended_at`, and nothing here is allowed a second opinion — a mission's
 *     block is ended by the run that met its goal, half a milestone away in
 *     `saveFlush`, and this has to agree with that by reading it rather than by
 *     re-deciding it.
 */

// ---------------------------------------------------------------------------
// Naming a task's block
// ---------------------------------------------------------------------------

/** The `block_type` a task's row carries: what it was, and which one it was. */
export function taskBlockType(kind: TaskKind, index: number): WorkoutBlockType {
	return `${kind}_${index}`;
}

/**
 * The task a block belongs to, or null when it belongs to none.
 *
 * Null for every one of the six original block types, which is what keeps a v1
 * session's rows from being read as a workout's. Split from the right, because
 * `new_thing` has an underscore of its own.
 */
export function taskIndexOf(blockType: string): number | null {
	const at = blockType.lastIndexOf('_');
	if (at <= 0) return null;

	const kind = blockType.slice(0, at);
	if (!KINDS.has(kind)) return null;

	// Digits and nothing else. `Number('')` is zero, which would read `mission_`
	// as the first task rather than as the nonsense it is.
	const position = blockType.slice(at + 1);
	if (!/^\d+$/.test(position)) return null;
	return Number(position);
}

const KINDS = new Set<string>(['ear', 'function', 'crossing', 'mission', 'new_thing']);

// ---------------------------------------------------------------------------
// Reading a stored plan
// ---------------------------------------------------------------------------

/**
 * Is this stored plan a workout?
 *
 * Structural, and deliberately shallow: the version and a list of tasks, which
 * is everything needed to tell a workout from the six-block plan that used to
 * live in the same column. Anything deeper would be this module deciding whether
 * a workout it composed itself is well formed, which is not a question a reader
 * gets to ask.
 */
export function isWorkout(plan: unknown): plan is Workout {
	if (typeof plan !== 'object' || plan === null) return false;
	const value = plan as Record<string, unknown>;
	return value.version === 2 && Array.isArray(value.tasks);
}

export type TaskProgress = {
	index: number;
	task: Task;
	/** The row recording it, once the task has actually been begun. */
	blockId: string | null;
	finished: boolean;
	/** What the block recorded: a mission's verdict, a drill's count. */
	result: unknown;
};

export type ActiveWorkout = {
	id: string;
	startedAt: Date;
	workout: Workout;
	tasks: TaskProgress[];
	/** The first unfinished task, or the count when there is none. */
	resumeAt: number;
	/** Every task finished. The workout is over; the day is not. */
	complete: boolean;
};

export type StoredSession = {
	id: string;
	startedAt: Date;
	planJson: unknown;
};

export type StoredBlock = {
	id: string;
	blockType: string;
	endedAt: Date | null;
	resultJson: unknown;
};

/**
 * A stored session and its blocks, as a workout in progress.
 *
 * Null when the plan is not a workout — the v1 rule, applied at the one place a
 * stored plan is read, so no caller has to remember it.
 *
 * A block naming a task the plan does not have is ignored rather than trusted.
 * That cannot happen today; it would be the shape of a bug on the day a workout
 * is composed twice under one session id, and quietly ignoring it is better than
 * indexing past the end of the task list.
 */
export function hydrateWorkout(row: StoredSession, blocks: StoredBlock[]): ActiveWorkout | null {
	if (!isWorkout(row.planJson)) return null;
	const workout = row.planJson;

	const byIndex = new Map<number, StoredBlock>();
	for (const block of blocks) {
		const index = taskIndexOf(block.blockType);
		if (index === null || index >= workout.tasks.length) continue;
		byIndex.set(index, block);
	}

	const tasks: TaskProgress[] = workout.tasks.map((task, index) => {
		const block = byIndex.get(index);
		return {
			index,
			task,
			blockId: block?.id ?? null,
			finished: Boolean(block?.endedAt),
			result: block?.resultJson ?? null
		};
	});

	const resumeAt = tasks.findIndex((entry) => !entry.finished);
	return {
		id: row.id,
		startedAt: row.startedAt,
		workout,
		tasks,
		resumeAt: resumeAt === -1 ? tasks.length : resumeAt,
		complete: resumeAt === -1 && tasks.length > 0
	};
}

// ---------------------------------------------------------------------------
// Previewing one
// ---------------------------------------------------------------------------

export type TaskPreview = {
	kind: TaskKind;
	title: string;
	line: string;
	/**
	 * Two or three words each, saying where this task's material came from.
	 *
	 * Separate from `line` because they are drawn separately — a line is a
	 * sentence and these are labels — and because a task with nothing to say
	 * about its own provenance hands back an empty list rather than a sentence
	 * with a hole in it. That is the case for every workout composed before
	 * `Makeup` existed, and for the new thing, which is new by definition.
	 */
	tags: string[];
};

/**
 * Today's tasks, in one line each, for the home page.
 *
 * The block preview it replaces showed six durations, which were an estimate of
 * an estimate: the minutes never ended a block and the blocks never varied. A
 * task can be previewed honestly because a task is countable — ten questions,
 * eight degrees, a tune and a bar to clear — and every line here comes from the
 * goal the task will actually be judged against.
 *
 * The mission's key is deliberately left out. A pinned choice moves it and the
 * preview is composed before anything is pinned, so naming a key here would be
 * the one line on the page that goes stale the moment the picker is touched.
 * Everything else — the chart, the count, the bar — is the same whatever gets
 * chosen.
 */
export function previewTasks(workout: Workout): TaskPreview[] {
	return workout.tasks.map((task) => ({
		kind: task.kind,
		title: task.title,
		line: previewLine(task),
		tags: taskTags(task)
	}));
}

function previewLine(task: Task): string {
	switch (task.kind) {
		case 'ear':
			return joinLine(`${task.cardIds.length} ear questions`, describeMaterial(task.makeup));
		case 'function':
			return joinLine(`${task.cardIds.length} degrees across keys`, describeMaterial(task.makeup));
		case 'crossing':
			// The keys are the answer, so `describeMaterial` must not name them —
			// a preview that lists C, G and F has given away three of six.
			return `${task.cardIds.length} questions · where the music is, and where it went`;
		case 'mission':
			return `${task.mission.chartName}. ${describeGoal(task.goal)}`;
		case 'new_thing':
			return task.instruction.split('. ')[0];
	}
}

const joinLine = (head: string, tail: string) => (tail ? `${head} · ${tail}` : head);

// ---------------------------------------------------------------------------
// Saying what a task is made of
// ---------------------------------------------------------------------------

/**
 * The material a drill task draws on, named rather than counted.
 *
 * Keys and topics, in the order the questions first reach them. Both are capped
 * at three and then say how many more there were, because the point of the line
 * is to be read at a glance and "C, G, F and 4 more" tells you the shape of the
 * thing while a list of seven does not.
 *
 * Empty for a task with no makeup recorded — an old stored workout — so every
 * caller falls back to the line it always printed rather than to a wrong one.
 */
export function describeMaterial(makeup: Makeup | undefined): string {
	if (!makeup) return '';
	const parts: string[] = [];
	const keys = nameSome(makeup.keys.map(glyph));
	if (keys) parts.push(keys);
	const topics = nameSome(
		makeup.skills.map(skillLabel).filter((label): label is string => Boolean(label))
	);
	if (topics) parts.push(topics.toLowerCase());
	return parts.join(' · ');
}

const NAMED = 3;

function nameSome(items: string[]): string {
	if (items.length === 0) return '';
	if (items.length <= NAMED) return items.join(', ');
	return `${items.slice(0, NAMED).join(', ')} +${items.length - NAMED}`;
}

const glyph = (name: string) => name.replace(/b/g, '♭').replace(/#/g, '♯');

/**
 * The chips beside a task: what is new here, and what is coming round again.
 *
 * The complaint these answer is *what's repeated, what's new*, and the honest
 * answer is a count of questions rather than an adjective. A task that is all
 * one or all the other says so in one chip; a mixture gets two, in that order,
 * because the new material is the part somebody wants warning of.
 *
 * The new thing gets no chip at all. Its title is *One new thing* and the task
 * is defined by being new — a chip saying `1 new` beside it would be the page
 * explaining a word it just used.
 */
export function taskTags(task: Task): string[] {
	switch (task.kind) {
		case 'ear':
		case 'function':
			return makeupTags(task.makeup);
		case 'crossing':
			// How many keys it draws on, which is the size of the discrimination —
			// but never which keys, for the reason `previewLine` gives above.
			return crossingTags(task.makeup);
		case 'mission':
			return missionTags(task.mission.playedBefore);
		case 'new_thing':
			return [];
	}
}

function makeupTags(makeup: Makeup | undefined): string[] {
	if (!makeup || makeup.fresh + makeup.seen === 0) return [];
	if (makeup.seen === 0) return ['all new'];
	if (makeup.fresh === 0) return ['all revision'];
	return [`${makeup.fresh} new`, `${makeup.seen} again`];
}

function crossingTags(makeup: Makeup | undefined): string[] {
	if (!makeup || makeup.keys.length === 0) return [];
	return [makeup.keys.length === 1 ? 'one key' : `${makeup.keys.length} keys`];
}

function missionTags(playedBefore: number | undefined): string[] {
	if (playedBefore === undefined) return [];
	if (playedBefore === 0) return ['first time'];
	return [`played ${playedBefore}×`];
}

// ---------------------------------------------------------------------------
// What the picker asked for
// ---------------------------------------------------------------------------

/**
 * The three sizes, and what a form is allowed to say.
 *
 * Nothing is inferred from a number of minutes any more, so an unrecognised size
 * is a standard workout rather than an error: the picker is the only thing that
 * sends this, and a query that has been fiddled with should still get a workout.
 */
export function readSize(raw: unknown): WorkoutSize {
	return raw === 'short' || raw === 'standard' || raw === 'long' ? raw : 'standard';
}

/**
 * The size a saved length preference means.
 *
 * A bridge and not a conversion. `sessionLengthMinutes` is what the settings
 * screen has always stored, and until it stops existing the honest reading of
 * "I like short sessions" is "I want the short workout". Minutes are not
 * consulted for anything else: nothing in a workout is timed.
 */
export function sizeFromMinutes(minutes: number): WorkoutSize {
	if (minutes <= 10) return 'short';
	return minutes >= 35 ? 'long' : 'standard';
}

export type ChoiceRequest = {
	progressionId?: string | null;
	progressionKey?: string | null;
	focusKey?: string | null;
	focusRung?: string | null;
};

/**
 * What the home picker pinned, if it named anything real.
 *
 * The same four fields the picker has always posted, read into the composer's
 * `Choice`. Nothing is checked against how far the ladder has got, because the
 * ladder has never gated anything: a rung eight keys ahead is a legitimate thing
 * to ask for and the workout is built around it exactly as if it were the next
 * step. What *is* checked is that the key and the rung exist, since material
 * cannot be generated for a place that does not.
 *
 * A progression with no key named takes the one passed in — wherever the ladder
 * happens to be — which is what the old session did and what the picker's own
 * default expects.
 */
export function readChoice(request: ChoiceRequest, fallbackKey: string): Choice | null {
	if (request.progressionId && progressionById(request.progressionId)) {
		return {
			kind: 'progression',
			progressionId: request.progressionId,
			keyCenter: request.progressionKey || fallbackKey
		};
	}

	if (request.focusKey && request.focusRung) {
		const stage = stageByKey(request.focusKey);
		const rung = rungById(request.focusRung);
		if (stage && rung) return { kind: 'rung', key: stage.key, rungId: rung.id };
	}

	return null;
}

/** How many tasks a size promises. Re-exported so a caller needs one import. */
export { TASK_COUNT };
