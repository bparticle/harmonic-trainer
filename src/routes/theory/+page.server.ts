import type { PageServerLoad } from './$types';
import { currentUserId } from '$lib/server/db/user';
import { loadTheoryProgress } from '$lib/server/db/theory';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = currentUserId(locals.userId);
	return { theoryProgress: await loadTheoryProgress(userId), theoryUserId: userId };
};
