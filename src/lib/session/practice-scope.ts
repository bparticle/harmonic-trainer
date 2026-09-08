import { isOpen, stationHolding, type Frontier } from '$lib/curriculum/ladder';
import { progressionSkillCode } from '$lib/curriculum/cards';
import type { Schedulable } from '$lib/srs/scheduler';
import type { Choice } from './workout';
import { rungOfSkill } from './journey';

/** Saved cards survive closure; only open material enters automatic practice.
 * An explicitly selected lesson can still be explored without reopening it.
 */
export function cardsInScope<T extends Pick<Schedulable, 'keyCenter' | 'skillCode'>>(
	cards: T[],
	frontier: Frontier,
	choice: Choice | null = null
): T[] {
	return cards.filter((card) => {
		const rung = rungOfSkill(card.skillCode ?? '');
		if (choice?.kind === 'rung' && card.keyCenter === choice.key && rung === choice.rungId)
			return true;
		if (
			choice?.kind === 'progression' &&
			card.keyCenter === choice.keyCenter &&
			card.skillCode === progressionSkillCode(choice.progressionId)
		)
			return true;
		if (rung) return isOpen(frontier, card.keyCenter, rung);
		const station = stationHolding(card.keyCenter);
		return station !== null && isOpen(frontier, station, 'scale');
	});
}
