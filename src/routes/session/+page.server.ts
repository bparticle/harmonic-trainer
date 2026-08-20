import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { activeWorkout, advanceLadder, finishTask, loadCards } from '$lib/server/db/session-store';
import { positionOf } from '$lib/curriculum/ladder';

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
export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();
	const active = await activeWorkout();

	if (!active) return { settings, workout: null, cards: {} as CardsByTask };

	const byTask: CardsByTask = {};
	for (const entry of active.tasks) {
		const task = entry.task;
		if (task.kind !== 'ear' && task.kind !== 'function') continue;
		if (task.cardIds.length) byTask[entry.index] = await loadCards(task.cardIds);
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
	advance: async ({ request }) => {
		const form = await request.formData();
		const sessionId = String(form.get('sessionId') ?? '');
		const index = Number(form.get('index'));
		const target = positionOf(String(form.get('key') ?? ''), String(form.get('rung') ?? ''));

		if (target) await advanceLadder(target);
		if (sessionId && Number.isInteger(index)) {
			await finishTask(sessionId, index, { tried: true, advanced: Boolean(target) });
		}
		redirect(303, '/session');
	}
};
