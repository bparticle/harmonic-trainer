import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, reviews, srsState } from '$lib/server/db/schema';
import {
	activeWorkout,
	advanceLadder,
	currentPosition,
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
			due: 0,
			totalCards: 0,
			reviewsThisWeek: 0,
			// A visitor has no record to compose a workout from, and inventing one
			// would be the landing page promising a day of practice that nobody's
			// rows asked for. The picker below it is hidden for a visitor anyway.
			size: 'standard' as WorkoutSize,
			previews: {} as Record<WorkoutSize, TaskPreview[]>
		};
	}

	const position = await currentPosition();
	const progress = await rungProgress(position);

	const [due] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(srsState)
		.where(sql`${srsState.dueAt} <= now()`);

	const [totalCards] = await db.select({ n: sql<number>`count(*)::int` }).from(cards);

	const [reviewed] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(reviews)
		.where(sql`${reviews.ts} >= now() - interval '7 days'`);

	const next = nextPosition(position);

	const previews = await previewWorkouts(currentUserId(locals.userId));

	return {
		public: false,
		settings,
		active: await activeWorkout(),
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
		due: due?.n ?? 0,
		totalCards: totalCards?.n ?? 0,
		reviewsThisWeek: reviewed?.n ?? 0,
		// The saved length preference, read as a size. Nothing in a workout is
		// timed, so the minutes are consulted exactly here and for nothing else.
		size: sizeFromMinutes(settings.prefs.sessionLengthMinutes),
		previews: {
			short: previewTasks(previews.short),
			standard: previewTasks(previews.standard),
			long: previewTasks(previews.long)
		}
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
		const position = await currentPosition();

		const choice = readChoice(
			{
				progressionId: (form.get('progression') as string) || null,
				progressionKey: (form.get('progressionKey') as string) || null,
				focusKey: (form.get('focusKey') as string) || null,
				focusRung: (form.get('focusRung') as string) || null
			},
			position.stage.key
		);

		await startWorkout(currentUserId(locals.userId), {
			size: readSize(form.get('size')),
			choice
		});
		redirect(303, '/session');
	},

	/** Move on. Deliberately unguarded — you can tell better than a review count. */
	advance: async () => {
		const position = await currentPosition();
		const next = nextPosition(position);
		if (next) await advanceLadder(next);
		redirect(303, '/');
	},

	/** Go back, for when moving on turned out to be optimistic. */
	back: async () => {
		const position = await currentPosition();
		const rungIndex = position.rungIndex - 1;
		const target =
			rungIndex >= 0
				? positionOf(position.stage.key, RUNGS[rungIndex].id)
				: position.stageIndex > 0
					? positionOf(STAGES[position.stageIndex - 1].key, RUNGS[RUNGS.length - 1].id)
					: null;

		if (target) {
			const settings = await loadSettings();
			await saveSettings({
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
