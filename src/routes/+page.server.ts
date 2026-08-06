import { sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cards, reviews, srsState } from '$lib/server/db/schema';
import { startOrResume, todaysSession } from '$lib/server/db/session-store';
import type { SessionLength } from '$lib/session/plan';

/**
 * The home screen has one job: get you playing.
 *
 * Everything here is a fact about where things stand, not a menu — the brief is
 * explicit that there is one button and no choosing.
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

	return {
		settings,
		active: await todaysSession(),
		due: due?.n ?? 0,
		totalCards: total?.n ?? 0,
		reviewsThisWeek: reviewed?.n ?? 0,
		coldestKeys: coldest.map((c) => c.keyCenter)
	};
};

export const actions: Actions = {
	start: async ({ request }) => {
		const form = await request.formData();
		const length = Number(form.get('length') ?? 20);
		const valid: SessionLength[] = [10, 20, 35];
		const chosen = valid.includes(length as SessionLength) ? (length as SessionLength) : 20;

		await startOrResume(chosen);
		redirect(303, '/session');
	}
};
