import { isGroove, type Groove } from '$lib/audio/groove';
import { barsCovered } from './form';
import { accuracy, add, coverage, emptyTally, type Attempt, type Landing } from './match';

/**
 * Was the goal met?
 *
 * `match.ts` next door answers "am I playing the chord that is sounding" one
 * chord at a time. This answers the question a mission asks over a whole run:
 * given the chords that were judged, did the goal happen, how close did it come,
 * and what should be said about it. Nothing here judges a note — every landing
 * it reads was decided by `judge`, and every percentage it quotes comes out of
 * `add`, `accuracy` and `coverage`. A second opinion about what counts as a
 * landed chord is the one thing this file must never grow.
 *
 * Pure, on the same terms as its neighbour: no database, no clock, no browser.
 * The input is the shape a judged chord is *recorded* in — `AttemptPayload` on
 * the way to the record and a `chord_attempts` row once it is there — so the
 * same verdict can be reached on the page the moment the transport stops and
 * again, months later, from the rows alone.
 *
 * ## Where the goal types live
 *
 * `Goal` and `describeGoal` were written in Phase 1 in `session/workout.ts` and
 * have moved here. The reason is a constraint rather than a preference: the page
 * that has to *show* a goal is `/backing`, and `/backing` must not import the
 * workout composer — a route pulling in the composer before the pages are
 * rebuilt would wire up half a milestone. Goals now hang off the module that
 * evaluates them, the composer imports them from here, and the dependency runs
 * one way: `workout.ts` → `goal.ts` → `match.ts`.
 */

// ---------------------------------------------------------------------------
// What a goal is
// ---------------------------------------------------------------------------

/**
 * The end of a task, expressed as something that can be met.
 *
 * Timers may still bound a task from above; nothing ends because of one. Each
 * variant is a question that can be answered from rows rather than from an
 * estimate — and for the two a mission uses, the rows are the chords it judged.
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
			return `${goal.count} questions`;
		case 'guide_tones':
			return `≥${goal.percent}% guide tones · ${goal.choruses} ${
				goal.choruses === 1 ? 'chorus' : 'choruses'
			}`;
		case 'choruses':
			return goal.count === 1 ? '1 full chorus' : `${goal.count} full choruses`;
		case 'once':
			return 'Try once';
	}
}

/**
 * The bar for a mission judged on guide tones, and the only place it lives.
 *
 * The plan first guessed 70%, and the record answered before a single mission
 * had been played: of 813 recorded attempts, **92% landed every guide tone**.
 * Across the seven runs long enough to mean anything the median run landed 93%,
 * the lower quartile 81%, and exactly one run in the whole record fell below
 * 70%. A 70% bar is therefore not a goal — it is a thing that happens anyway,
 * and a goal that cannot be missed teaches nothing and celebrates nothing.
 *
 * 85% is taken from the ROADMAP's recommendation, and the argument is the shape
 * of that distribution rather than a feeling about difficulty: it sits above the
 * lower quartile of *comfortable* playing and below its median, so a run in a
 * key you know and a tempo you like clears it and a mission — which is by
 * construction neither — has to reach for it.
 *
 * Two things about those numbers are worth carrying rather than forgetting, and
 * both argue against ever treating this as settled. All 813 attempts come from
 * two keys, C and A; the other ten have none at all. And tempo moves the rate
 * further than key does so far — the blues at 140 lands 69–81% while rhythm
 * changes at 100 lands 92–94%, in the same key. So if the first month of mission
 * rows clusters below this bar, **80 is the number the record already argues
 * for**, being the top of the only uncomfortable-conditions band it holds. That
 * is one edit, here, and nowhere else.
 *
 * The longer-term answer is not a different constant but a different shape,
 * which is why every `Verdict` carries the key, the tune and the tempo it was
 * reached in: a bar per context can be fitted to those rows, and a bar per
 * context is what this goal actually wants.
 */
export const GUIDE_TONE_TARGET = 85;

// ---------------------------------------------------------------------------
// What a goal is judged against
// ---------------------------------------------------------------------------

/**
 * One judged chord, in the shape it is recorded in.
 *
 * Structurally what `AttemptPayload` is and what a `chord_attempts` row is, so
 * neither has to be translated on the way in. Declared as its own type rather
 * than imported from either, because the evaluator is upstream of both: it
 * describes the least a chord has to say for itself to be judged.
 */
export type JudgedChord = {
	/** Bar of the form, not of the loop. This is what counts the choruses. */
	bar: number;
	landing: Landing;
	found: number;
	needed: number;
	notesChord: number;
	notesColour: number;
	notesOutside: number;
};

/**
 * The conditions a verdict was reached in.
 *
 * Carried on the verdict and stored with it, because the record's own numbers
 * say a single global percentage is the wrong shape for this goal: the rate
 * moves with the tune and the tempo more than it moves with the key. A verdict
 * that remembers all three can be grouped by any of them later; one that
 * remembers none can only ever move a constant for everybody.
 */
export type GoalContext = {
	chartSlug: string;
	/** The key the run was played in, as the record spells it: 'Bb', never 'B♭'. */
	keyCenter: string;
	bpm: number;
	/** The length of the form, which is what a chorus is measured against. */
	barsPerChorus: number;
};

/** What the run did, in the numbers the verdict was reached on. */
export type Measured = {
	/** Chord occurrences something was played over. Silence is not counted. */
	voiced: number;
	landed: number;
	/**
	 * Landed over voiced, or null before anything was played.
	 *
	 * This and not `coverage` is what a guide-tone goal is judged on, because it
	 * is the number every figure in the record's threshold argument is quoted in:
	 * "92% of attempts landed every guide tone" counts chords, not tones. Taking
	 * a bar from one distribution and then measuring a different one would be the
	 * exact mistake that section was written to correct.
	 */
	percent: number | null;
	/** The gentler per-guide-tone number. Reported, never the bar. */
	coverage: number | null;
	/** Bars of the form something was played over, across every pass. */
	barsCovered: number;
	/** Those bars as a share of the form. 2 is twice round; 1.5 is once and a half. */
	choruses: number;
};

/** What is still missing, in the goal's own terms. Both zero on a goal met. */
export type Shortfall = {
	/** Percentage points below the bar. */
	percent: number;
	/** Choruses still to play. */
	choruses: number;
};

export type Verdict = {
	met: boolean;
	/** The goal being judged, so a stored verdict says what it was asked. */
	goal: Goal;
	context: GoalContext;
	measured: Measured;
	shortfall: Shortfall;
	/** One line for the screen, and for the end screen a later phase writes. */
	says: string;
};

// ---------------------------------------------------------------------------
// Judging a run
// ---------------------------------------------------------------------------

/**
 * A recorded chord, back in the shape `add` folds.
 *
 * `absent` is the one field the record does not keep: it names the guide tones
 * still missing so the screen can say which, which is a display fact rather than
 * a stored one. `add` reads the landing and the note counts and nothing else, so
 * an empty list here costs the tally nothing and invents nothing either.
 */
const asAttempt = (chord: JudgedChord): Attempt => ({
	landing: chord.landing,
	found: chord.found,
	needed: chord.needed,
	absent: [],
	notes: { chord: chord.notesChord, colour: chord.notesColour, outside: chord.notesOutside }
});

const wasVoiced = (chord: JudgedChord): boolean =>
	chord.notesChord + chord.notesColour + chord.notesOutside > 0;

/**
 * How much of the form was played over, in bars.
 *
 * Counted from the bar numbers rather than from the clock, because the clock
 * cannot tell a chorus from a pause and the bar numbers are the grain the record
 * keeps.
 *
 * **This used to count bar changes, and that was wrong.** The comment here
 * claimed that a four-bar loop "cannot be mistaken for playing the tune", which
 * it plainly could: twelve bar changes are twelve bar changes whether they came
 * from twelve bars of a blues or from six passes of a two-bar turnaround, and
 * the second of those met a goal that asks you to get round the form. It is the
 * same hole the badges had, so it is now closed by the same rule, in
 * `practice/form.ts`: distinct bars of the form, carried across the wrap, and a
 * loop shorter than the tune is capped at its own length forever.
 *
 * One consequence is unchanged and worth restating: a bar you rested through is
 * not a bar you covered. Resting the same bar on every pass therefore never
 * completes a chorus, where resting a different one each time does — the set
 * carries over. That is the honest reading of a goal about playing over the
 * changes.
 */
const coveredBars = (chords: JudgedChord[], barsPerChorus: number): number =>
	barsCovered(
		chords.map((chord) => chord.bar),
		barsPerChorus
	);

/** Two decimals, so a chorus count is a number rather than a float's opinion. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Whole where it is whole, one decimal where it is not: 2, or 1.9. */
const rounds = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const chorusWord = (count: number) => (count === 1 ? 'chorus' : 'choruses');

/**
 * Was this goal met by these chords?
 *
 * The whole of Phase 3's arithmetic, and none of Phase 3's plumbing. Given the
 * chords a run judged and the conditions it was played in, it returns what
 * happened — never what to do about it, which belongs to the page.
 *
 * A run with nothing played in it is not a failure and is not scored as one:
 * `accuracy` reports null rather than zero before a note is played, and this
 * says so in words rather than claiming the goal was missed by 85 points.
 */
export function evaluateGoal(goal: Goal, chords: JudgedChord[], context: GoalContext): Verdict {
	const voiced = chords.filter(wasVoiced);
	const tally = voiced.reduce((total, chord) => add(total, asAttempt(chord)), emptyTally());

	const percent = accuracy(tally);
	const bars = coveredBars(voiced, context.barsPerChorus);
	const choruses = context.barsPerChorus > 0 ? round2(bars / context.barsPerChorus) : 0;

	const measured: Measured = {
		voiced: tally.voiced,
		landed: tally.landed,
		percent,
		coverage: coverage(tally),
		barsCovered: bars,
		choruses
	};

	const nothing = tally.voiced === 0;

	switch (goal.kind) {
		case 'guide_tones': {
			const shortfall: Shortfall = {
				percent: Math.max(0, goal.percent - (percent ?? 0)),
				choruses: round2(Math.max(0, goal.choruses - choruses))
			};
			const met = !nothing && shortfall.percent === 0 && shortfall.choruses === 0;
			return {
				met,
				goal,
				context,
				measured,
				shortfall,
				says: nothing
					? 'No chords judged.'
					: met
						? `Met · ${percent}% · ${rounds(choruses)} ${chorusWord(choruses)}`
						: guideTonesShort(goal, percent ?? 0, choruses, shortfall)
			};
		}

		case 'choruses': {
			const shortfall: Shortfall = {
				percent: 0,
				choruses: round2(Math.max(0, goal.count - choruses))
			};
			const met = !nothing && shortfall.choruses === 0;
			return {
				met,
				goal,
				context,
				measured,
				shortfall,
				says: nothing
					? 'No chords judged.'
					: met
						? `Met · ${rounds(choruses)} ${chorusWord(choruses)}`
						: `${rounds(choruses)}/${goal.count} ${chorusWord(goal.count)}`
			};
		}

		case 'once':
			// Shown once, tried once. There is nothing to reach — playing it is the
			// whole of the goal, which is what "nothing is being counted" means.
			return {
				met: !nothing,
				goal,
				context,
				measured,
				shortfall: { percent: 0, choruses: 0 },
				says: nothing ? 'Not tried.' : 'Tried.'
			};

		case 'questions':
			// A run judges chords, not answers. Rather than invent a number, this
			// says where the goal is actually counted — the drill room, which counts
			// its own questions and never reads a run.
			return {
				met: false,
				goal,
				context,
				measured,
				shortfall: { percent: 0, choruses: 0 },
				says: `${goal.count} questions · counted in drill`
			};
	}
}

function guideTonesShort(
	goal: Extract<Goal, { kind: 'guide_tones' }>,
	percent: number,
	choruses: number,
	shortfall: Shortfall
): string {
	const landed = `${percent}% landed over ${rounds(choruses)} ${chorusWord(choruses)}`;
	if (shortfall.percent > 0 && shortfall.choruses > 0) {
		return `${landed} · ${shortfall.percent} points short · ${rounds(shortfall.choruses)} ${chorusWord(shortfall.choruses)} left`;
	}
	if (shortfall.percent > 0) {
		return `${landed} · ${shortfall.percent} points short`;
	}
	return `${landed} · ${rounds(shortfall.choruses)} ${chorusWord(shortfall.choruses)} left`;
}

// ---------------------------------------------------------------------------
// A mission on the URL
// ---------------------------------------------------------------------------

/**
 * A mission, as `/backing` receives it.
 *
 * The parameters travel in the query string beside the `?chart=` that page has
 * always read, which is what makes a mission *the* play-along page under a
 * constraint rather than a second copy of it: strip the parameters and the same
 * URL is an ordinary visit.
 *
 * Every field is nullable because every field is optional. A mission that names
 * no key is a mission in whatever key the page was going to open in, and the
 * page's own defaults are never overwritten by an absence.
 */
export type MissionParams = {
	keyCenter: string | null;
	/** A floor rather than a setting: playing it faster than asked is not cheating. */
	bpmFloor: number | null;
	groove: Groove | null;
	goal: Goal;
	/** The session block this answers, when a session set it. */
	blockId: string | null;
};

/** Which goals a mission may be given. The other two belong to the drill room. */
const MISSION_GOALS = new Set(['guide_tones', 'choruses']);

/** As the app spells a key everywhere it stores one: ASCII, never a ♭. */
const KEY_NAME = /^[A-G][b#]?$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The transport's own range. Mirrored here because this is where a URL stops being trusted. */
const MIN_BPM = 40;
const MAX_BPM = 300;

/** The most a goal may ask for. A hundred choruses is a typo, not a mission. */
const MAX_CHORUSES = 32;

function whole(raw: string | null, min: number, max: number): number | null {
	if (raw === null) return null;
	const value = Number(raw);
	if (!Number.isFinite(value)) return null;
	return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Read a mission out of a query string, or decide there is not one.
 *
 * `goal` is what makes a URL a mission: without it — or with anything the drill
 * room owns — this returns null and the page behaves exactly as it always has.
 * That is the whole of the "a mission is an additional reading of the URL, never
 * a mode the page is put into" rule, expressed as a return type.
 *
 * Nothing here trusts what it reads. A key is a key name or it is ignored, a
 * tempo is clamped to what the transport can play, and a block id has to look
 * like a uuid — the query string is typed by hand as often as it is generated.
 */
export function readMission(params: URLSearchParams): MissionParams | null {
	const kind = params.get('goal');
	if (!kind || !MISSION_GOALS.has(kind)) return null;

	// One chorus is the least a goal can ask for, so it is what a mission means
	// when it says nothing. The composer always writes the number it wants.
	const choruses = whole(params.get('choruses'), 1, MAX_CHORUSES) ?? 1;
	const goal: Goal =
		kind === 'choruses'
			? { kind: 'choruses', count: choruses }
			: {
					kind: 'guide_tones',
					percent: whole(params.get('percent'), 1, 100) ?? GUIDE_TONE_TARGET,
					choruses
				};

	const keyCenter = params.get('key');
	const groove = params.get('groove');
	const blockId = params.get('block');

	return {
		keyCenter: keyCenter && KEY_NAME.test(keyCenter) ? keyCenter : null,
		bpmFloor: whole(params.get('bpm'), MIN_BPM, MAX_BPM),
		groove: isGroove(groove) ? groove : null,
		blockId: blockId && UUID.test(blockId) ? blockId : null,
		goal
	};
}
