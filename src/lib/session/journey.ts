import {
	RUNGS,
	STAGES,
	depthOf,
	rungById,
	stageIndex,
	type Frontier,
	type Rung,
	type RungId
} from '$lib/curriculum/ladder';

/**
 * The road behind you and the road ahead, as one readable line.
 *
 * The home page has always *held* the whole ladder — twelve keys, seven rungs
 * each, every one of them startable — but it held it folded away behind a
 * summary that said "choose something else", which is a filing cabinet rather
 * than a path. Somebody opening the app most days could not see that they had
 * been anywhere or that there was anywhere to go: the same key, the same rung,
 * the same four tasks, and no line connecting today to last Tuesday. That is
 * not a scheduling bug, and none of the scheduling was wrong. It is that the
 * record was never shown.
 *
 * So two things live here, and both are readings of rows rather than new
 * measurements:
 *
 *   - **The frontier, as seven rows.** One per rung, each carrying how many keys
 *     it is open in and what the record holds across all of them. This was a
 *     sliding window over a single walk while the ladder was one; a frontier
 *     moves in two directions at once and the honest picture of it is the
 *     staircase itself, so "open" is a count of questions answered in a count of
 *     keys, and not a tick somebody drew.
 *   - **What the last few days were made of.** Titles of tasks, in the key they
 *     were in, on the day they happened. Nothing here is a streak and nothing
 *     here can fall while you are away from the piano — the same rule the twelve
 *     key swatches already keep.
 *
 * Pure, and deliberately so: the store counts, this decides what the counts
 * mean, and the page draws it. Which means the whole of "am I making progress"
 * can be checked without a database.
 */

// ---------------------------------------------------------------------------
// Is this rung solid?
// ---------------------------------------------------------------------------

/**
 * Enough questions, answered well enough, that the rung has stopped being new.
 *
 * The one place this rule is written. `rungProgress` asks it about the rung you
 * are standing on and the path asks it about every rung behind you, and those
 * two had better agree — a step drawn as solid on the path and a "move on"
 * button that will not light up would be the page arguing with itself.
 *
 * Never a gate. Nothing in this app refuses to let you go on, and this number
 * exists only so that the suggestion arrives at a sensible moment.
 */
export function looksSolid(rung: Rung, reviews: number, correct: number): boolean {
	return reviews >= rung.suggestAfter && reviews > 0 && correct / reviews >= 0.8;
}

// ---------------------------------------------------------------------------
// The path
// ---------------------------------------------------------------------------

/** What the record holds for one rung in one key, as the query hands it over. */
export type RungRecord = { key: string; rungId: string; reviews: number; correct: number };

/** Where a rung sits relative to how deep the frontier goes. */
export type StepState = 'open' | 'here' | 'ahead';

export type PathStep = {
	rungId: RungId;
	label: string;
	teaches: string;
	rungIndex: number;
	/** How many keys this rung is open in. The breadth axis, per rung. */
	keys: number;
	/** Which keys, in the ladder's order, so the row can draw them. */
	keyNames: string[];
	state: StepState;
	/** Every review of this rung, across every key it is open in. */
	reviews: number;
	correct: number;
	/** Open, but nothing has ever been asked here. Not the same as failed. */
	untouched: boolean;
	solid: boolean;
};

/** How many cells the ladder has in total. Twelve keys of seven. */
export const LADDER_CELLS = STAGES.length * RUNGS.length;

const recordKey = (key: string, rungId: string) => `${key}|${rungId}`;

/**
 * The frontier as seven rows, one per rung.
 *
 * **This replaced a sliding window over a single walk, and the change is the
 * point.** A prefix had an obvious "here" and an obvious few steps either side
 * of it, so the path could be a line. A frontier does not: depth and breadth
 * move separately, and the honest picture of one is the staircase itself —
 * every rung, and how many keys it is open in.
 *
 * Seven rows is short enough to read at eight in the morning and is the whole
 * of the state rather than a view onto part of it, so nothing is hidden behind
 * a scroll. The rungs ahead are still listed, carrying their own `teaches` line,
 * because what comes next is the question this page is actually asked.
 *
 * The record on a row is summed across every key the rung is open in, which is
 * the number that answers "do I know this yet" — a rung met in four keys and
 * answered well in all of them is a different thing from one met in four and
 * answered well in one, and only a total can say so.
 */
export function ladderPath(frontier: Frontier, records: RungRecord[] = []): PathStep[] {
	const held = new Map(records.map((row) => [recordKey(row.key, row.rungId), row]));
	const depth = depthOf(frontier);

	return RUNGS.map((rung, rungIndex) => {
		const width = Math.min(frontier.widths[rungIndex] ?? 0, STAGES.length);
		const keyNames = STAGES.slice(0, width).map((stage) => stage.key);

		let reviews = 0;
		let correct = 0;
		for (const key of keyNames) {
			const row = held.get(recordKey(key, rung.id));
			reviews += row?.reviews ?? 0;
			correct += row?.correct ?? 0;
		}

		const state: StepState = width === 0 ? 'ahead' : rungIndex === depth - 1 ? 'here' : 'open';

		return {
			rungId: rung.id,
			label: rung.label,
			teaches: rung.teaches,
			rungIndex,
			keys: width,
			keyNames,
			state,
			reviews,
			correct,
			untouched: width > 0 && reviews === 0,
			solid: looksSolid(rung, reviews, correct)
		};
	});
}

/**
 * How much of the ladder is open, as cells out of eighty-four.
 *
 * Cells rather than steps, because a frontier is a set. The old number counted
 * position along one walk, which could only ever be one of eighty-four places;
 * this counts how much ground is actually open, and going one rung deeper moves
 * it by more than one because deepening widens.
 */
export function journeyProgress(frontier: Frontier) {
	const open = frontier.widths.reduce(
		(total, width) => total + Math.min(Math.max(width, 0), STAGES.length),
		0
	);
	return {
		cells: open,
		total: LADDER_CELLS,
		fill: open / LADDER_CELLS,
		depth: depthOf(frontier),
		rungs: RUNGS.length,
		/** The widest any rung is open. How many keys the ladder has been into. */
		keys: Math.min(frontier.widths[0] ?? 0, STAGES.length)
	};
}

/**
 * Everything the record has been asked, added up.
 *
 * One line under the path, and the only number on the home page that counts the
 * whole ladder at once. It can only ever go up, which is the test every number
 * on this page has to pass.
 */
export function ladderTotals(records: RungRecord[]) {
	const touched = records.filter((row) => row.reviews > 0);
	return {
		reviews: touched.reduce((total, row) => total + row.reviews, 0),
		correct: touched.reduce((total, row) => total + row.correct, 0),
		keys: new Set(touched.map((row) => row.key)).size,
		steps: touched.length
	};
}

// ---------------------------------------------------------------------------
// What the last few days were made of
// ---------------------------------------------------------------------------

/** One past workout, in the shape the strip draws it. */
export type PastWorkout = {
	id: string;
	startedAt: Date;
	keyCenter: string;
	/** Task titles in order, as the workout was composed. */
	titles: string[];
	finished: number;
	total: number;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

/**
 * When something happened, said the way a person would say it.
 *
 * Local midnights rather than a difference in hours, because "yesterday" is a
 * calendar word: something at eleven last night and something at one this
 * morning are two hours apart and two different days, and a reader who
 * practised both times knows that better than the arithmetic does.
 *
 * Nothing here is ever "3 days ago". A count of days since is the shape of a
 * reproach, and this strip exists to show what was done rather than what was
 * missed — so past the last two days it simply names the day.
 */
export function describeWhen(when: Date, now = new Date()): string {
	const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((midnight(now) - midnight(when)) / 86_400_000);

	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 7) return DAY_NAMES[when.getDay()];
	return `${when.getDate()} ${MONTH_NAMES[when.getMonth()]}`;
}

/**
 * The tasks of a past workout, said as a list without repeating itself.
 *
 * A long workout holds two missions and the honest way to print that is
 * "Mission ×2" rather than the word twice, which reads as a stutter in a line
 * three words long.
 */
export function describeTasks(titles: string[]): string {
	const counted: Array<{ title: string; n: number }> = [];
	for (const title of titles) {
		const last = counted[counted.length - 1];
		if (last?.title === title) last.n++;
		else counted.push({ title, n: 1 });
	}
	return counted.map(({ title, n }) => (n > 1 ? `${title} ×${n}` : title)).join(' · ');
}

/** The rung a skill code names, or null for a code that is not a rung's. */
export function rungOfSkill(code: string): RungId | null {
	if (!code.startsWith('rung:')) return null;
	return rungById(code.slice('rung:'.length))?.id ?? null;
}

/** Whether a key is one the ladder knows, for filtering rows read back. */
export const isLadderKey = (key: string) => stageIndex(key) >= 0;
