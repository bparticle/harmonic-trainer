import type { LayoutServerLoad } from './$types';
import { DEFAULT_SETTINGS } from '$lib/settings';
import { loadSettings } from '$lib/server/db/settings';

/**
 * The pitch-class palette is server-rendered into the document so the first
 * paint already has the right colours — a flash of default palette would be
 * especially wrong in an app whose whole premise is that colour means pitch.
 *
 * The login screen is reachable without a session, and it must not require a
 * working database to render, so unauthenticated requests use the defaults.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.authed || !locals.userId) {
		return { settings: DEFAULT_SETTINGS, authed: false, user: null };
	}
	return {
		settings: await loadSettings(locals.userId),
		authed: true,
		user: locals.user ? { name: locals.user.name } : null
	};
};
