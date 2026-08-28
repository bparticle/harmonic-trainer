import {
	RUNGS,
	STAGES,
	rungById,
	stageIndex,
	type Position,
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
 *   - **A window on the ladder.** A few steps behind, where you are, a few
 *     ahead. Not all eighty-four: the full grid is still one press away in the
 *     library below, and a path you can read in a glance is worth more on the
 *     page you open at eight in the morning than a complete one you have to
 *     study. Each step behind carries what the record actually holds for it,
 *     so "done" is a count of questions answered and not a tick somebody drew.
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
// The window
// ---------------------------------------------------------------------------

/** What the record holds for one rung in one key, as the query hands it over. */
export type RungRecord = { key: string; rungId: string; reviews: number; correct: number };

/** Where a step sits relative to where you are standing. */
export type StepState = 'done' | 'here' | 'ahead';

export type PathStep = {
	key: string;
	rungId: RungId;
	label: string;
	teaches: string;
	/** Position in the whole ladder, from one, so a step can say where it is. */
	ordinal: number;
	stageIndex: number;
	rungIndex: number;
	state: StepState;
	/** True where this step is a key's first rung, so the strip can mark the seam. */
	opensKey: boolean;
	reviews: number;
	correct: number;
	/** Reached, but nothing has ever been asked here. Not the same as failed. */
	untouched: boolean;
	solid: boolean;
};

/** How many steps the ladder has in total. Twelve keys of seven. */
export const LADDER_LENGTH = STAGES.length * RUNGS.length;

/** A step's place in the whole ladder, from one. */
export const ordinalOf = (stage: number, rung: number) => stage * RUNGS.length + rung + 1;

const recordKey = (key: string, rungId: string) => `${key}|${rungId}`;

/**
 * The steps around where you are standing.
 *
 * `behind` and `ahead` are counts of steps and not of keys, so the window
 * crosses from the end of one key into the start of the next exactly as walking
 * the ladder does — and `opensKey` marks where that happened, because "G · the
 * scale" arriving after "C · the relative minor" is the single most important
 * thing this strip has to say and it should not be left to the reader to spot.
 *
 * Clamped at both ends rather than padded. On the first morning of an account
 * there is nothing behind you, and drawing empty slots to keep the shape
 * rectangular would be inventing a past.
 */
export function pathWindow(
	position: Position,
	records: RungRecord[] = [],
	window: { behind?: number; ahead?: number } = {}
): PathStep[] {
	const behind = window.behind ?? 2;
	const ahead = window.ahead ?? 3;

	const held = new Map(records.map((row) => [recordKey(row.key, row.rungId), row]));
	const here = ordinalOf(position.stageIndex, position.rungIndex);
	const from = Math.max(1, here - behind);
	const to = Math.min(LADDER_LENGTH, here + ahead);

	const steps: PathStep[] = [];
	for (let ordinal = from; ordinal <= to; ordinal++) {
		const si = Math.floor((ordinal - 1) / RUNGS.length);
		const ri = (ordinal - 1) % RUNGS.length;
		const stage = STAGES[si];
		const rung = RUNGS[ri];
		const row = held.get(recordKey(stage.key, rung.id));
		const reviews = row?.reviews ?? 0;
		const correct = row?.correct ?? 0;

		steps.push({
			key: stage.key,
			rungId: rung.id,
			label: rung.label,
			teaches: rung.teaches,
			ordinal,
			stageIndex: si,
			rungIndex: ri,
			state: ordinal < here ? 'done' : ordinal === here ? 'here' : 'ahead',
			opensKey: ri === 0,
			reviews,
			correct,
			untouched: ordinal <= here && reviews === 0,
			solid: looksSolid(rung, reviews, correct)
		});
	}

	return steps;
}

/** Where the ladder has got to, as a step out of eighty-four. */
export function journeyProgress(position: Position) {
	const step = ordinalOf(position.stageIndex, position.rungIndex);
	return { step, total: LADDER_LENGTH, fill: step / LADDER_LENGTH };
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
