import { error, json, type RequestHandler } from '@sveltejs/kit';
import type { BlockType, ReviewRating } from '$lib/server/db/schema';
import {
	finishBlock,
	finishSession,
	recordReviews,
	startOrResume,
	todaysSession,
	type ReviewInput
} from '$lib/server/db/session-store';
import type { SessionLength } from '$lib/session/plan';

/**
 * The session's write endpoint.
 *
 * Everything is idempotent or additive. A block can be finished twice, a
 * session started twice, a review batch resent — because the practice device
 * may lose its connection mid-session, and the recovery has to be "send it
 * again" rather than "work out what already got through".
 */

const BLOCK_TYPES: BlockType[] = [
	'wheel_warmup',
	'name_what_you_play',
	'ear_drill',
	'new_atom',
	'apply',
	'log'
];
const RATINGS: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.authed) error(401, 'Not signed in');
	return json(await todaysSession());
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.authed) error(401, 'Not signed in');

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, 'Expected JSON');
	}

	const action = body.action;

	if (action === 'start') {
		const length = Number(body.lengthMinutes ?? 20);
		if (![10, 20, 35].includes(length)) error(400, 'Sessions are 10, 20 or 35 minutes');
		return json(await startOrResume(length as SessionLength));
	}

	const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;
	if (!sessionId) error(400, 'Which session?');

	if (action === 'finish-block') {
		const blockType = body.blockType as BlockType;
		if (!BLOCK_TYPES.includes(blockType)) error(400, `Unknown block: ${String(blockType)}`);

		const batch = parseReviews(body.reviews);
		if (batch.length) await recordReviews(sessionId, batch);
		await finishBlock(sessionId, blockType, body.result ?? null);

		return json(await todaysSession());
	}

	if (action === 'finish') {
		await finishSession(sessionId, body.result ?? null);
		return json({ finished: true });
	}

	error(400, `Unknown action: ${String(action)}`);
};

function parseReviews(input: unknown): ReviewInput[] {
	if (!Array.isArray(input)) return [];

	return input.flatMap((entry): ReviewInput[] => {
		if (typeof entry !== 'object' || entry === null) return [];
		const row = entry as Record<string, unknown>;

		const cardId = row.cardId;
		const rating = row.rating;
		if (typeof cardId !== 'string') return [];
		if (typeof rating !== 'string' || !RATINGS.includes(rating as ReviewRating)) return [];

		const latency = Number(row.latencyMs);
		return [
			{
				cardId,
				rating: rating as ReviewRating,
				correct: Boolean(row.correct),
				latencyMs: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : null,
				played: Array.isArray(row.played) ? row.played.map(Number).filter(Number.isFinite) : undefined
			}
		];
	});
}
