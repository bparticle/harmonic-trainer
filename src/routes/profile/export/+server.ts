import { error, json, type RequestHandler } from '@sveltejs/kit';
import { exportAccount } from '$lib/server/db/export';
import { currentUserId } from '$lib/server/db/user';

/** Everything the signed-in account owns, as a downloadable JSON file. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.authed) error(401, 'Not signed in');

	const data = await exportAccount(currentUserId(locals.userId));
	return json(data, {
		headers: {
			'Content-Disposition': 'attachment; filename="roundel-export.json"'
		}
	});
};
