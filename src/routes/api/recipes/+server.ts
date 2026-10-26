import { error, json, type RequestHandler } from '@sveltejs/kit';
import { currentUserId } from '$lib/server/db/user';
import { loadLineRecord, saveRound } from '$lib/server/db/recipes';
import { replay } from '$lib/recipes/round';

/**
 * Where a finished round on the recipe line is written down.
 *
 * The body is replayed rather than believed — see `replay`. A round longer
 * than any stop can produce is refused before it is parsed.
 */
const MAX_BODY = 64_000;

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.authed) error(401, 'Not signed in');
	const userId = currentUserId(locals.userId);

	const text = await request.text();
	if (text.length > MAX_BODY) error(413, 'Round is too large');
	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		error(400, 'Expected JSON');
	}

	const checked = replay(body);
	if (!checked) error(400, 'Expected a finished round');
	if (!(await saveRound(userId, checked.submission, checked.result))) {
		error(409, 'That round id is already in use');
	}
	return json({ record: await loadLineRecord(userId) });
};
