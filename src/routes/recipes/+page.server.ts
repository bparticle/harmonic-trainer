import type { PageServerLoad } from './$types';
import { currentUserId } from '$lib/server/db/user';
import { loadLineRecord } from '$lib/server/db/recipes';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = currentUserId(locals.userId);
	return { record: await loadLineRecord(userId), userId };
};
