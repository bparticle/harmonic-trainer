/**
 * Has this run been all the way round the tune?
 *
 * A question with one answer and two customers, which is why it is a module and
 * not a line in each of them. The badges need it — a shelf full of medals for
 * looping two bars is the complaint that started this — and so does the goal
 * evaluator, whose chorus count could be run up by the same trick.
 *
 * ## What went wrong
 *
 * You could set a loop over bars one and two of a thirty-two bar tune, play the
 * two chords cleanly at full tempo, and walk away with every badge on the
 * shelf. The streak did not know it was going round a two-bar circle, because a
 * streak counts landed chords and those chords were genuinely landed. Nothing
 * was cheating; the measurement simply never asked how much of the tune it had
 * seen.
 *
 * The chorus count had the same hole in a politer form. It counted *bar
 * changes* — a comment even claimed that this meant "looping a turnaround cannot
 * be mistaken for playing the tune", which was wrong: twelve changes over a
 * two-bar loop is twelve changes, and twelve changes over a twelve-bar form was
 * a chorus. Six times round a two-bar loop met a goal that asks you to get round
 * a blues.
 *
 * ## The rule
 *
 * A bar counts once until the form has been covered, and then the count starts
 * again. Not "bars played" and not "wraps of the transport" — **distinct bars of
 * the form**, carried across the wrap rather than reset by it.
 *
 * Three consequences, all of them the point:
 *
 *   - A two-bar loop reaches two bars covered and stays there for as long as you
 *     care to play it. It can never be a chorus, however long it runs.
 *   - A bar you were resting through on the first pass and played on the second
 *     completes the form on the second. The set carries over, so laying out for
 *     four bars costs you the wait rather than the chorus.
 *   - A bar you rest through *every* time never counts, and the form is never
 *     complete. That is the honest reading: you did not play over that bar. It
 *     was already the rule for a single pass before this module existed.
 *
 * Everything here is pure and knows nothing about a transport, a chart or a
 * clock — it is handed bar numbers. The play-along page feeds it from the
 * transport, which visits every bar whether or not you play one, and the goal
 * evaluator feeds it from the chords a run judged, which exist only where you
 * did. That difference is deliberate and is spelled out at each call site: the
 * badge asks whether the *tune* went round, and the goal asks whether *you* did.
 */

/**
 * How much of the form a run has been through.
 *
 * `round` is the number of complete passes and `visited` is what has been seen
 * since the last one finished. Immutable, because the play-along page holds one
 * in reactive state and mutating a set in place is a good way to have the screen
 * disagree with the truth.
 */
export type FormPass = {
	/** Distinct bars of the form seen since the last complete pass. */
	visited: ReadonlySet<number>;
	/** Complete passes over the form. */
	round: number;
};

export const noPass = (): FormPass => ({ visited: new Set(), round: 0 });

/**
 * One bar seen.
 *
 * `barsPerChorus` is passed in on every call rather than fixed at the start
 * because the page can change chart mid-sitting — which ends the run anyway, but
 * a function that quietly remembered a form length from two tunes ago is a bug
 * waiting for the day that stops being true.
 *
 * A bar outside the form is ignored rather than counted. Bar zero is what the
 * transport reports during the count-in, and counting the count-in as a twelfth
 * of a blues would be the same kind of error this module exists to remove.
 */
export function visitBar(pass: FormPass, bar: number, barsPerChorus: number): FormPass {
	if (barsPerChorus <= 0) return pass;
	if (!Number.isInteger(bar) || bar < 1 || bar > barsPerChorus) return pass;
	if (pass.visited.has(bar)) return pass;

	const visited = new Set(pass.visited);
	visited.add(bar);

	return visited.size >= barsPerChorus
		? { visited: new Set(), round: pass.round + 1 }
		: { visited, round: pass.round };
}

/** Every bar of the form, at least once. The condition a badge waits on. */
export const wentRound = (pass: FormPass): boolean => pass.round > 0;

/**
 * How many bars of the form are still unseen **in the lap under way**.
 *
 * Which means it goes back to the whole form the instant one is completed, not
 * to zero: the set starts again and there is a fresh lap to cover. Every caller
 * asks this while waiting for the first lap, where the two readings agree.
 */
export const barsLeft = (pass: FormPass, barsPerChorus: number): number =>
	Math.max(0, barsPerChorus - pass.visited.size);

/** Fold a sequence of bar numbers into a pass. */
export function passOver(bars: Iterable<number>, barsPerChorus: number): FormPass {
	let pass = noPass();
	for (const bar of bars) pass = visitBar(pass, bar, barsPerChorus);
	return pass;
}

/**
 * How much of the form was covered, in bars, over a whole run.
 *
 * The number the chorus count is derived from. A complete pass is worth the
 * whole form and whatever is still open at the end is worth what it holds — so
 * this is never more than the bars honestly got through, and a loop shorter than
 * the form is capped at its own length forever.
 */
export function barsCovered(bars: Iterable<number>, barsPerChorus: number): number {
	if (barsPerChorus <= 0) return 0;
	const pass = passOver(bars, barsPerChorus);
	return pass.round * barsPerChorus + pass.visited.size;
}
