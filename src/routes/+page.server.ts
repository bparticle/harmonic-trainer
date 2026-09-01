import { and, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, srsState } from '$lib/server/db/schema';
import { loadKeyChords } from '$lib/server/db/play-log';
import {
	activeWorkout,
	currentFrontier,
	currentPosition,
	repairFrontier,
	deepenLadder,
	finishWorkout,
	ladderRecord,
	previewWorkouts,
	recentWorkouts,
	rungProgress,
	startWorkout,
	stepBackLadder,
	widenLadder,
	widenLadderAt
} from '$lib/server/db/session-store';
import { ladderPath, ladderTotals } from '$lib/session/journey';
import { currentUserId } from '$lib/server/db/user';
import {
	deepen,
	FIRST_FRONTIER,
	narrower,
	nextCell,
	RUNGS,
	rungById,
	STAGES,
	nextWidening,
	workingPosition
} from '$lib/curriculum/ladder';
import { PROGRESSIONS, PROGRESSION_LEVELS } from '$lib/curriculum/progressions';
import {
	callsAt,
	previewTasks,
	readChoice,
	readSize,
	sizeFromMinutes,
	type TaskPreview
} from '$lib/session/progress';
import type { WorkoutSize } from '$lib/session/workout';
import { keyStandings } from '$lib/session/warmth';
import { saveSettings, loadSettings } from '$lib/server/db/settings';

/**
 * Home: where you are, and what today is made of.
 *
 * There is no scheduler deciding which of twelve keys to ambush you with. There
 * is a ladder, you are somewhere on it, and you move when you decide to.
 *
 * What changed with the workout is the preview. Six block durations were an
 * estimate of an estimate — the minutes never ended a block and the blocks never
 * varied — so the page showed the same six numbers every day of its life. Today's
 * actual tasks are countable, so they are counted, at all three sizes, and the
 * picker below them still pins whatever it likes without gating anything.
 *
 * What changed with the redesign is that the twelve keys now say what the record
 * holds in each of them. That is one extra `GROUP BY`, and it is the same one the
 * profile's twelve keys are drawn from — see `loadKeyChords`. Two counts that
 * said nothing to anybody went the other way: `totalCards` was never read at all,
 * and reviews-this-week was a number that can only fall, printed on the page you
 * open when you have come to practise.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { settings, authed } = await parent();

	// The project presentation must not depend on a working personal database.
	// Return the normal page shape so the client can hydrate one route without
	// loading any private state for a visitor.
	if (!authed) {
		const firstStage = STAGES[0];
		const firstRung = RUNGS[0];
		return {
			public: true,
			settings,
			active: null,
			position: {
				key: firstStage.key,
				relativeMinor: firstStage.relativeMinor,
				accidentals: firstStage.note,
				stageIndex: 0,
				rungIndex: 0,
				rung: firstRung
			},
			deepenTo: null,
			widenTo: null,
			progress: { reviews: 0, correct: 0, accuracy: 0, looksSolid: false, readyToMoveOn: false },
			stages: STAGES,
			rungs: RUNGS,
			progressions: PROGRESSIONS,
			progressionLevels: PROGRESSION_LEVELS,
			// Twelve keys with nothing in them, because a visitor has no record —
			// the same shape the page reads, so one branch does not have a
			// different data type from the other.
			keys: keyStandings([], FIRST_FRONTIER, 0),
			resume: null,
			due: 0,
			// A visitor has no record to compose a workout from, and inventing one
			// would be the landing page promising a day of practice that nobody's
			// rows asked for. The picker below it is hidden for a visitor anyway.
			size: 'standard' as WorkoutSize,
			previews: {} as Record<WorkoutSize, TaskPreview[]>,
			calls: {} as Record<WorkoutSize, string[]>,
			// A visitor has no record, so the path is drawn from the ladder alone:
			// the frontier of a first morning, with nothing counted against it.
			path: ladderPath(FIRST_FRONTIER, []),
			totals: ladderTotals([]),
			canDeepen: true,
			canWiden: false,
			canStepBack: false,
			history: []
		};
	}

	const userId = currentUserId(locals.userId);
	// Repaired rather than read: an account whose `ladderWidths` was lost has been
	// re-deriving a legacy position on every request. See `repairFrontier`.
	const frontier = await repairFrontier(userId);
	const position = workingPosition(frontier);
	const progress = await rungProgress(userId, position, frontier);

	const [due] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(srsState)
		.innerJoin(cards, eq(cards.id, srsState.cardId))
		.where(and(eq(cards.userId, userId), sql`${srsState.dueAt} <= now()`));

	/*
	 * What the two moves would open, worked out here so the buttons can name them
	 * rather than saying "move on".
	 *
	 * Deepening introduces an idea — the next rung, in the first key. Widening is
	 * the same idea in one more key, and the key it adds is the next one along in
	 * the ladder's own order. Both are offered; neither is a prerequisite for the
	 * other, which is the whole difference from the single "advance" this replaced.
	 */
	const deeper = deepen(frontier);
	const wider = nextWidening(frontier);
	const opensRung = nextCell(frontier);

	const previews = await previewWorkouts(userId);
	const active = await activeWorkout(userId);

	/*
	 * The path, and the days behind it.
	 *
	 * Both were missing, and their absence was the whole complaint: somebody who
	 * opens this most days saw one rung, one key and four tasks, with nothing
	 * saying they had ever been anywhere or that anywhere came next. The ladder
	 * was in the page all along — folded into a disclosure called "choose
	 * something else", which is a filing cabinet rather than a route.
	 *
	 * Both are readings of rows already being written. Neither is a streak and
	 * neither can fall.
	 */
	const record = await ladderRecord(userId);
	const history = await recentWorkouts(userId, { exclude: active?.id ?? null });

	return {
		public: false,
		settings,
		active,
		position: {
			key: position.stage.key,
			relativeMinor: position.stage.relativeMinor,
			accidentals: position.stage.note,
			stageIndex: position.stageIndex,
			rungIndex: position.rungIndex,
			rung: position.rung
		},
		/** What each button would open, for the two lines beside them. */
		deepenTo: opensRung ? { key: opensRung.key, rung: rungById(opensRung.rungId) ?? null } : null,
		widenTo: wider ? { key: wider.stage.key, rung: wider.rung } : null,
		progress,
		stages: STAGES,
		rungs: RUNGS,
		progressions: PROGRESSIONS,
		progressionLevels: PROGRESSION_LEVELS,
		/*
		 * The twelve keys, each carrying what the record actually holds in it.
		 *
		 * Every key is here whether or not anything has been played in it, because
		 * this strip is the picker: an empty swatch is a place you can be in one
		 * press from now, which is the opposite of the profile's problem with
		 * showing twelve empty things somebody has not done.
		 */
		keys: keyStandings(await loadKeyChords(userId), frontier, position.stageIndex),
		/*
		 * The workout in flight, in the shape the page draws.
		 *
		 * Which tasks are finished comes from the blocks — a mission's own block is
		 * ended by the run that met its goal — so this is the record's answer to
		 * "where was I", not the browser's.
		 */
		resume: active
			? {
					at: active.resumeAt,
					complete: active.complete,
					keyCenter: active.workout.keyCenter,
					calls: callsAt(active.workout),
					tasks: previewTasks(active.workout).map((preview, index) => ({
						...preview,
						finished: active.tasks[index]?.finished ?? false
					}))
				}
			: null,
		due: due?.n ?? 0,
		// The saved length preference, read as a size. Nothing in a workout is
		// timed, so the minutes are consulted exactly here and for nothing else.
		size: sizeFromMinutes(settings.prefs.sessionLengthMinutes),
		previews: {
			short: previewTasks(previews.short),
			standard: previewTasks(previews.standard),
			long: previewTasks(previews.long)
		},
		/*
		 * The calling points, per size, for the departure board.
		 *
		 * Composed before anything is pinned, which is exactly what the board says
		 * about them: the pin leads the queue and these are what else is due. A
		 * preview recomposed on every keystroke would be a round trip for a line
		 * of text, and `leadWithPinned` guarantees the pin arrives first whatever
		 * these say.
		 */
		calls: {
			short: callsAt(previews.short),
			standard: callsAt(previews.standard),
			long: callsAt(previews.long)
		},
		/*
		 * The play-along that is not on offer yet, and what would put it there.
		 *
		 * Read off the standard workout because a held-back mission is held back at
		 * every size — the gate is about what you have been taught, not about how
		 * long you have got. Null on nearly every day of an account's life; not null
		 * on the first one or two, where it is the difference between a workout that
		 * quietly has one task fewer and one that says why.
		 */
		missionHeld: previews.standard.missionHeld ?? null,
		/*
		 * A few steps either side of where you are standing, each carrying its own
		 * count. Wider ahead than behind on purpose: the question this page is
		 * asked at eight in the morning is what comes next, and what came before is
		 * already written on the twelve keys further down.
		 */
		path: ladderPath(frontier, record),
		totals: ladderTotals(record),
		canDeepen: deeper !== null,
		canWiden: wider !== null,
		canStepBack: narrower(frontier) !== null,
		history: history.map((workout) => ({
			id: workout.id,
			startedAt: workout.startedAt,
			keyCenter: workout.keyCenter,
			titles: workout.titles,
			finished: workout.finished,
			total: workout.total
		}))
	};
};

export const actions: Actions = {
	/**
	 * Start a workout around whatever the picker pinned.
	 *
	 * The same four fields the picker has always posted, plus a size where the
	 * minutes used to be. Pinning still does exactly what it did: it leads the
	 * queues and takes the workout to its key, and it leaves the ladder alone —
	 * exploring a rung eight keys ahead is a legitimate thing to ask for and
	 * advancing is a separate decision, taken by the buttons below.
	 */
	start: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = currentUserId(locals.userId);
		const position = await currentPosition(userId);

		const choice = readChoice(
			{
				progressionId: (form.get('progression') as string) || null,
				progressionKey: (form.get('progressionKey') as string) || null,
				focusKey: (form.get('focusKey') as string) || null,
				focusRung: (form.get('focusRung') as string) || null
			},
			position.stage.key
		);

		await startWorkout(userId, {
			size: readSize(form.get('size')),
			choice
		});
		redirect(303, '/session');
	},

	/**
	 * Close the workout that is open, from here.
	 *
	 * The session page can stop one too, and this exists because that was not
	 * enough: an open workout hides the picker and replaces the start button with
	 * "carry on", so somebody who did not want the workout had to enter it in
	 * order to get rid of it. Two presses to undo one accident, and the first of
	 * them looks like agreeing to practise.
	 *
	 * Ending is not abandoning and nothing is discarded. Every finished task keeps
	 * its rows and the same report is written that finishing writes; all that
	 * changes is that the day stops offering this one back.
	 */
	end: async ({ locals }) => {
		const userId = currentUserId(locals.userId);
		const open = await activeWorkout(userId);
		if (open) await finishWorkout(open.id, userId);
		redirect(303, '/');
	},

	/**
	 * Go deeper: the next rung, plus one more key of every rung above it.
	 *
	 * Deliberately unguarded — you can tell better than a review count. What
	 * changed with the frontier is that this is no longer the only way forward:
	 * `widen` sits beside it, and neither is a prerequisite for the other.
	 */
	deepen: async ({ locals }) => {
		const userId = currentUserId(locals.userId);
		await deepenLadder(userId);
		redirect(303, '/');
	},

	/**
	 * Go wider: one line, one more key. More ground before the next idea.
	 *
	 * Takes the line by name where the map named one, and falls back to
	 * `nextWidening`'s answer where it did not. The map draws a stub from every
	 * line that can take another stop and each of those is now a thing you can
	 * ask for by pressing it — which is the difference between a diagram that
	 * shows what is possible and one you can act on. An unknown or refused rung
	 * leaves the ladder where it was.
	 */
	widen: async ({ request, locals }) => {
		const form = await request.formData();
		const userId = currentUserId(locals.userId);
		const named = RUNGS.findIndex((rung) => rung.id === form.get('rung'));

		if (named >= 0) await widenLadderAt(userId, named);
		else await widenLadder(userId);

		redirect(303, '/');
	},

	/**
	 * Go back, for when moving on turned out to be optimistic.
	 *
	 * Nothing is deleted: the cards stay, their schedules stay and the reviews
	 * stay. Closing a cell only stops the ladder offering it, which is what going
	 * back has always meant here.
	 */
	back: async ({ locals }) => {
		const userId = currentUserId(locals.userId);
		await stepBackLadder(userId);
		redirect(303, '/');
	}
};
