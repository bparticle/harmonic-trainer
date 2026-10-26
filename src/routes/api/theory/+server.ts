import { error, json, type RequestHandler } from '@sveltejs/kit';
import { currentUserId } from '$lib/server/db/user';
import { loadTheoryProgress, saveTheoryRound } from '$lib/server/db/theory';
import { parseSubmission } from '$lib/theory/round';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.authed) error(401, 'Not signed in');
	const userId = currentUserId(locals.userId);
	const text = await request.text();
	if (text.length > 100_000) error(413, 'Round is too large');
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		error(400, 'Expected JSON');
	}
	const submission = parseSubmission(value);
	if (!submission) error(400, 'Expected a completed theory round, including its review questions');
	if (!(await saveTheoryRound(userId, submission))) error(409, 'Round ID is already in use');
	return json({ progress: await loadTheoryProgress(userId) });
};
