import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	checkPassword,
	cookieOptions,
	issueToken,
	safeRedirectPath
} from '$lib/server/auth';
import { currentUserId } from '$lib/server/db/user';

export const load: ServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = form.get('password');

		if (typeof password !== 'string' || !checkPassword(password)) {
			return fail(401, { error: 'Wrong password.' });
		}

		// One password mints one player's token. Which player that is stops being
		// a foregone conclusion in M12; the payload has somewhere to say so now.
		cookies.set(SESSION_COOKIE, issueToken(currentUserId()), {
			...cookieOptions,
			// Allow http://localhost during development, where there is no TLS.
			secure: url.protocol === 'https:'
		});

		redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	}
};
