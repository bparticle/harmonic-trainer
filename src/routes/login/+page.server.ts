import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	checkPassword,
	cookieOptions,
	issueToken,
	safeRedirectPath
} from '$lib/server/auth';

export const load: ServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = form.get('password');

		if (typeof password !== 'string' || !checkPassword(password)) {
			return fail(401, { error: 'Not that one.' });
		}

		cookies.set(SESSION_COOKIE, issueToken(), {
			...cookieOptions,
			// Allow http://localhost during development, where there is no TLS.
			secure: url.protocol === 'https:'
		});

		redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	}
};
