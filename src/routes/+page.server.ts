import { and, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, srsState } from '$lib/server/db/schema';
import { loadKeyChords } from '$lib/server/db/play-log';
import {
	activeWorkout,
	advanceLadder,
	currentPosition,
	finishWorkout,
	previewWorkouts,
	rungProgress,
	startWorkout
} from '$lib/server/db/session-store';
import { currentUserId } from '$lib/server/db/user';
import { nextPosition, positionOf, RUNGS, STAGES } from '$lib/curriculum/ladder';
import { PROGRESSIONS, PROGRESSION_LEVELS } from '$lib/curriculum/progressions';
import {
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
			next: null,
			progress: { reviews: 0, correct: 0, looksSolid: false },
			stages: STAGES,
			rungs: RUNGS,
			progressions: PROGRESSIONS,
			progressionLevels: PROGRESSION_LEVELS,
			// Twelve keys with nothing in them, because a visitor has no record —
			// the same shape the page reads, so one branch does not have a
			// different data type from the other.
			keys: keyStandings([], { stageIndex: 0, rungIndex: 0 }),
			resume: null,
			due: 0,
			// A visitor has no record to compose a workout from, and inventing one
			// would be the landing page promising a day of practice that nobody's
			// rows asked for. The picker below it is hidden for a visitor anyway.
			size: 'standard' as WorkoutSize,
			previews: {} as Record<WorkoutSize, TaskPreview[]>
		};
	}

	const userId = currentUserId(locals.userId);
	const position = await currentPosition(userId);
	const progress = await rungProgress(userId, position);

	const [due] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(srsState)
		.innerJoin(cards, eq(cards.id, srsState.cardId))
		.where(and(eq(cards.userId, userId), sql`${srsState.dueAt} <= now()`));

	const next = nextPosition(position);

	const previews = await previewWorkouts(userId);
	const active = await activeWorkout(userId);

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
		next: next ? { key: next.stage.key, rung: next.rung } : null,
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
		keys: keyStandings(await loadKeyChords(userId), position),
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
		 * The play-along that is not on offer yet, and what would put it there.
		 *
		 * Read off the standard workout because a held-back mission is held back at
		 * every size — the gate is about what you have been taught, not about how
		 * long you have got. Null on nearly every day of an account's life; not null
		 * on the first one or two, where it is the difference between a workout that
		 * quietly has one task fewer and one that says why.
		 */
		missionHeld: previews.standard.missionHeld ?? null
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

	/** Move on. Deliberately unguarded — you can tell better than a review count. */
	advance: async ({ locals }) => {
		const userId = currentUserId(locals.userId);
		const position = await currentPosition(userId);
		const next = nextPosition(position);
		if (next) await advanceLadder(userId, next);
		redirect(303, '/');
	},

	/** Go back, for when moving on turned out to be optimistic. */
	back: async ({ locals }) => {
		const userId = currentUserId(locals.userId);
		const position = await currentPosition(userId);
		const rungIndex = position.rungIndex - 1;
		const target =
			rungIndex >= 0
				? positionOf(position.stage.key, RUNGS[rungIndex].id)
				: position.stageIndex > 0
					? positionOf(STAGES[position.stageIndex - 1].key, RUNGS[RUNGS.length - 1].id)
					: null;

		if (target) {
			const settings = await loadSettings(userId);
			await saveSettings(userId, {
				prefs: {
					...settings.prefs,
					ladderKey: target.stage.key,
					ladderRung: target.rung.id
				}
			});
		}
		redirect(303, '/');
	}
};
