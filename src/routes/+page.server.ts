import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, reviews, srsState } from '$lib/server/db/schema';
import {
	advanceLadder,
	currentPosition,
	rungProgress,
	startOrResume,
	todaysSession
} from '$lib/server/db/session-store';
import { nextPosition, positionOf, RUNGS, STAGES } from '$lib/curriculum/ladder';
import { PROGRESSIONS, PROGRESSION_LEVELS } from '$lib/curriculum/progressions';
import { blockDurations, type SessionLength } from '$lib/session/plan';
import { saveSettings, loadSettings } from '$lib/server/db/settings';

/**
 * Home: where you are, and the one thing to do next.
 *
 * There is no scheduler deciding which of twelve keys to ambush you with. There
 * is a ladder, you are somewhere on it, and you move when you decide to.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();
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

	return {
		settings,
		active: await todaysSession(),
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
		blockPreview: blockDurations(settings.prefs.sessionLengthMinutes)
	};
};

export const actions: Actions = {
	start: async ({ request }) => {
		const form = await request.formData();
		const length = Number(form.get('length') ?? 20);
		const valid: SessionLength[] = [10, 20, 35];

		const progressionId = form.get('progression');
		await startOrResume({
			lengthMinutes: valid.includes(length as SessionLength) ? (length as SessionLength) : 20,
			progressionId: typeof progressionId === 'string' && progressionId ? progressionId : null,
			progressionKey: (form.get('progressionKey') as string) || null,
			// Exploring a step somewhere else on the ladder. Does not move it.
			focusKey: (form.get('focusKey') as string) || null,
			focusRung: (form.get('focusRung') as string) || null
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
