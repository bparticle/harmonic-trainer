import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, reviews, srsState } from '$lib/server/db/schema';
import { startOrResume, todaysSession } from '$lib/server/db/session-store';
import { blockDurations, type SessionLength } from '$lib/session/plan';
import { FOCUS_AREAS, focusById } from '$lib/curriculum/focus';

/**
 * The home screen has one job: get you playing.
 *
 * It offers to decide everything, and lets you decide instead. Facts about
 * where things stand are stated as musical observations, not as a score.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();

	const [due] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(srsState)
		.where(sql`${srsState.dueAt} <= now()`);

	const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(cards);

	const [reviewed] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(reviews)
		.where(sql`${reviews.ts} >= now() - interval '7 days'`);

	const coldest = await db
		.select({ keyCenter: cards.keyCenter, n: sql<number>`count(${reviews.id})::int` })
		.from(cards)
		.leftJoin(reviews, sql`${reviews.cardId} = ${cards.id}`)
		.groupBy(cards.keyCenter)
		.orderBy(sql`count(${reviews.id}) asc`)
		.limit(3);

	// Keys that actually have material, so the picker cannot offer a dead end.
	const keys = await db
		.selectDistinct({ keyCenter: cards.keyCenter })
		.from(cards)
		.orderBy(cards.keyCenter);

	return {
		settings,
		active: await todaysSession(),
		due: due?.n ?? 0,
		totalCards: total?.n ?? 0,
		reviewsThisWeek: reviewed?.n ?? 0,
		coldestKeys: coldest.map((c) => c.keyCenter),
		availableKeys: keys.map((k) => k.keyCenter),
		focusAreas: FOCUS_AREAS,
		blockPreview: blockDurations(settings.prefs.sessionLengthMinutes)
	};
};

export const actions: Actions = {
	start: async ({ request }) => {
		const form = await request.formData();

		const length = Number(form.get('length') ?? 20);
		const valid: SessionLength[] = [10, 20, 35];
		const lengthMinutes = valid.includes(length as SessionLength)
			? (length as SessionLength)
			: 20;

		const rawKey = form.get('key');
		const preferredKey = typeof rawKey === 'string' && rawKey !== '' ? rawKey : null;

		const rawFocus = form.get('focus');
		const focus = typeof rawFocus === 'string' ? focusById(rawFocus) : null;

		await startOrResume({
			lengthMinutes,
			preferredKey,
			focusId: focus && focus.skills.length ? focus.id : null
		});
		redirect(303, '/session');
	}
};
