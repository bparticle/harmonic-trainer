import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	activeWorkout,
	currentFrontier,
	deepenLadder,
	finishTask,
	loadCards
} from '$lib/server/db/session-store';
import { currentUserId } from '$lib/server/db/user';

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

	if (!active) return { settings, workout: null, cards: {} as CardsByTask };

	const byTask: CardsByTask = {};
	for (const entry of active.tasks) {
		const task = entry.task;
		if (task.kind !== 'ear' && task.kind !== 'function' && task.kind !== 'crossing') continue;
		if (task.cardIds.length) byTask[entry.index] = await loadCards(userId, task.cardIds);
	}

	return { settings, workout: active, cards: byTask };
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
		 * No target to look up any more. The novelty slot offers whatever the
		 * frontier would open next, and the frontier knows what that is — so this
		 * says "go deeper" rather than naming a place, and the two can no longer
		 * disagree about which rung was being offered.
		 */
		const before = await currentFrontier(userId);
		const after = await deepenLadder(userId);
		const moved = after.widths.join() !== before.widths.join();

		if (sessionId && Number.isInteger(index)) {
			await finishTask(userId, sessionId, index, { tried: true, advanced: moved });
		}
		redirect(303, '/session');
	}
};
