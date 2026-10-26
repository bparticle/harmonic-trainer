import { and, eq, sql } from 'drizzle-orm';
import { db } from './index';
import { theoryRounds } from './schema';
import { GAME_IDS, type GameId } from '$lib/theory/catalog';
import type { GameProgress, parseSubmission } from '$lib/theory/round';

export async function loadTheoryProgress(userId: string): Promise<Record<GameId, GameProgress>> {
	const rows = await db
		.select({
			game: sql<string>`${theoryRounds.specJson}->>'game'`,
			rounds: sql<number>`count(*)::int`,
			recallRounds: sql<number>`count(*) filter (where ${theoryRounds.specJson}->>'mode' = 'recall')::int`,
			bestStars: sql<number>`max((${theoryRounds.resultJson}->>'stars')::int)`
		})
		.from(theoryRounds)
		.where(eq(theoryRounds.userId, userId))
		.groupBy(sql`${theoryRounds.specJson}->>'game'`);
	return Object.fromEntries(
		GAME_IDS.map((game) => {
			const row = rows.find((r) => r.game === game);
			return [
				game,
				{
					rounds: row?.rounds ?? 0,
					recallRounds: row?.recallRounds ?? 0,
					bestStars: row?.bestStars ?? 0
				}
			];
		})
	) as Record<GameId, GameProgress>;
}

export async function saveTheoryRound(
	userId: string,
	submission: NonNullable<ReturnType<typeof parseSubmission>>
): Promise<boolean> {
	await db
		.insert(theoryRounds)
		.values({
			id: submission.id,
			userId,
			specJson: submission.spec,
			attemptsJson: submission.attempts,
			resultJson: submission.result
		})
		.onConflictDoNothing();
	const [saved] = await db
		.select({ id: theoryRounds.id })
		.from(theoryRounds)
		.where(and(eq(theoryRounds.id, submission.id), eq(theoryRounds.userId, userId)))
		.limit(1);
	return Boolean(saved);
}
