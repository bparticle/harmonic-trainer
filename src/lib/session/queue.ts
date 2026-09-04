/**
 * The order a drill asks its cards in, and what happens to the ones you miss.
 *
 * A task used to be a walk down `taskCards` from nought, which meant a question
 * you got wrong was a question you never saw again inside that run: the `again`
 * went to the scheduler, the right answer flashed up for six hundred
 * milliseconds, and the next card replaced it. The record learned something and
 * the player learned nothing, which is the wrong way round — the moment
 * somebody is most able to take a correction is the moment they have just found
 * out they need one.
 *
 * So the walk is over a queue rather than over the cards, and a missed card is
 * put back on the **end** of it. The gap that opens up is the rest of the task,
 * a minute or two, which is long enough that answering it again is recall
 * rather than an echo and short enough that the correction is still yours. It
 * is the oldest idea in practice — go back to the bar you fluffed — and the
 * only reason it needed writing down is that the queue had nowhere to put it.
 *
 * Pure, so the rule can be tested without a keyboard, a card or a clock.
 */

export type QueueStep = {
	/** The card's own place in the task, which never changes. */
	at: number;
	/** Whether this is the second look rather than the first. */
	retry: boolean;
};

/** A task's cards in the order it composed them, before anything goes wrong. */
export function openQueue(count: number): QueueStep[] {
	return Array.from({ length: Math.max(0, count) }, (_, at) => ({ at, retry: false }));
}

/**
 * Put the card at `position` back on the end of the run.
 *
 * Once per card, and never for a card that is already the second look. A second
 * look that goes wrong is a card for tomorrow's queue rather than another lap
 * of today's: the scheduler has heard about it, and a run that could put the
 * same card back indefinitely is a run with no way out of it. Anything that
 * would loop is returned unchanged, so callers can ask without checking.
 */
export function putBack(queue: QueueStep[], position: number): QueueStep[] {
	const step = queue[position];
	if (!step || step.retry) return queue;
	if (queue.some((other, at) => at > position && other.at === step.at)) return queue;
	return [...queue, { at: step.at, retry: true }];
}

/** How many of the questions still ahead are ones being put right. */
export function stillToPutRight(queue: QueueStep[], position: number): number {
	return queue.slice(position).filter((step) => step.retry).length;
}
