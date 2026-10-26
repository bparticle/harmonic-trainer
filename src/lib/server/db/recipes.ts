import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { theoryRounds } from './schema';
import { STOP_IDS, type StopId } from '$lib/recipes/line';
import {
	emptyRecord,
	type LineRecord,
	type RoundResult,
	type Submission
} from '$lib/recipes/round';

/** Rounds on the recipe line. Rows the table held before the line existed are not. */
const onTheLine = sql`${theoryRounds.specJson}->>'line' = 'recipes'`;

export async function loadLineRecord(userId: string): Promise<LineRecord> {
	const rows = await db
		.select({
			stop: sql<string>`${theoryRounds.specJson}->>'stop'`,
			rounds: sql<number>`count(*)::int`,
			best: sql<number | null>`max(
				(${theoryRounds.resultJson}->>'clean')::float
				/ nullif((${theoryRounds.resultJson}->>'total')::float, 0)
			)`
		})
		.from(theoryRounds)
		.where(and(eq(theoryRounds.userId, userId), onTheLine))
		.groupBy(sql`${theoryRounds.specJson}->>'stop'`);

	const record = emptyRecord();
	for (const row of rows) {
		if (!STOP_IDS.includes(row.stop as StopId)) continue;
		record[row.stop as StopId] = { rounds: row.rounds, best: row.best };
	}
	return record;
}

/**
 * Write a checked round, once.
 *
 * The id is the page's, so a save that timed out can be sent again and land
 * exactly once. The read-back is what tells the caller whether the id it sent
 * is now theirs: an id already owned by another account is left alone, and
 * reported as not saved rather than as a success.
 */
export async function saveRound(
	userId: string,
	submission: Submission,
	result: RoundResult
): Promise<boolean> {
	await db
		.insert(theoryRounds)
		.values({
			id: submission.id,
			userId,
			specJson: submission.spec,
			attemptsJson: submission.outcomes,
			resultJson: result
		})
		.onConflictDoNothing();
	const [saved] = await db
		.select({ id: theoryRounds.id })
		.from(theoryRounds)
		.where(and(eq(theoryRounds.id, submission.id), eq(theoryRounds.userId, userId)))
		.limit(1);
	return Boolean(saved);
}
