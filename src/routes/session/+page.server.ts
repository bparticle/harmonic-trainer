import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	activeWorkout,
	currentFrontier,
	openLadder,
	finishTask,
	loadCards
} from '$lib/server/db/session-store';
import { currentUserId } from '$lib/server/db/user';
import { loadKeyChords } from '$lib/server/db/play-log';
import { keyStandings } from '$lib/session/warmth';
import { workingPosition } from '$lib/curriculum/ladder';

type CardsByTask = Record<number, Awaited<ReturnType<typeof loadCards>>>;

/**
 * Everything the workout needs, in one load.
 *
 * Cards for every task are fetched up front so a workout survives losing its
 * connection halfway through: once the page is open, the practice can finish and
 * the answers flush at the end of each task.
 *
 * Keyed by the task's position rather than by its kind, exactly as its block is,
 * because a long workout holds two of some kinds and the position is the only
 * thing that tells them apart.
 */
export const load: PageServerLoad = async ({ parent, locals }) => {
	const { settings } = await parent();
	const userId = currentUserId(locals.userId);
	const active = await activeWorkout(userId);

	const byTask: CardsByTask = {};
	for (const entry of active?.tasks ?? []) {
		const task = entry.task;
		if (!('cardIds' in task)) continue;
		if (task.cardIds.length) byTask[entry.index] = await loadCards(userId, task.cardIds);
	}

	/*
	 * The twelve stations, exactly as the home page and the profile read them.
	 *
	 * So the strip above each question can draw the *same* roundel the network
	 * draws — a ring for a key that exists and a core for what the record holds
	 * in it — rather than inventing a third swatch for the one screen where the
	 * keys are actually being played. That has been the standing rule since the
	 * network replaced three drawings of these twelve, and it only holds if every
	 * page pays the one `GROUP BY` it costs. See `loadKeyChords`.
	 *
	 * Read whether or not a workout is open, because the end screen is the one
	 * place they are needed most and finishing a workout is exactly what makes
	 * `activeWorkout` return nothing. Drawn from a load that had emptied itself,
	 * *called at C, F and G* would have come out as three grey rings.
	 */
	const frontier = await currentFrontier(userId);
	const keys = keyStandings(
		await loadKeyChords(userId),
		frontier,
		workingPosition(frontier).stageIndex
	);

	return { settings, workout: active, cards: byTask, keys };
};

export const actions: Actions = {
	/**
	 * Move the ladder to the new thing, and count it as tried.
	 *
	 * This is "ready to move on" said out loud where it is actually earned, rather
	 * than as a small button at the bottom of the home page. Still a suggestion:
	 * the slot offers the next rung when the current one looks solid, and pressing
	 * this is the only thing that moves anything.
	 *
	 * A form post rather than a fetch, because the page keeps nothing afterwards —
	 * the ladder has moved, the task is finished, and the reload says both.
	 */
	advance: async ({ request, locals }) => {
		const userId = currentUserId(locals.userId);
		const form = await request.formData();
		const sessionId = String(form.get('sessionId') ?? '');
		const index = Number(form.get('index'));

		/*
		 * No target to look up any more. The offer names whatever the frontier
		 * would open next, and the frontier knows what that is — so this says "open
		 * the next thing" rather than naming a place, and the two can no longer
		 * disagree about which rung was being offered.
		 *
		 * Deeper *or* wider, which is the fix. This used to deepen and nothing
		 * else, and deepening is refused once every rung is open in at least one
		 * key — so for somebody who had worked through C the button was pressed,
		 * the page reloaded, and the ladder had not moved.
		 */
		const before = await currentFrontier(userId);
		const after = await openLadder(userId);
		const moved = after.widths.join() !== before.widths.join();

		if (sessionId && Number.isInteger(index)) {
			await finishTask(userId, sessionId, index, { tried: true, advanced: moved });
		}
		redirect(303, '/session');
	}
};
