import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { ReviewRating } from '$lib/server/db/schema';
import {
	activeWorkout,
	beginTask,
	finishTask,
	finishWorkout,
	recordReviews,
	startWorkout,
	type ReviewInput
} from '$lib/server/db/session-store';
import { currentUserId } from '$lib/server/db/user';
import { readChoice, readSize } from '$lib/session/progress';

/**
 * The workout's write endpoint.
 *
 * Everything is idempotent or additive. A task can be finished twice, a workout
 * started twice, a review batch resent — because the practice device may lose
 * its connection mid-workout, and the recovery has to be "send it again" rather
 * than "work out what already got through".
 *
 * A task is named by its position and never by its type. The store turns that
 * into a block, because which task index a `mission_4` row belongs to is a fact
 * about the stored plan, and the page has no business knowing how a block is
 * named.
 */

const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.authed) error(401, 'Not signed in');
	return json(await activeWorkout());
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.authed) error(401, 'Not signed in');
	const userId = currentUserId(locals.userId);

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, 'Expected JSON');
	}

	const action = body.action;

	if (action === 'start') {
		const size = readSize(body.size);
		const choice = readChoice(
			{
				progressionId: text(body.progressionId),
				progressionKey: text(body.progressionKey),
				focusKey: text(body.focusKey),
				focusRung: text(body.focusRung)
			},
			// The picker always sends a key with a progression; this only catches a
			// request typed by hand, and C is where the ladder starts.
			text(body.progressionKey) ?? 'C'
		);
		return json(await startWorkout(userId, { size, choice }));
	}

	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
	if (!sessionId) error(400, 'Which workout?');

	if (action === 'begin-task') {
		const blockId = await beginTask(sessionId, taskIndex(body.index));
		if (!blockId) error(400, 'No such task');
		return json({ blockId });
	}

	if (action === 'finish-task') {
		const batch = parseReviews(body.reviews);
		if (batch.length) await recordReviews(sessionId, batch);

		const finished = await finishTask(sessionId, taskIndex(body.index), body.result ?? null);
		if (!finished) error(400, 'No such task');

		return json(await activeWorkout());
	}

	if (action === 'finish') {
		return json(await finishWorkout(sessionId, userId));
	}

	error(400, `Unknown action: ${String(action)}`);
};

/** A task is a position in the stored plan, and the store checks it exists. */
function taskIndex(raw: unknown): number {
	const index = Number(raw);
	if (!Number.isInteger(index) || index < 0) error(400, 'Which task?');
	return index;
}

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function parseReviews(input: unknown): ReviewInput[] {
	if (!Array.isArray(input)) return [];

	return input.flatMap((entry): ReviewInput[] => {
		if (typeof entry !== 'object' || entry === null) return [];
		const row = entry as Record<string, unknown>;

		const id = row.id;
		const cardId = row.cardId;
		const rating = row.rating;
		if (typeof id !== 'string' || !UUID.test(id)) return [];
		if (typeof cardId !== 'string') return [];
		if (typeof rating !== 'string' || !RATINGS.includes(rating as ReviewRating)) return [];

		const latency = Number(row.latencyMs);
		return [
			{
				id,
				cardId,
				rating: rating as ReviewRating,
				correct: Boolean(row.correct),
				latencyMs: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : null,
				played: Array.isArray(row.played)
					? row.played.map(Number).filter(Number.isFinite)
					: undefined
			}
		];
	});
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
