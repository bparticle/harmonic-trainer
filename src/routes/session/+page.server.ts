import type { PageServerLoad } from './$types';
import { loadCards, todaysSession } from '$lib/server/db/session-store';
import { rungById, stageByKey } from '$lib/curriculum/ladder';
import { progressionById, realiseProgression } from '$lib/curriculum/progressions';

type CardsByBlock = Record<string, Awaited<ReturnType<typeof loadCards>>>;

/**
 * Everything the session needs, in one load.
 *
 * Cards for every block are fetched up front so a session survives losing its
 * connection halfway through: once the page is open, the practice can finish
 * and the results flush at the end.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();
	const active = await todaysSession();

	if (!active) {
		return {
			settings,
			session: null,
			cards: {} as CardsByBlock,
			rung: null,
			stage: null,
			progression: null
		};
	}

	const byBlock: CardsByBlock = {};
	for (const block of active.plan.blocks) {
		if (block.cardIds.length) byBlock[block.type] = await loadCards(block.cardIds);
	}

	const plan = active.plan as typeof active.plan & {
		ladderKey?: string;
		ladderRung?: string;
		progressionId?: string | null;
	};

	// Block four teaches the rung you are on, rather than an unrelated idea from
	// somewhere else in the syllabus.
	const rung = plan.ladderRung ? (rungById(plan.ladderRung) ?? null) : null;
	const stage = plan.ladderKey ? (stageByKey(plan.ladderKey) ?? null) : null;

	const progression =
		plan.progressionId && progressionById(plan.progressionId)
			? realiseProgression(progressionById(plan.progressionId)!, active.plan.keyCenter)
			: null;

	return { settings, session: active, cards: byBlock, rung, stage, progression };
};
