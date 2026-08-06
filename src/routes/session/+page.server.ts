import type { PageServerLoad } from './$types';
import { loadCards, todaysSession } from '$lib/server/db/session-store';
import { realiseAtom, atomById } from '$lib/session/atoms';
import { parseKey } from '$lib/music/key';

/**
 * Everything the session needs, in one load.
 *
 * The cards for every block are fetched up front rather than per block, so a
 * session survives losing its connection halfway through: once the page is
 * open, the practice can finish offline and the results flush at the end.
 */
type CardsByBlock = Record<string, Awaited<ReturnType<typeof loadCards>>>;

export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();
	const active = await todaysSession();

	if (!active) {
		return { settings, session: null, cards: {} as CardsByBlock, atom: null };
	}

	const byBlock: CardsByBlock = {};
	for (const block of active.plan.blocks) {
		if (block.cardIds.length) byBlock[block.type] = await loadCards(block.cardIds);
	}

	const atom = active.plan.atomId ? atomById(active.plan.atomId) : null;

	return {
		settings,
		session: active,
		cards: byBlock,
		atom: atom ? realiseAtom(atom, parseKey(active.plan.keyCenter)) : null
	};
};
